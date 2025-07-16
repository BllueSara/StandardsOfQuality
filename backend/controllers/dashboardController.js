const mysql = require('mysql2/promise');
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

// GET /api/dashboard/summary
async function getDashboardSummary(req, res) {
  try {
    // إجمالي الملفات وعدد كل حالة
    const [counts] = await db.execute(`
      SELECT
        COUNT(*) AS total,
        SUM(approval_status = 'approved') AS approved,
        SUM(approval_status = 'pending') AS pending,
        SUM(approval_status = 'rejected') AS rejected
      FROM contents
    `);
    // أحدث 10 ملفات
    const [latest] = await db.execute(`
      SELECT
        c.title,
        COALESCE(d.name, '-') AS department,
        c.approval_status,
        c.created_at,
        u.username AS user
      FROM contents c
      LEFT JOIN folders f ON c.folder_id = f.id
      LEFT JOIN departments d ON f.department_id = d.id
      LEFT JOIN users u ON c.created_by = u.id
      ORDER BY c.created_at DESC
      LIMIT 10
    `);
    // نسبة اكتمال الاعتمادات لكل قسم
    const [departments] = await db.execute('SELECT id, name FROM departments');
    const departmentCompletion = [];
    for (const dept of departments) {
      // عدد الملفات الكلي لهذا القسم
      const [totalRows] = await db.execute(
        `SELECT COUNT(*) AS total FROM contents c
         JOIN folders f ON c.folder_id = f.id
         WHERE f.department_id = ?`,
        [dept.id]
      );
      // عدد الملفات المعتمدة لهذا القسم
      const [approvedRows] = await db.execute(
        `SELECT COUNT(*) AS approved FROM contents c
         JOIN folders f ON c.folder_id = f.id
         WHERE f.department_id = ? AND c.approval_status = 'approved'`,
        [dept.id]
      );
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
    res.status(500).json({ status: 'error', message: 'خطأ في جلب ملخص الداشبورد' });
  }
}

module.exports = { getDashboardSummary }; 