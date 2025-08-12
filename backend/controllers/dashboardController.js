const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
const { getFullNameSQLWithAlias } = require('../models/userUtils');
require('dotenv').config();

const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

// مساعدة لجلب صلاحيات المستخدم
async function getUserPerms(userId) {
  const [rows] = await db.execute(`
    SELECT p.permission_key
    FROM permissions p
    JOIN user_permissions up ON up.permission_id = p.id
    WHERE up.user_id = ?
  `, [userId]);
  return new Set(rows.map(r => r.permission_key));
}

// دالة معالجة اسم القسم حسب اللغة
function getDepartmentNameByLanguage(departmentNameData, userLanguage = 'ar') {
  try {
    if (typeof departmentNameData === 'string' && departmentNameData.startsWith('{')) {
      const parsed = JSON.parse(departmentNameData);
      return parsed[userLanguage] || parsed['ar'] || parsed['en'] || departmentNameData;
    }
    if (typeof departmentNameData === 'object' && departmentNameData !== null) {
      return departmentNameData[userLanguage] || departmentNameData['ar'] || departmentNameData['en'] || JSON.stringify(departmentNameData);
    }
    return departmentNameData || 'غير معروف';
  } catch (error) {
    return departmentNameData || 'غير معروف';
  }
}

// دالة معالجة اسم اللجنة حسب اللغة
function getCommitteeNameByLanguage(committeeNameData, userLanguage = 'ar') {
  try {
    if (typeof committeeNameData === 'string' && committeeNameData.startsWith('{')) {
      const parsed = JSON.parse(committeeNameData);
      return parsed[userLanguage] || parsed['ar'] || parsed['en'] || committeeNameData;
    }
    if (typeof committeeNameData === 'object' && committeeNameData !== null) {
      return committeeNameData[userLanguage] || committeeNameData['ar'] || committeeNameData['en'] || JSON.stringify(committeeNameData);
    }
    return committeeNameData || 'غير معروف';
  } catch (error) {
    return String(committeeNameData) || 'غير معروف';
  }
}

