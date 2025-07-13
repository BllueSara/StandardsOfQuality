// controllers/usersController.js
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'StandardOfQuality'
});
const { logAction } = require('../models/logger');
const { insertNotification } = require('../models/notfications-utils');

function getUserLang(req) {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    try {
      const token = auth.slice(7);
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      return payload.lang || 'ar';
    } catch (err) {
      return 'ar';
    }
  }
  return 'ar';
}

function getLocalizedName(nameField, lang) {
  if (!nameField) return '';
  // Check if it's already a parsed object
  if (typeof nameField === 'object' && nameField !== null) {
    return nameField[lang] || nameField['ar'] || '';
  }
  if (typeof nameField === 'string') {
    try {
      // Try to parse it as JSON
      const nameObj = JSON.parse(nameField);
      return nameObj[lang] || nameObj['ar'] || nameField;
    } catch (e) {
      // If parsing fails, return the original string
      return nameField;
    }
  }
  // For any other type, convert to string and return
  return String(nameField);
}

// 1) جلب كل المستخدمين
const getUsers = async (req, res) => {
  const departmentId = req.query.departmentId;

  try {
    let query = `
      SELECT 
        u.id,
        u.username AS name,
        u.email,
        u.role,
        u.status,  
        u.department_id AS departmentId,
        d.name AS departmentName,
        u.created_at,
        u.updated_at
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
    `;

    const params = [];

    if (departmentId) {
      query += ` WHERE u.department_id = ?`;
      params.push(departmentId);
    }

    query += ` ORDER BY u.created_at DESC`;

    const [rows] = await db.execute(query, params);

    res.status(200).json({
      status: 'success',
      data: rows
    });
  } catch (error) {
    res.status(500).json({ message: 'خطأ في جلب المستخدمين' });
  }
};


// 2) جلب مستخدم محدد
const getUserById = async (req, res) => {
  const id = req.params.id;
  try {
    const [rows] = await db.execute(
      `SELECT 
         u.id,
         u.username AS name,
         u.email,
         u.role,
         u.status,  
         u.department_id AS departmentId,
         d.name AS departmentName,
         u.employee_number,
         u.created_at,
         u.updated_at
       FROM users u
       LEFT JOIN departments d ON u.department_id = d.id
       WHERE u.id = ?`,
      [id]
    );
    if (!rows.length) {
      return res.status(404).json({ status:'error', message:'المستخدم غير موجود' });
    }
    res.status(200).json({
      status: 'success',
      data: rows[0]
    });
  } catch (error) {
    res.status(500).json({ message: 'خطأ في جلب المستخدم' });
  }
};