// GET /api/dashboard/summary
async function getDashboardSummary(req, res) {
  try {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) {
      return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }
    const token = auth.slice(7);
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const userId = payload.id;
    const userRole = payload.role;

    const permsSet = await getUserPerms(userId);
    const canViewAll = (userRole === 'admin') || permsSet.has('view_dashboard');

    let sql, params = [];
    if (canViewAll) {
      sql = `
        SELECT
          COUNT(*) AS total,
          SUM(approval_status = 'approved') AS approved,
          SUM(approval_status = 'pending') AS pending,
          SUM(approval_status = 'rejected') AS rejected
        FROM contents
      `;
    } else {
      sql = `
        SELECT
          COUNT(*) AS total,
          SUM(approval_status = 'approved') AS approved,
          SUM(approval_status = 'pending') AS pending,
          SUM(approval_status = 'rejected') AS rejected
        FROM contents c
        JOIN folders f ON c.folder_id = f.id
        WHERE f.department_id IN (
          SELECT DISTINCT department_id 
          FROM user_departments 
          WHERE user_id = ?
        )
      `;
      params.push(userId);
    }

    const [counts] = await db.execute(sql, params);

    // أحدث 10 ملفات
    let latestSql, latestParams = [];
    if (canViewAll) {
      latestSql = `
        SELECT
          c.title,
          COALESCE(d.name, '-') AS department,
          c.approval_status,
          c.created_at,
          COALESCE(${getFullNameSQLWithAlias('u')}, u.username) AS user
        FROM contents c
        LEFT JOIN folders f ON c.folder_id = f.id
        LEFT JOIN departments d ON f.department_id = d.id
        LEFT JOIN users u ON c.created_by = u.id
        ORDER BY c.created_at DESC
        LIMIT 10
      `;
    } else {
      latestSql = `
        SELECT
          c.title,
          COALESCE(d.name, '-') AS department,
          c.approval_status,
          c.created_at,
          COALESCE(${getFullNameSQLWithAlias('u')}, u.username) AS user
        FROM contents c
        LEFT JOIN folders f ON c.folder_id = f.id
        LEFT JOIN departments d ON f.department_id = d.id
        LEFT JOIN users u ON c.created_by = u.id
        WHERE f.department_id IN (
          SELECT DISTINCT department_id 
          FROM user_departments 
          WHERE user_id = ?
        )
        ORDER BY c.created_at DESC
        LIMIT 10
      `;
      latestParams.push(userId);
    }

    const [latest] = await db.execute(latestSql, latestParams);

    // نسبة اكتمال الاعتمادات لكل قسم
    let deptSql, deptParams = [];
    if (canViewAll) {
      deptSql = 'SELECT id, name FROM departments';
    } else {
      deptSql = `
        SELECT DISTINCT d.id, d.name 
        FROM departments d
        JOIN user_departments ud ON d.id = ud.department_id
        WHERE ud.user_id = ?
      `;
      deptParams.push(userId);
    }

    const [departments] = await db.execute(deptSql, deptParams);
    const departmentCompletion = [];

    for (const dept of departments) {
      let totalSql, totalParams = [];
      let approvedSql, approvedParams = [];

      if (canViewAll) {
        totalSql = `
          SELECT COUNT(*) AS total FROM contents c
          JOIN folders f ON c.folder_id = f.id
          WHERE f.department_id = ?
        `;
        approvedSql = `
          SELECT COUNT(*) AS approved FROM contents c
          JOIN folders f ON c.folder_id = f.id
          WHERE f.department_id = ? AND c.approval_status = 'approved'
        `;
        totalParams = [dept.id];
        approvedParams = [dept.id];
      } else {
        totalSql = `
          SELECT COUNT(*) AS total FROM contents c
          JOIN folders f ON c.folder_id = f.id
          WHERE f.department_id = ? AND f.department_id IN (
            SELECT DISTINCT department_id 
            FROM user_departments 
            WHERE user_id = ?
          )
        `;
        approvedSql = `
          SELECT COUNT(*) AS approved FROM contents c
          JOIN folders f ON c.folder_id = f.id
          WHERE f.department_id = ? AND c.approval_status = 'approved' AND f.department_id IN (
            SELECT DISTINCT department_id 
            FROM user_departments 
            WHERE user_id = ?
          )
        `;
        totalParams = [dept.id, userId];
        approvedParams = [dept.id, userId];
      }

      const [totalRows] = await db.execute(totalSql, totalParams);
      const [approvedRows] = await db.execute(approvedSql, approvedParams);

      const total = totalRows[0].total;
      const approved = approvedRows[0].approved;
      const percent = total > 0 ? Math.round((approved / total) * 100) : 0;

      departmentCompletion.push({
        department: dept.name,
        total,
        approved,
        percent
      });
    }

    res.json({
      status: 'success',
      data: {
        total: counts[0].total,
        approved: counts[0].approved,
        pending: counts[0].pending,
        rejected: counts[0].rejected,
        latest: latest,
        departmentCompletion: departmentCompletion
      }
    });
  } catch (err) {
    console.error('getDashboardSummary error:', err);
    res.status(500).json({ status: 'error', message: 'خطأ في جلب ملخص الداشبورد' });
  }
}

// GET /api/dashboard/stats
async function getStats(req, res) {
  try {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) {
      return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }
    const token = auth.slice(7);
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const userId = payload.id;
    const userRole = payload.role;

    const permsSet = await getUserPerms(userId);
    const canViewAll = (userRole === 'admin') || permsSet.has('view_dashboard');

    // إحصائيات المحتويات
    let contentSql, contentParams = [];
    if (canViewAll) {
      contentSql = `
        SELECT
          COUNT(*) AS total_contents,
          SUM(approval_status = 'approved') AS approved_contents,
          SUM(approval_status = 'pending') AS pending_contents,
          SUM(approval_status = 'rejected') AS rejected_contents
        FROM contents
      `;
    } else {
      contentSql = `
        SELECT
          COUNT(*) AS total_contents,
          SUM(approval_status = 'approved') AS approved_contents,
          SUM(approval_status = 'pending') AS pending_contents,
          SUM(approval_status = 'rejected') AS rejected_contents
        FROM contents c
        JOIN folders f ON c.folder_id = f.id
        WHERE f.department_id IN (
          SELECT DISTINCT department_id 
          FROM user_departments 
          WHERE user_id = ?
        )
      `;
      contentParams.push(userId);
    }

    const [[contentStats]] = await db.execute(contentSql, contentParams);

    // إحصائيات المستخدمين
    const [[userStats]] = await db.execute(`
      SELECT COUNT(*) AS total_users,
             SUM(role = 'admin') AS admins
      FROM users
    `);

    // إحصائيات الأقسام
    let deptSql, deptParams = [];
    if (canViewAll) {
      deptSql = `
        SELECT COUNT(DISTINCT d.id) AS total_departments
        FROM departments d
      `;
    } else {
      deptSql = `
        SELECT COUNT(DISTINCT d.id) AS total_departments
        FROM departments d
        JOIN user_departments ud ON d.id = ud.department_id
        WHERE ud.user_id = ?
      `;
      deptParams.push(userId);
    }

    const [[deptStats]] = await db.execute(deptSql, deptParams);

    return res.status(200).json({
      status: 'success',
      data: {
        ...contentStats,
        ...userStats,
        ...deptStats
      }
    });

  } catch (err) {
    console.error('getStats error:', err);
    res.status(500).json({ message: 'Error getting dashboard stats.' });
  }
}