// 3) إضافة مستخدم جديد
const addUser = async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  }

  let payload;
  try {
    payload = jwt.verify(auth.slice(7), process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ status: 'error', message: 'Invalid token' });
  }
  const adminUserId = payload.id;
  const userLang = getUserLang(req);

  const { name, email, departmentId, password, role, employeeNumber } = req.body;
  console.log('🪵 بيانات قادمة:', req.body);

  if (!name || !email || !password || !role) {
    return res.status(400).json({ status: 'error', message: 'جميع الحقول مطلوبة' });
  }

  try {
    const [existingUser] = await db.execute(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );

    if (existingUser.length > 0) {
      return res.status(409).json({
        status: 'error',
        message: 'البريد الإلكتروني مستخدم بالفعل'
      });
    }

    // Fetch department details for logging
    let departmentName = null;
    if (departmentId) {
      const [[deptDetails]] = await db.execute(
        'SELECT name FROM departments WHERE id = ?',
        [departmentId]
      );
      departmentName = deptDetails ? deptDetails.name : null;
    }

    const hashed = await bcrypt.hash(password, 12);
    const cleanDeptId = departmentId && departmentId !== '' ? departmentId : null;

    const [result] = await db.execute(
  `INSERT INTO users (
    username, 
    email, 
    department_id, 
    password, 
    role,
    employee_number,
    created_at,
    updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
  [name, email, cleanDeptId, hashed, role, employeeNumber]
);

    // Add to logs
    const localizedDeptName = getLocalizedName(departmentName, userLang);
    const logDescription = {
      ar: `تم إضافة مستخدم جديد: ${name}`,
      en: `Added new user: ${name}`
    };
    
    await logAction(adminUserId, 'add_user', JSON.stringify(logDescription), 'user', result.insertId);

    res.status(201).json({
      status: 'success',
      message: 'تم إضافة المستخدم بنجاح',
      userId: result.insertId
    });
  } catch (error) {
    console.error('❌ Error in addUser:', error);
    res.status(500).json({ message: 'خطأ في إضافة المستخدم' });
  }
};

// 4) تعديل مستخدم
const updateUser = async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  }

  let payload;
  try {
    payload = jwt.verify(auth.slice(7), process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ status: 'error', message: 'Invalid token' });
  }
  const adminUserId = payload.id;
  const userLang = getUserLang(req);

  const id = req.params.id;
  const { name, email, departmentId, role } = req.body;

  if (!name || !email || !role) {
    return res.status(400).json({ status:'error', message:'الحقول الأساسية مطلوبة' });
  }

  try {
    // Fetch old user details for logging
    const [[oldUser]] = await db.execute(
      `SELECT u.username, u.email, u.role, u.department_id, u.employee_number, d.name as department_name
       FROM users u
       LEFT JOIN departments d ON u.department_id = d.id
       WHERE u.id = ?`,
      [id]
    );

    if (!oldUser) {
      return res.status(404).json({ status:'error', message:'المستخدم غير موجود' });
    }

    // التحقق من عدم وجود البريد الإلكتروني مع مستخدم آخر
    const [existingUser] = await db.execute(
      'SELECT id FROM users WHERE email = ? AND id != ?',
      [email, id]
    );

    if (existingUser.length > 0) {
      return res.status(409).json({ 
        status: 'error', 
        message: 'البريد الإلكتروني مستخدم بالفعل' 
      });
    }

    // Fetch new department details for logging
    let newDepartmentName = null;
    if (departmentId) {
      const [[deptDetails]] = await db.execute(
        'SELECT name FROM departments WHERE id = ?',
        [departmentId]
      );
      newDepartmentName = deptDetails ? deptDetails.name : null;
    }

    const [result] = await db.execute(
      `UPDATE users 
       SET username = ?, 
           email = ?, 
           department_id = ?, 
           role = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [name, email, departmentId || null, role, id]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ status:'error', message:'المستخدم غير موجود' });
    }

    // Add to logs
    const changesAr = [];
    const changesEn = [];
    if (name !== oldUser.username) {
      changesAr.push(`الاسم: '${oldUser.username}' ← '${name}'`);
      changesEn.push(`Name: '${oldUser.username}' → '${name}'`);
    }
    if (email !== oldUser.email) {
      changesAr.push(`البريد الإلكتروني: '${oldUser.email}' ← '${email}'`);
      changesEn.push(`Email: '${oldUser.email}' → '${email}'`);
    }
    if (req.body.employee_number !== undefined && req.body.employee_number !== oldUser.employee_number) {
      changesAr.push(`الرقم الوظيفي: '${oldUser.employee_number || ''}' ← '${req.body.employee_number || ''}'`);
      changesEn.push(`Employee Number: '${oldUser.employee_number || ''}' → '${req.body.employee_number || ''}'`);
    }
    if (role !== oldUser.role) {
      changesAr.push(`الدور: '${oldUser.role}' ← '${role}'`);
      changesEn.push(`Role: '${oldUser.role}' → '${role}'`);
    }
    if (departmentId !== oldUser.department_id) {
      const oldDeptNameAr = getLocalizedName(oldUser.department_name, 'ar');
      const newDeptNameAr = getLocalizedName(newDepartmentName, 'ar');
      const oldDeptNameEn = getLocalizedName(oldUser.department_name, 'en');
      const newDeptNameEn = getLocalizedName(newDepartmentName, 'en');
      changesAr.push(`القسم: '${oldDeptNameAr || 'لا يوجد'}' ← '${newDeptNameAr || 'لا يوجد'}'`);
      changesEn.push(`Department: '${oldDeptNameEn || 'None'}' → '${newDeptNameEn || 'None'}'`);
    }
    let logMessageAr, logMessageEn;
    if (changesAr.length > 0) {
      logMessageAr = `تم تعديل المستخدم '${oldUser.username}':\n${changesAr.join('\n')}`;
      logMessageEn = `Updated user '${oldUser.username}':\n${changesEn.join('\n')}`;
    } else {
      logMessageAr = `تم تعديل المستخدم '${oldUser.username}' (لا توجد تغييرات)`;
      logMessageEn = `Updated user '${oldUser.username}' (no changes)`;
    }
    // ✅ تسجيل اللوق بعد نجاح تعديل المستخدم
    try {
        const logDescription = {
            ar: logMessageAr,
            en: logMessageEn
        };
        await logAction(adminUserId, 'update_user', JSON.stringify(logDescription), 'user', id);
    } catch (logErr) {
        console.error('logAction error:', logErr);
    }

    res.status(200).json({ 
      status: 'success',
      message: 'تم تحديث بيانات المستخدم بنجاح'
    });
  } catch (error) {
    res.status(500).json({ message: 'خطأ في تعديل المستخدم' });
  }
};