// GET /api/dashboard/closed-week
async function getClosedWeek(req, res) {
  try {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) {
      return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }
    const token = auth.slice(7);
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const userId = payload.id;
    const userRole = payload.role;

    const permsSet = await getUserPerms(userId);
    const canViewAll = (userRole === 'admin') || permsSet.has('view_dashboard');

    let sql, params = [];
    if (canViewAll) {
      sql = `
        SELECT DATE(c.created_at) AS date, COUNT(*) AS closed_count
        FROM contents c
        WHERE c.approval_status = 'approved'
          AND c.created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
        GROUP BY DATE(c.created_at)
        ORDER BY DATE(c.created_at) ASC
      `;
    } else {
      sql = `
        SELECT DATE(c.created_at) AS date, COUNT(*) AS closed_count
        FROM contents c
        JOIN folders f ON c.folder_id = f.id
        WHERE c.approval_status = 'approved'
          AND c.created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
          AND f.department_id IN (
            SELECT DISTINCT department_id 
            FROM user_departments 
            WHERE user_id = ?
          )
        GROUP BY DATE(c.created_at)
        ORDER BY DATE(c.created_at) ASC
      `;
      params.push(userId);
    }

    const [rows] = await db.execute(sql, params);
    return res.status(200).json({ status: 'success', data: rows });

  } catch (err) {
    console.error('getClosedWeek error:', err);
    res.status(500).json({ message: 'Error getting closed contents by week.' });
  }
}

// GET /api/dashboard/department-stats
async function getDepartmentStats(req, res) {
  try {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) {
      return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }
    const token = auth.slice(7);
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const userId = payload.id;
    const userRole = payload.role;

    const permsSet = await getUserPerms(userId);
    const canViewAll = (userRole === 'admin') || permsSet.has('view_dashboard');

    let sql, params = [];
    if (canViewAll) {
      sql = `
        SELECT
          d.name AS department_name,
          COUNT(c.id) AS total_contents,
          SUM(CASE WHEN c.approval_status = 'approved' THEN 1 ELSE 0 END) AS approved_contents,
          SUM(CASE WHEN c.approval_status = 'pending' THEN 1 ELSE 0 END) AS pending_contents,
          ROUND((SUM(CASE WHEN c.approval_status = 'approved' THEN 1 ELSE 0 END) / COUNT(c.id)) * 100, 1) AS approval_rate
        FROM departments d
        LEFT JOIN folders f ON f.department_id = d.id
        LEFT JOIN contents c ON c.folder_id = f.id
        GROUP BY d.id, d.name
        HAVING total_contents > 0
        ORDER BY approval_rate DESC, total_contents DESC
        LIMIT 10
      `;
    } else {
      sql = `
        SELECT
          d.name AS department_name,
          COUNT(c.id) AS total_contents,
          SUM(CASE WHEN c.approval_status = 'approved' THEN 1 ELSE 0 END) AS approved_contents,
          SUM(CASE WHEN c.approval_status = 'pending' THEN 1 ELSE 0 END) AS pending_contents,
          ROUND((SUM(CASE WHEN c.approval_status = 'approved' THEN 1 ELSE 0 END) / COUNT(c.id)) * 100, 1) AS approval_rate
        FROM departments d
        LEFT JOIN folders f ON f.department_id = d.id
        LEFT JOIN contents c ON c.folder_id = f.id
        WHERE d.id IN (
          SELECT DISTINCT department_id
          FROM user_departments
          WHERE user_id = ?
        )
        GROUP BY d.id, d.name
        HAVING total_contents > 0
        ORDER BY approval_rate DESC, total_contents DESC
        LIMIT 10
      `;
      params.push(userId);
    }

    const [rows] = await db.execute(sql, params);
    return res.status(200).json({ status: 'success', data: rows });

  } catch (err) {
    console.error('getDepartmentStats error:', err);
    res.status(500).json({ message: 'Error getting department statistics.' });
  }
}