// 5) حذف مستخدم
const deleteUser = async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  }

  let payload;
  try {
    payload = jwt.verify(auth.slice(7), process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ status: 'error', message: 'Invalid token' });
  }
  const adminUserId = payload.id;

  const id = req.params.id;
  try {
    // جلب تفاصيل المستخدم قبل الحذف للتسجيل
    const [[userDetails]] = await db.execute(
      'SELECT username FROM users WHERE id = ?',
      [id]
    );

    if (!userDetails) {
      return res.status(404).json({ status:'error', message:'المستخدم غير موجود' });
    }

    const [result] = await db.execute('DELETE FROM users WHERE id = ?', [id]);
    
    if (!result.affectedRows) {
      return res.status(404).json({ status:'error', message:'المستخدم غير موجود' });
    }

    // ✅ تسجيل اللوق بعد نجاح حذف المستخدم
    try {
        const logDescription = {
            ar: `تم حذف مستخدم: ${userDetails.username}`,
            en: `Deleted user: ${userDetails.username}`
        };
        
        await logAction(adminUserId, 'delete_user', JSON.stringify(logDescription), 'user', id);
    } catch (logErr) {
        console.error('logAction error:', logErr);
    }

    res.status(200).json({ 
      status: 'success',
      message: 'تم حذف المستخدم بنجاح'
    });

  } catch (error) {
    console.error('deleteUser error:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'فشل حذف المستخدم'
    });
  }
};


// 6) تغيير دور المستخدم
const changeUserRole = async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  }

  let payload;
  try {
    payload = jwt.verify(auth.slice(7), process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ status: 'error', message: 'Invalid token' });
  }
  const adminUserId = payload.id;
  const userLang = getUserLang(req);

  const id = req.params.id;
  const { role } = req.body;

  if (!role) {
    return res.status(400).json({ status:'error', message:'الدور مطلوب' });
  }

  try {
    // Fetch user details for logging
    const [[userDetails]] = await db.execute(
      'SELECT username, role as old_role FROM users WHERE id = ?',
      [id]
    );

    if (!userDetails) {
      return res.status(404).json({ status:'error', message:'المستخدم غير موجود' });
    }

    const [result] = await db.execute(
      'UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [role, id]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ status:'error', message:'المستخدم غير موجود' });
    }

    // Add to logs
    const logDescription = {
        ar: `تم تغيير دور المستخدم: ${userDetails.username} إلى: ${role}`,
        en: `Changed user role: ${userDetails.username} to: ${role}`
    };
    
    await logAction(adminUserId, 'change_role', JSON.stringify(logDescription), 'user', id);

    res.status(200).json({ 
      status: 'success',
      message: 'تم تغيير دور المستخدم بنجاح'
    });
  } catch (error) {
    res.status(500).json({ message: 'خطأ في تغيير الدور' });
  }
};

// 7) إعادة تعيين كلمة مرور (admin)
const adminResetPassword = async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  }

  let payload;
  try {
    payload = jwt.verify(auth.slice(7), process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ status: 'error', message: 'Invalid token' });
  }
  const adminUserId = payload.id;
  const userLang = getUserLang(req);

  const id = req.params.id;
  const { newPassword } = req.body;

  if (!newPassword) {
    return res.status(400).json({ status:'error', message:'كلمة المرور مطلوبة' });
  }

  try {
    // Fetch user details for logging
    const [[userDetails]] = await db.execute(
      'SELECT username FROM users WHERE id = ?',
      [id]
    );

    if (!userDetails) {
      return res.status(404).json({ status:'error', message:'المستخدم غير موجود' });
    }

    const hashed = await bcrypt.hash(newPassword, 12);
    const [result] = await db.execute(
      'UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [hashed, id]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ status:'error', message:'المستخدم غير موجود' });
    }

    // ✅ تسجيل اللوق بعد نجاح إعادة تعيين كلمة المرور
    try {
      const logDescription = {
        ar: `تم إعادة تعيين كلمة المرور للمستخدم: ${userDetails.username}`,
        en: `Reset password for user: ${userDetails.username}`
      };
      
      await logAction(adminUserId, 'reset_user_password', JSON.stringify(logDescription), 'user', id);
    } catch (logErr) {
      console.error('logAction error:', logErr);
    }

    res.status(200).json({ 
      status: 'success',
      message: 'تم إعادة تعيين كلمة المرور بنجاح'
    });
  } catch (error) {
    res.status(500).json({ message: 'خطأ في إعادة التعيين' });
  }
};