// GET /api/dashboard/monthly-performance
async function getMonthlyPerformance(req, res) {
  try {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) {
      return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }
    const token = auth.slice(7);
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const userId = payload.id;
    const userRole = payload.role;

    const permsSet = await getUserPerms(userId);
    const canViewAll = (userRole === 'admin') || permsSet.has('view_dashboard');

    let sql, params = [];
    if (canViewAll) {
      sql = `
        SELECT 
          DATE_FORMAT(c.created_at, '%Y-%m') AS month,
          COUNT(c.id) AS total_contents,
          SUM(CASE WHEN c.approval_status = 'approved' THEN 1 ELSE 0 END) AS approved_contents,
          SUM(CASE WHEN c.approval_status = 'pending' THEN 1 ELSE 0 END) AS pending_contents,
          ROUND((SUM(CASE WHEN c.approval_status = 'approved' THEN 1 ELSE 0 END) / COUNT(c.id)) * 100, 1) AS approval_rate
        FROM contents c
        WHERE c.created_at >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
        GROUP BY DATE_FORMAT(c.created_at, '%Y-%m')
        ORDER BY month ASC
      `;
    } else {
      sql = `
        SELECT 
          DATE_FORMAT(c.created_at, '%Y-%m') AS month,
          COUNT(c.id) AS total_contents,
          SUM(CASE WHEN c.approval_status = 'approved' THEN 1 ELSE 0 END) AS approved_contents,
          SUM(CASE WHEN c.approval_status = 'pending' THEN 1 ELSE 0 END) AS pending_contents,
          ROUND((SUM(CASE WHEN c.approval_status = 'approved' THEN 1 ELSE 0 END) / COUNT(c.id)) * 100, 1) AS approval_rate
        FROM contents c
        JOIN folders f ON c.folder_id = f.id
        WHERE c.created_at >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
          AND f.department_id IN (
            SELECT DISTINCT department_id 
            FROM user_departments 
            WHERE user_id = ?
          )
        GROUP BY DATE_FORMAT(c.created_at, '%Y-%m')
        ORDER BY month ASC
      `;
      params.push(userId);
    }

    const [rows] = await db.execute(sql, params);
    return res.status(200).json({ status: 'success', data: rows });

  } catch (err) {
    console.error('getMonthlyPerformance error:', err);
    res.status(500).json({ message: 'Error getting monthly performance.' });
  }
}