// 8) جلب الأدوار المتاحة
const getRoles = async (req, res) => {
  const roles = ['admin', 'sub-admin', 'user'];
  return res.status(200).json({ 
    status: 'success', 
    data: roles 
  });
};
const getLogs = async (req, res) => {
  try {
    const { from, to, action, user, search, lang } = req.query;
    const conditions = [];
    const params = [];

    if (from) {
      conditions.push('al.created_at >= ?');
      params.push(from);
    }
    if (to) {
      conditions.push('al.created_at <= ?');
      params.push(to);
    }
    if (action) {
      conditions.push('al.action = ?');
      params.push(action);
    }
    if (user) {
      conditions.push('u.username = ?');
      params.push(user);
    }
    if (search) {
      conditions.push('(al.action LIKE ? OR al.description LIKE ? OR u.username LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT
        al.id,
        u.username AS user,
        al.action,
        al.description,
        al.reference_type,
        al.reference_id,
        al.created_at
      FROM activity_logs al
      LEFT JOIN users u ON u.id = al.user_id
      ${whereClause}
      ORDER BY al.created_at DESC
      LIMIT 500
    `;

    const [rows] = await db.execute(sql, params);
    
    // دالة لمعالجة النصوص ثنائية اللغة
    function processBilingualText(text, userLanguage) {
      if (typeof text !== 'string') return text;
      
      // إذا كان النص يحتوي على JSON، حاول تحليله أولاً
      if (text.trim().startsWith('{') && text.trim().endsWith('}')) {
        try {
          const parsed = JSON.parse(text);
          return parsed[userLanguage] || parsed['ar'] || parsed['en'] || text;
        } catch (e) {
          // إذا فشل التحليل، اترك النص كما هو
        }
      }
      
      // البحث عن أنماط JSON مختلفة في النص
      const jsonPatterns = [
        /\{[^{}]*"ar"[^{}]*"en"[^{}]*\}/g,
        /\{[^{}]*"en"[^{}]*"ar"[^{}]*\}/g,
        /\{[^{}]*"ar"[^{}]*\}/g,
        /\{[^{}]*"en"[^{}]*\}/g
      ];
      
      let processedText = text;
      
      jsonPatterns.forEach(pattern => {
        const matches = processedText.match(pattern);
        if (matches) {
          matches.forEach(match => {
            try {
              const parsed = JSON.parse(match);
              const translatedText = parsed[userLanguage] || parsed['ar'] || parsed['en'] || match;
              processedText = processedText.replace(match, translatedText);
            } catch (e) {
              // إذا فشل التحليل، اترك النص كما هو
            }
          });
        }
      });
      
      return processedText;
    }
    
    // إضافة لغة المستخدم لكل سجل ومعالجة النصوص ثنائية اللغة
    const userLanguage = lang || 'ar';
    const logsWithLanguage = rows.map(log => {
      // معالجة النصوص ثنائية اللغة
      const processedUser = processBilingualText(log.user, userLanguage);
      let processedDescription = log.description; // لا تعالج الوصف هنا مبدئياً

      // لا تقم بمعالجة وصف الصلاحيات أو التفويض في الباك اند، دع الفرونت اند يعالجها
      if (!log.action.includes('permission') && !log.action.includes('delegate')) {
        processedDescription = processBilingualText(log.description, userLanguage);
      }
      
      // استخراج المعلومات من الوصف ومعالجتها
      const extractedInfo = extractInfoFromDescription(processedDescription);
      Object.keys(extractedInfo).forEach(key => {
        if (extractedInfo[key]) {
          extractedInfo[key] = processBilingualText(extractedInfo[key], userLanguage);
        }
      });
      
      return {
        ...log,
        user_language: userLanguage,
        user: processedUser,
        description: processedDescription,
        extracted_info: extractedInfo
      };
    });
    
    res.status(200).json({ status: 'success', data: logsWithLanguage });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching logs' });
  }
};

const getActionTypes = async (req, res) => {
  try {
    const sql = `
      SELECT DISTINCT action
      FROM activity_logs
      ORDER BY action ASC
    `;

    const [rows] = await db.execute(sql);
    
    res.status(200).json({ status: 'success', data: rows });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching action types' });
  }
};

const getNotifications = async (req, res) => {
  const userId = req.params.id;
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ status: 'error', message: 'Missing token' });

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
  res.status(500).json({ message: 'Error fetching notifications' });
    }

    const isAdmin = payload.role === 'admin';

    const query = isAdmin
      ? `
        SELECT 
          n.id,
          n.user_id,
          u.username AS user_name,
          n.title,
          n.message,
          n.is_read_by_admin AS is_read,
          n.created_at,
          n.type
        FROM notifications n
        LEFT JOIN users u ON u.id = n.user_id
        ORDER BY n.created_at DESC
      `
      : `
        SELECT 
          n.id,
          n.user_id,
          u.username AS user_name,
          n.title,
          n.message,
          n.is_read_by_user AS is_read,
          n.created_at,
          n.type
        FROM notifications n
        LEFT JOIN users u ON u.id = n.user_id
        WHERE n.user_id = ?
        ORDER BY n.created_at DESC
      `;

    const [rows] = await db.execute(query, isAdmin ? [] : [userId]);
    return res.status(200).json({ status: 'success', data: rows });
  } catch (error) {
      console.error('Error in getNotifications:', error); // أضف هذا السطر

    res.status(500).json({ message: 'Error fetching notifications' });
  }
};





/**
 * Mark a notification as read
 */



/**
 * Delete a notification
 */
const deleteNotification = async (req, res) => {
const notifId = req.params.nid;
  try {
    const [result] = await db.execute(
      'DELETE FROM notifications WHERE id = ?',
      [notifId]
    );
    if (!result.affectedRows) {
      return res.status(404).json({ status: 'error', message: 'الإشعار غير موجود' });
    }
    res.status(200).json({ status: 'success', message: 'تم حذف الإشعار' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting notification' });
  }
};
// controllers/usersController.js
const markAllAsRead = async (req, res) => {
  const userId = req.params.id;
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'غير مصرح' });
  }

  let decoded;
  try {
    decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ message: 'توكن غير صالح' });
  }

  const isAdmin = decoded.role === 'admin';

  try {
    await db.execute(
      isAdmin
        ? `UPDATE notifications SET is_read_by_admin = 1 WHERE is_read_by_admin = 0`
        : `UPDATE notifications SET is_read_by_user = 1 WHERE user_id = ? AND is_read_by_user = 0`,
      isAdmin ? [] : [userId]
    );

    res.status(200).json({ status: 'success', message: 'تم تحديث الإشعارات كمقروءة.' });
  } catch (err) {
    res.status(500).json({ message: 'Error marking as read' });
  }
};

// GET /api/users/:id/notifications/unread-count
const getUnreadCount = async (req, res) => {
  const userId = req.params.id;
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'غير مصرح' });
  }

  let decoded;
  try {
    decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ message: 'توكن غير صالح' });
  }

  const isAdmin = decoded.role === 'admin';

  try {
    const [rows] = await db.execute(
      isAdmin
        ? 'SELECT COUNT(*) AS count FROM notifications WHERE is_read_by_admin = 0'
        : 'SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read_by_user = 0',
      isAdmin ? [] : [userId]
    );
    res.status(200).json({ count: rows[0].count });
  } catch (err) {
    res.status(500).json({ message: 'Error getting unread count' });
  }
};


// دالة لاستخراج المعلومات من الوصف
function extractInfoFromDescription(description) {
  const info = {
    folderName: '',
    departmentName: '',
    oldName: '',
    newName: '',
    userName: '',
    newRole: '',
    contentName: ''
  };

  // استخراج اسم المجلد (عربي)
  const folderMatchAr = description.match(/مجلد باسم: ([^،]+)/);
  if (folderMatchAr) {
    info.folderName = folderMatchAr[1];
  }

  // استخراج اسم المجلد (إنجليزي)
  const folderMatchEn = description.match(/folder: ([^،]+)/i);
  if (folderMatchEn && !info.folderName) {
    info.folderName = folderMatchEn[1];
  }

  // استخراج اسم القسم (عربي)
  const deptMatchAr = description.match(/في قسم: ([^،]+)/);
  if (deptMatchAr) {
    info.departmentName = deptMatchAr[1];
  }

  // استخراج اسم القسم (إنجليزي)
  const deptMatchEn = description.match(/department: ([^،]+)/i);
  if (deptMatchEn && !info.departmentName) {
    info.departmentName = deptMatchEn[1];
  }

  // استخراج الأسماء القديمة والجديدة (للتعديل) - عربي
  const oldNewMatchAr = description.match(/من: ([^إ]+) إلى: ([^،]+)/);
  if (oldNewMatchAr) {
    info.oldName = oldNewMatchAr[1].trim();
    info.newName = oldNewMatchAr[2].trim();
  }

  // استخراج الأسماء القديمة والجديدة (للتعديل) - إنجليزي
  const oldNewMatchEn = description.match(/from: ([^t]+) to: ([^،]+)/i);
  if (oldNewMatchEn && !info.oldName) {
    info.oldName = oldNewMatchEn[1].trim();
    info.newName = oldNewMatchEn[2].trim();
  }

  // استخراج اسم المستخدم (عربي)
  const userMatchAr = description.match(/للمستخدم: ([^،]+)/);
  if (userMatchAr) {
    info.userName = userMatchAr[1];
  }

  // استخراج اسم المستخدم (إنجليزي)
  const userMatchEn = description.match(/user: ([^،]+)/i);
  if (userMatchEn && !info.userName) {
    info.userName = userMatchEn[1];
  }

  // استخراج الدور الجديد (عربي)
  const roleMatchAr = description.match(/إلى: ([^،]+)/);
  if (roleMatchAr) {
    info.newRole = roleMatchAr[1];
  }

  // استخراج الدور الجديد (إنجليزي)
  const roleMatchEn = description.match(/to: ([^،]+)/i);
  if (roleMatchEn && !info.newRole) {
    info.newRole = roleMatchEn[1];
  }

  // استخراج اسم المحتوى (عربي)
  const contentMatchAr = description.match(/محتوى: ([^،]+)/);
  if (contentMatchAr) {
    info.contentName = contentMatchAr[1];
  }

  // استخراج اسم المحتوى (إنجليزي)
  const contentMatchEn = description.match(/content: ([^،]+)/i);
  if (contentMatchEn && !info.contentName) {
    info.contentName = contentMatchEn[1];
  }

  return info;
}

//  … في أعلى الملف أضف هذه الدالة:
const updateUserStatus = async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  }

  let payload;
  try {
    payload = jwt.verify(auth.slice(7), process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ status: 'error', message: 'Invalid token' });
  }

  // فقط الـ admin يمكنه تغيير الحالة
  if (payload.role !== 'admin') {
    return res.status(403).json({ status: 'error', message: 'Forbidden' });
  }

  const id = req.params.id;
  const { status } = req.body;  // نتوقع 'active' أو 'inactive'
  if (!['active','inactive'].includes(status)) {
    return res.status(400).json({ status: 'error', message: 'حالة غير صحيحة' });
  }

  try {
    const [result] = await db.execute(
      'UPDATE users SET status = ? WHERE id = ?',
      [status, id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ status: 'error', message: 'المستخدم غير موجود' });
    }
    res.json({ status: 'success', message: 'تم تحديث الحالة بنجاح' });
  } catch (err) {
    console.error('updateUserStatus error:', err);
    res.status(500).json({ status: 'error', message: 'خطأ في تحديث الحالة' });
  }
};



module.exports = {
  getUsers,
  getUserById,
  addUser,
  updateUser,
  deleteUser,
  changeUserRole,
  adminResetPassword,
  getRoles,
  getLogs,
  getNotifications,
  deleteNotification,
  markAllAsRead,
  getUnreadCount,
  getActionTypes,
  updateUserStatus,

};