// GET /api/dashboard/export-excel
async function exportDashboardExcel(req, res) {
  try {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) {
      return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }
    const token = auth.slice(7);
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const userId = payload.id;
    const userRole = payload.role;

    const permsSet = await getUserPerms(userId);
    const canViewAll = (userRole === 'admin') || permsSet.has('view_dashboard');

    // جلب البيانات الإحصائية
    let statsSql, statsParams = [];
    if (canViewAll) {
      statsSql = `
        SELECT
          COUNT(*) AS total,
          SUM(approval_status = 'approved') AS approved,
          SUM(approval_status = 'pending') AS pending,
          SUM(approval_status = 'rejected') AS rejected
        FROM contents
      `;
    } else {
      statsSql = `
        SELECT
          COUNT(*) AS total,
          SUM(approval_status = 'approved') AS approved,
          SUM(approval_status = 'pending') AS pending,
          SUM(approval_status = 'rejected') AS rejected
        FROM contents c
        JOIN folders f ON c.folder_id = f.id
        WHERE f.department_id IN (
          SELECT DISTINCT department_id 
          FROM user_departments 
          WHERE user_id = ?
        )
      `;
      statsParams.push(userId);
    }

    const [statsRows] = await db.execute(statsSql, statsParams);
    const stats = statsRows[0];

    // جلب إحصائيات المستخدمين
    const [[userStats]] = await db.execute(`
      SELECT COUNT(*) AS total_users,
             SUM(role = 'admin') AS admins
      FROM users
    `);

    // جلب إحصائيات الأقسام
    let deptSql, deptParams = [];
    if (canViewAll) {
      deptSql = `
        SELECT 
          d.name AS department_name,
          COUNT(c.id) AS total_contents,
          SUM(CASE WHEN c.approval_status = 'approved' THEN 1 ELSE 0 END) AS approved_contents,
          SUM(CASE WHEN c.approval_status = 'pending' THEN 1 ELSE 0 END) AS pending_contents,
          ROUND((SUM(CASE WHEN c.approval_status = 'approved' THEN 1 ELSE 0 END) / COUNT(c.id)) * 100, 1) AS approval_rate
        FROM departments d
        LEFT JOIN folders f ON f.department_id = d.id
        LEFT JOIN contents c ON c.folder_id = f.id
        GROUP BY d.id, d.name
        HAVING total_contents > 0
        ORDER BY approval_rate DESC, total_contents DESC
        LIMIT 10
      `;
    } else {
      deptSql = `
        SELECT 
          d.name AS department_name,
          COUNT(c.id) AS total_contents,
          SUM(CASE WHEN c.approval_status = 'approved' THEN 1 ELSE 0 END) AS approved_contents,
          SUM(CASE WHEN c.approval_status = 'pending' THEN 1 ELSE 0 END) AS pending_contents,
          ROUND((SUM(CASE WHEN c.approval_status = 'approved' THEN 1 ELSE 0 END) / COUNT(c.id)) * 100, 1) AS approval_rate
        FROM departments d
        LEFT JOIN folders f ON f.department_id = d.id
        LEFT JOIN contents c ON c.folder_id = f.id
        WHERE d.id IN (
          SELECT DISTINCT department_id 
          FROM user_departments 
          WHERE user_id = ?
        )
        GROUP BY d.id, d.name
        HAVING total_contents > 0
        ORDER BY approval_rate DESC, total_contents DESC
        LIMIT 10
      `;
      deptParams.push(userId);
    }

    const [departmentStatsRows] = await db.execute(deptSql, deptParams);

    // جلب الأداء الشهري
    let monthlySql, monthlyParams = [];
    if (canViewAll) {
      monthlySql = `
        SELECT 
          DATE_FORMAT(c.created_at, '%Y-%m') AS month,
          COUNT(c.id) AS total_contents,
          SUM(CASE WHEN c.approval_status = 'approved' THEN 1 ELSE 0 END) AS approved_contents,
          SUM(CASE WHEN c.approval_status = 'pending' THEN 1 ELSE 0 END) AS pending_contents,
          ROUND((SUM(CASE WHEN c.approval_status = 'approved' THEN 1 ELSE 0 END) / COUNT(c.id)) * 100, 1) AS approval_rate
        FROM contents c
        WHERE c.created_at >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
        GROUP BY DATE_FORMAT(c.created_at, '%Y-%m')
        ORDER BY month ASC
      `;
    } else {
      monthlySql = `
        SELECT 
          DATE_FORMAT(c.created_at, '%Y-%m') AS month,
          COUNT(c.id) AS total_contents,
          SUM(CASE WHEN c.approval_status = 'approved' THEN 1 ELSE 0 END) AS approved_contents,
          SUM(CASE WHEN c.approval_status = 'pending' THEN 1 ELSE 0 END) AS pending_contents,
          ROUND((SUM(CASE WHEN c.approval_status = 'approved' THEN 1 ELSE 0 END) / COUNT(c.id)) * 100, 1) AS approval_rate
        FROM contents c
        JOIN folders f ON c.folder_id = f.id
        WHERE c.created_at >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
          AND f.department_id IN (
            SELECT DISTINCT department_id 
            FROM user_departments 
            WHERE user_id = ?
          )
        GROUP BY DATE_FORMAT(c.created_at, '%Y-%m')
        ORDER BY month ASC
      `;
      monthlyParams.push(userId);
    }

    const [monthlyStatsRows] = await db.execute(monthlySql, monthlyParams);

    // جلب بيانات الأسبوع
    let weekSql, weekParams = [];
    if (canViewAll) {
      weekSql = `
        SELECT DATE(c.created_at) AS date, COUNT(*) AS closed_count
        FROM contents c
        WHERE c.approval_status = 'approved'
          AND c.created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
        GROUP BY DATE(c.created_at)
        ORDER BY DATE(c.created_at) ASC
      `;
    } else {
      weekSql = `
        SELECT DATE(c.created_at) AS date, COUNT(*) AS closed_count
        FROM contents c
        JOIN folders f ON c.folder_id = f.id
        WHERE c.approval_status = 'approved'
          AND c.created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
          AND f.department_id IN (
            SELECT DISTINCT department_id 
            FROM user_departments 
            WHERE user_id = ?
          )
        GROUP BY DATE(c.created_at)
        ORDER BY DATE(c.created_at) ASC
      `;
      weekParams.push(userId);
    }

    const [weekRows] = await db.execute(weekSql, weekParams);

    // إنشاء ملف Excel
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    
    // ورقة الإحصائيات العامة
    const statsSheet = workbook.addWorksheet('التقرير العام');
    
    // إضافة العنوان الرئيسي
    const titleRow = statsSheet.addRow(['تقرير لوحة التحكم - نظام إدارة الجودة']);
    titleRow.height = 40;
    titleRow.font = { bold: true, size: 18, color: { argb: 'FF2E86AB' } };
    titleRow.alignment = { horizontal: 'center', vertical: 'middle' };
    statsSheet.mergeCells('A1:D1');
    
    // إضافة التاريخ
    const dateRow = statsSheet.addRow([`تاريخ التقرير: ${new Date().toLocaleDateString('ar-SA')}`]);
    dateRow.font = { size: 12, color: { argb: 'FF666666' } };
    dateRow.alignment = { horizontal: 'right' };
    statsSheet.mergeCells('A2:D2');
    
    // إضافة مسافة
    statsSheet.addRow([]);
    
    // إحصائيات المحتويات
    const contentTitleRow = statsSheet.addRow(['إحصائيات المحتويات']);
    contentTitleRow.font = { bold: true, size: 16, color: { argb: 'FF2E86AB' } };
    contentTitleRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE8F4FD' }
    };
    statsSheet.mergeCells('A4:D4');
    
    // رؤوس الأعمدة للمحتويات
    const contentHeaders = statsSheet.addRow(['إجمالي المحتويات', 'المعتمدة', 'بانتظار الاعتماد', 'المرفوضة']);
    contentHeaders.font = { bold: true, size: 12 };
    contentHeaders.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF0F8FF' }
    };
    
    // بيانات المحتويات
    const contentData = statsSheet.addRow([
      stats.total || 0,
      stats.approved || 0,
      stats.pending || 0,
      stats.rejected || 0
    ]);
    contentData.font = { size: 14, bold: true };
    contentData.alignment = { horizontal: 'center' };
    
    // إضافة مسافة
    statsSheet.addRow([]);
    statsSheet.addRow([]);
    
    // إحصائيات المستخدمين
    const usersTitleRow = statsSheet.addRow(['إحصائيات المستخدمين']);
    usersTitleRow.font = { bold: true, size: 16, color: { argb: 'FF2E86AB' } };
    usersTitleRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE8F4FD' }
    };
    statsSheet.mergeCells('A8:D8');
    
    const usersHeaders = statsSheet.addRow(['إجمالي المستخدمين', 'عدد المشرفين']);
    usersHeaders.font = { bold: true, size: 12 };
    usersHeaders.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF0F8FF' }
    };
    
    const usersData = statsSheet.addRow([
      userStats.total_users || 0,
      userStats.admins || 0
    ]);
    usersData.font = { size: 14, bold: true };
    usersData.alignment = { horizontal: 'center' };
    
    // ضبط عرض الأعمدة
    statsSheet.columns.forEach(column => {
      column.width = 35;
    });
    
    // إضافة حدود للخلايا
    for (let i = 1; i <= statsSheet.rowCount; i++) {
      const row = statsSheet.getRow(i);
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });
    }
    
    // ورقة إحصائيات الأقسام
    const departmentSheet = workbook.addWorksheet('إحصائيات الأقسام');
    
    // إضافة عنوان
    const deptTitleRow = departmentSheet.addRow(['إحصائيات الأقسام - تحليل المحتويات والاعتماد']);
    deptTitleRow.font = { bold: true, size: 18, color: { argb: 'FF2E86AB' } };
    deptTitleRow.alignment = { horizontal: 'center' };
    departmentSheet.mergeCells('A1:F1');
    
    // إضافة مسافة
    departmentSheet.addRow([]);
    
    // رؤوس الأعمدة
    const deptHeaders = departmentSheet.addRow([
      'اسم القسم',
      'إجمالي المحتويات',
      'المحتويات المعتمدة',
      'المحتويات بانتظار الاعتماد',
      'معدل الاعتماد (%)',
      'التقييم'
    ]);
    deptHeaders.font = { bold: true, size: 12 };
    deptHeaders.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF0F8FF' }
    };
    
    // بيانات الأقسام
    departmentStatsRows.forEach(row => {
      const rate = parseFloat(row.approval_rate) || 0;
      let evaluation = '';
      if (rate >= 80) evaluation = 'ممتاز';
      else if (rate >= 60) evaluation = 'جيد';
      else if (rate >= 40) evaluation = 'مقبول';
      else evaluation = 'يحتاج تحسين';
      
      departmentSheet.addRow([
        getDepartmentNameByLanguage(row.department_name, 'ar'),
        row.total_contents,
        row.approved_contents,
        row.pending_contents,
        `${rate}%`,
        evaluation
      ]);
    });
    
    // تنسيق ورقة الأقسام
    departmentSheet.columns.forEach(column => {
      column.width = 20;
    });
    
    // إضافة حدود للخلايا
    for (let i = 1; i <= departmentSheet.rowCount; i++) {
      const row = departmentSheet.getRow(i);
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });
    }

    // ورقة الأداء الشهري
    const monthlySheet = workbook.addWorksheet('الأداء الشهري');
    
    // إضافة عنوان
    const monthTitleRow = monthlySheet.addRow(['الأداء الشهري - تحليل المحتويات على مدار 6 أشهر']);
    monthTitleRow.font = { bold: true, size: 18, color: { argb: 'FF2E86AB' } };
    monthTitleRow.alignment = { horizontal: 'center' };
    monthlySheet.mergeCells('A1:E1');
    
    // إضافة مسافة
    monthlySheet.addRow([]);
    
    // رؤوس الأعمدة
    const monthHeaders = monthlySheet.addRow([
      'الشهر',
      'إجمالي المحتويات',
      'المحتويات المعتمدة',
      'المحتويات بانتظار الاعتماد',
      'معدل الاعتماد (%)'
    ]);
    monthHeaders.font = { bold: true, size: 12 };
    monthHeaders.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF0F8FF' }
    };
    
    // بيانات الأداء الشهري
    monthlyStatsRows.forEach(row => {
      const total = row.total_contents || 0;
      const approved = row.approved_contents || 0;
      const rate = total > 0 ? ((approved / total) * 100).toFixed(1) : 0;
      
      // تنسيق الشهر
      const [year, month] = row.month.split('-');
      const monthName = new Date(year, month - 1).toLocaleDateString('ar-SA', { 
        year: 'numeric', 
        month: 'long' 
      });
      
      monthlySheet.addRow([
        monthName,
        total,
        approved,
        row.pending_contents || 0,
        `${rate}%`
      ]);
    });
    
    // تنسيق ورقة الأداء الشهري
    monthlySheet.columns.forEach(column => {
      column.width = 22;
    });
    
    // إضافة حدود للخلايا
    for (let i = 1; i <= monthlySheet.rowCount; i++) {
      const row = monthlySheet.getRow(i);
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });
    }
    
    // إرسال الملف
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=dashboard-report-${new Date().toISOString().split('T')[0]}.xlsx`);
    
    await workbook.xlsx.write(res);
    res.end();

  } catch (err) {
    console.error('خطأ في تصدير التقرير:', err);
    res.status(500).json({ message: 'خطأ في تصدير التقرير' });
  }
}

module.exports = { 
  getDashboardSummary, 
  getStats, 
  getClosedWeek, 
  exportDashboardExcel, 
  getDepartmentStats, 
  getMonthlyPerformance 
}; 