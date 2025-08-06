// controllers/usersController.js
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const ExcelJS = require('exceljs');
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
         u.username,
         u.email,
         u.role,
         u.status,  
         u.department_id AS departmentId,
         d.name AS departmentName,
         u.employee_number,
         u.job_title_id,
         jt.title AS job_title,
         u.first_name,
         u.second_name,
         u.third_name,
         u.last_name,
         u.created_at,
         u.updated_at
       FROM users u
       LEFT JOIN departments d ON u.department_id = d.id
       LEFT JOIN job_titles jt ON u.job_title_id = jt.id
       WHERE u.id = ?`,
      [id]
    );
    
    
    if (!rows.length) {
      return res.status(404).json({ status:'error', message:'المستخدم غير موجود' });
    }
    
    const userData = rows[0];
    
    // بناء الاسم الكامل من الأجزاء
    const buildFullName = (firstName, secondName, thirdName, lastName) => {
      const nameParts = [firstName, secondName, thirdName, lastName].filter(part => part && part.trim());
      return nameParts.join(' ');
    };
    
    // إضافة الاسم الكامل أو اليوزرنيم كـ name
    const fullName = buildFullName(
      userData.first_name,
      userData.second_name,
      userData.third_name,
      userData.last_name
    );
    
    userData.name = fullName || userData.username;
    
    res.status(200).json({
      status: 'success',
      data: userData
    });
  } catch (error) {
    console.error('❌ خطأ في جلب المستخدم:', error);
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

  const { first_name, second_name, third_name, last_name, name, email, departmentId, password, role, employeeNumber, job_title_id } = req.body;
  console.log('🪵 بيانات قادمة:', req.body);

  if (!name || !first_name || !last_name || !email || !password || !role) {
    return res.status(400).json({ status: 'error', message: 'اسم المستخدم والاسم الأول واسم العائلة والبريد الإلكتروني وكلمة المرور والدور مطلوبة' });
  }

  try {
    // التحقق من البريد الإلكتروني فقط إذا كان موجوداً
    if (email && email.trim()) {
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

    // بناء الاسم الكامل من الأسماء
    const names = [first_name, second_name, third_name, last_name].filter(name => name);
    const fullName = names.join(' ');

    const [result] = await db.execute(
  `INSERT INTO users (
    username, 
    email, 
    department_id, 
    password, 
    role,
    employee_number,
    job_title_id,
    first_name,
    second_name,
    third_name,
    last_name,
    created_at,
    updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
  [name, email, cleanDeptId, hashed, role, employeeNumber, job_title_id, first_name, second_name || null, third_name || null, last_name]
);

    // Add to logs
    const localizedDeptName = getLocalizedName(departmentName, userLang);
    const logDescription = {
      ar: `تم إضافة مستخدم جديد: ${fullName}`,
      en: `Added new user: ${fullName}`
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
  const { first_name, second_name, third_name, last_name, name, email, departmentId, role, employee_number, job_title_id } = req.body;

  // للادمن: فقط الاسم الأول واسم العائلة واسم المستخدم والدور مطلوبة
  // للمستخدمين الآخرين: جميع الحقول مطلوبة
  if (role === 'admin') {
    if (!name || !first_name || !last_name || !role) {
      return res.status(400).json({ status:'error', message:'اسم المستخدم والاسم الأول واسم العائلة والدور مطلوبة للادمن' });
    }
  } else {
    if (!name || !first_name || !last_name || !email || !role) {
      return res.status(400).json({ status:'error', message:'اسم المستخدم والاسم الأول واسم العائلة والبريد الإلكتروني والدور مطلوبة' });
    }
  }

  try {
    // Fetch old user details for logging
    const [[oldUser]] = await db.execute(
      `SELECT u.username, u.email, u.role, u.department_id, u.employee_number, u.job_title_id, jt.title AS job_title, u.first_name, u.second_name, u.third_name, u.last_name, d.name as department_name
       FROM users u
       LEFT JOIN departments d ON u.department_id = d.id
       LEFT JOIN job_titles jt ON u.job_title_id = jt.id
       WHERE u.id = ?`,
      [id]
    );

    if (!oldUser) {
      return res.status(404).json({ status:'error', message:'المستخدم غير موجود' });
    }

    // التحقق من عدم وجود البريد الإلكتروني مع مستخدم آخر (فقط إذا كان موجوداً)
    if (email && email.trim()) {
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

    // بناء الاسم الكامل من الأسماء
    const names = [first_name, second_name, third_name, last_name].filter(name => name);
    const fullName = names.join(' ');

    const [result] = await db.execute(
      `UPDATE users 
       SET username = ?, 
           email = ?, 
           department_id = ?, 
           role = ?,
           employee_number = ?,
           job_title_id = ?,
           first_name = ?,
           second_name = ?,
           third_name = ?,
           last_name = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [name, email, departmentId || null, role, employee_number, job_title_id, first_name, second_name || null, third_name || null, last_name, id]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ status:'error', message:'المستخدم غير موجود' });
    }

    // Add to logs
    const changesAr = [];
    const changesEn = [];
    if (name !== oldUser.username) {
      changesAr.push(`اسم المستخدم: '${oldUser.username}' ← '${name}'`);
      changesEn.push(`Username: '${oldUser.username}' → '${name}'`);
    }
    if (first_name !== oldUser.first_name) {
      changesAr.push(`الاسم الأول: '${oldUser.first_name || ''}' ← '${first_name}'`);
      changesEn.push(`First Name: '${oldUser.first_name || ''}' → '${first_name}'`);
    }
    if (second_name !== oldUser.second_name) {
      changesAr.push(`الاسم الثاني: '${oldUser.second_name || ''}' ← '${second_name || ''}'`);
      changesEn.push(`Second Name: '${oldUser.second_name || ''}' → '${second_name || ''}'`);
    }
    if (third_name !== oldUser.third_name) {
      changesAr.push(`الاسم الثالث: '${oldUser.third_name || ''}' ← '${third_name || ''}'`);
      changesEn.push(`Third Name: '${oldUser.third_name || ''}' → '${third_name || ''}'`);
    }
    if (last_name !== oldUser.last_name) {
      changesAr.push(`اسم العائلة: '${oldUser.last_name || ''}' ← '${last_name}'`);
      changesEn.push(`Last Name: '${oldUser.last_name || ''}' → '${last_name}'`);
    }
    if (email !== oldUser.email) {
      changesAr.push(`البريد الإلكتروني: '${oldUser.email}' ← '${email}'`);
      changesEn.push(`Email: '${oldUser.email}' → '${email}'`);
    }
    if (req.body.employee_number !== undefined && req.body.employee_number !== oldUser.employee_number) {
      changesAr.push(`الرقم الوظيفي: '${oldUser.employee_number || ''}' ← '${req.body.employee_number || ''}'`);
      changesEn.push(`Employee Number: '${oldUser.employee_number || ''}' → '${req.body.employee_number || ''}'`);
    }
    if (req.body.job_title_id !== undefined && req.body.job_title_id !== oldUser.job_title_id) {
      changesAr.push(`المسمى الوظيفي: '${oldUser.job_title || ''}' ← '${req.body.job_title_id || ''}'`);
      changesEn.push(`Job Title: '${oldUser.job_title || ''}' → '${req.body.job_title_id || ''}'`);
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
      logMessageEn = `Updated user '${oldUser.username}' (no changes)`;
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
                    n.message_data,         -- أضف هذا السطر

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
                    n.message_data,         -- أضف هذا السطر

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

// جلب مدير المستشفى فقط
const getHospitalManager = async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT id, username AS name, email, role FROM users WHERE role = 'hospital_manager' LIMIT 1`
    );
    if (!rows.length) {
      return res.status(404).json({ status: 'error', message: 'مدير المستشفى غير موجود' });
    }
    res.status(200).json({ status: 'success', data: rows[0] });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'خطأ في جلب مدير المستشفى' });
  }
};

// دالة آمنة لتحويل أي تسلسل إلى مصفوفة أرقام
function safeParseSequence(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val.map(Number).filter(x => !isNaN(x));
  if (typeof val !== 'string') val = String(val);
  val = val.trim();
  // إذا كان نص JSON array حقيقي
  if (val.startsWith('[') && val.endsWith(']')) {
    try {
      const arr = JSON.parse(val);
      return Array.isArray(arr) ? arr.map(Number).filter(x => !isNaN(x)) : [];
    } catch {
      // إذا فشل، جرب الطريقة القديمة
    }
  }
  // الطريقة القديمة (إزالة الأقواس والاقتباسات)
  let cleaned = val.replace(/\\[|\\]|'|\"/g, '').trim();
  return cleaned.split(',').map(x => Number(String(x).trim())).filter(x => !isNaN(x));
}

// دالة تصحيح نص التسلسل ليكون JSON صالح (من approvalController.js)
function fixSequenceString(str) {
  if (typeof str !== 'string') return str;
  if (str.includes("'")) {
    str = str.replace(/'/g, '"');
  }
  return str.trim();
}


// سحب المستخدم من تسلسل الاعتماد لملفات محددة
const revokeUserFromFiles = async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const { fileIds } = req.body;
  // جلب بيانات المستخدم الذي قام بالسحب
  const auth = req.headers.authorization;
  let performedBy = null;
  if (auth?.startsWith('Bearer ')) {
    try {
      const token = auth.slice(7);
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      performedBy = payload.id;
    } catch {}
  }
  if (!Array.isArray(fileIds) || !fileIds.length) {
    return res.status(400).json({ status: 'error', message: 'حدد الملفات المراد سحبها' });
  }
  try {
    for (const fileId of fileIds) {
      const [[content]] = await db.execute(
        'SELECT custom_approval_sequence, folder_id, title FROM contents WHERE id = ?',
        [fileId]
      );
      let sequence = [];
      if (content && content.custom_approval_sequence) {
        sequence = safeParseSequence(content.custom_approval_sequence);
      } else {
        const [[folder]] = await db.execute(
          'SELECT department_id FROM folders WHERE id = ?',
          [content.folder_id]
        );
        const [[dept]] = await db.execute(
          'SELECT approval_sequence FROM departments WHERE id = ?',
          [folder.department_id]
        );
        let seqRaw = dept && dept.approval_sequence ? dept.approval_sequence : [];
        console.log('seqRaw من القاعدة:', seqRaw, 'typeof:', typeof seqRaw);
        if (typeof seqRaw === 'string') {
          const fixed = fixSequenceString(seqRaw);
          console.log('بعد fixSequenceString:', fixed);
          seqRaw = fixed;
        }
        try {
          sequence = Array.isArray(seqRaw) ? seqRaw : JSON.parse(seqRaw);
          console.log('sequence بعد JSON.parse:', sequence);
        } catch (e) {
          console.log('خطأ في JSON.parse:', e, 'seqRaw:', seqRaw);
          sequence = [];
        }
      }
      const newSequence = sequence.filter(uid => Number(uid) !== Number(userId));
      console.log('سحب ملف:', fileId, 'قبل:', sequence, 'بعد:', newSequence, 'userId:', userId);
      const [updateResult] = await db.execute(
        'UPDATE contents SET custom_approval_sequence = ? WHERE id = ?',
        [JSON.stringify(newSequence), fileId]
      );
      console.log('تحديث الملف:', fileId, 'custom_approval_sequence:', JSON.stringify(newSequence), 'نتيجة:', updateResult);
      // سجل العملية في اللوقز
      if (performedBy) {
        const logDescription = {
          ar: `تم سحب المستخدم ذو المعرف ${userId} من تسلسل الاعتماد للملف: ${content.title}`,
          en: `User with ID ${userId} was revoked from approval sequence for file: ${content.title}`
        };
        await logAction(performedBy, 'revoke_user_from_file', JSON.stringify(logDescription), 'content', fileId);
      }
    }
    res.json({ status: 'success', message: 'تم سحب المستخدم من الملفات المحددة' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: 'خطأ أثناء السحب' });
  }
};

// جلب الملفات التي المستخدم في تسلسل اعتمادها
const getUserApprovalSequenceFiles = async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId)) return res.status(400).json({ status: 'error', message: 'معرّف المستخدم غير صالح' });
  try {
    const [rows] = await db.execute(`
      SELECT c.id, c.title, c.custom_approval_sequence, d.approval_sequence
      FROM contents c
      JOIN folders f ON c.folder_id = f.id
      JOIN departments d ON f.department_id = d.id
    `);
    // فلترة الملفات التي المستخدم في تسلسلها فعلاً
    const userIdNum = Number(userId);
    const filtered = rows.filter(row => {
      const seqCustom = safeParseSequence(row.custom_approval_sequence);
      let seqApproval = row.approval_sequence;
      if (typeof seqApproval === 'string') seqApproval = fixSequenceString(seqApproval);
      let seq = (seqCustom.length > 0) ? seqCustom : [];
      if (seq.length === 0) {
        try {
          seq = Array.isArray(seqApproval) ? seqApproval : JSON.parse(seqApproval);
        } catch { seq = []; }
      }
      return Array.isArray(seq) && seq.some(x => Number(x) === userIdNum);
    }).map(row => ({ id: row.id, title: row.title }));
    res.json({ status: 'success', data: filtered });
  } catch (err) {
    res.status(500).json({ status: 'error', message: 'خطأ في جلب الملفات' });
  }
};

// حذف سجل واحد
const deleteLog = async (req, res) => {
  try {
    const { id } = req.params;
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ message: 'غير مصرح' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.id;

    // التحقق من وجود السجل
    const [logRows] = await db.execute('SELECT * FROM activity_logs WHERE id = ?', [id]);
    
    if (logRows.length === 0) {
      return res.status(404).json({ message: 'السجل غير موجود' });
    }

    // حذف السجل
    const [result] = await db.execute('DELETE FROM activity_logs WHERE id = ?', [id]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'فشل في حذف السجل' });
    }

    res.json({ 
      status: 'success', 
      message: 'تم حذف السجل بنجاح' 
    });
  } catch (error) {
    console.error('Error deleting log:', error);
    res.status(500).json({ message: 'خطأ في حذف السجل' });
  }
};

// حذف عدة سجلات
const deleteMultipleLogs = async (req, res) => {
  try {
    const { logIds } = req.body;
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ message: 'غير مصرح' });
    }

    if (!logIds || !Array.isArray(logIds) || logIds.length === 0) {
      return res.status(400).json({ message: 'معرفات السجلات مطلوبة' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.id;

    // حذف السجلات المحددة
    const placeholders = logIds.map(() => '?').join(',');
    const [result] = await db.execute(
      `DELETE FROM activity_logs WHERE id IN (${placeholders})`,
      logIds
    );
    
    res.json({ 
      status: 'success', 
      message: `تم حذف ${result.affectedRows} سجل بنجاح`,
      deletedCount: result.affectedRows
    });
  } catch (error) {
    console.error('Error deleting multiple logs:', error);
    res.status(500).json({ message: 'خطأ في حذف السجلات' });
  }
};

// حذف جميع السجلات
const deleteAllLogs = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ message: 'غير مصرح' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.id;

    // حذف جميع السجلات
    const [result] = await db.execute('DELETE FROM activity_logs');
    
    res.json({ 
      status: 'success', 
      message: `تم حذف جميع السجلات بنجاح (${result.affectedRows} سجل)`,
      deletedCount: result.affectedRows
    });
  } catch (error) {
    console.error('Error deleting all logs:', error);
    res.status(500).json({ message: 'خطأ في حذف جميع السجلات' });
  }
};

// دالة تصدير السجلات إلى Excel
const exportLogsToExcel = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ message: 'غير مصرح' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.id;

    // جلب جميع السجلات مع معلومات إضافية
    const [logs] = await db.execute(`
      SELECT 
        l.id,
        u.username as user_name,
        l.description,
        l.action,
        l.reference_type,
        l.reference_id,
        l.created_at
      FROM activity_logs l
      LEFT JOIN users u ON l.user_id = u.id
      ORDER BY l.created_at DESC
    `);

    // دالة لترجمة الإجراءات - محسنة ومحدثة
    function translateAction(action, lang = 'ar') {
      const actionTranslations = {
        ar: {
          'create_folder': 'إنشاء مجلد',
          'update_folder': 'تعديل مجلد',
          'delete_folder': 'حذف مجلد',
          'add_folder_name': 'إضافة اسم مجلد',
          'update_folder_name': 'تعديل اسم مجلد',
          'delete_folder_name': 'حذف اسم مجلد',
          'add_content': 'إضافة محتوى',
          'update_content': 'تعديل محتوى',
          'delete_content': 'حذف محتوى',
          'add_department': 'إضافة قسم',
          'update_department': 'تعديل قسم',
          'add_sub_department': 'إضافة قسم فرعي',
          'update_sub_department': 'تعديل قسم فرعي',
          'delete_sub_department': 'حذف قسم فرعي',
          'add_user_permission': 'إضافة صلاحية مستخدم',
          'delete_department': 'حذف قسم',
          'add_user': 'إضافة مستخدم',
          'update_user': 'تعديل مستخدم',
          'delete_user': 'حذف مستخدم',
          'change_role': 'تغيير دور',
          'login': 'تسجيل دخول',
          'logout': 'تسجيل خروج',
          'register_user': 'تسجيل مستخدم جديد',
          'create_ticket': 'إنشاء تذكرة',
          'update_ticket': 'تحديث تذكرة',
          'delete_ticket': 'حذف تذكرة',
          'add_reply': 'إضافة رد',
          'approve_content': 'اعتماد محتوى',
          'reject_content': 'رفض محتوى',
          'sign_document': 'توقيع مستند',
          'delegate_signature': 'تفويض توقيع',
          'view_department_content': 'عرض محتوى القسم',
          'view_committee_content': 'عرض محتوى اللجنة',
          'send_approval_request': 'إرسال طلب اعتماد',
          'partial_approve_content': 'اعتماد جزئي للمحتوى',
          'upload_file': 'رفع ملف',
          'download_file': 'تحميل ملف',
          'view_file': 'عرض ملف',
          'share_file': 'مشاركة ملف',
          'move_file': 'نقل ملف',
          'copy_file': 'نسخ ملف',
          'rename_file': 'إعادة تسمية ملف',
          'archive_file': 'أرشفة ملف',
          'restore_file': 'استعادة ملف',
          'permanent_delete': 'حذف نهائي',
          'change_permissions': 'تغيير الصلاحيات',
          'grant_access': 'منح صلاحية',
          'revoke_access': 'سحب صلاحية',
          'create_backup': 'إنشاء نسخة احتياطية',
          'restore_backup': 'استعادة نسخة احتياطية',
          'system_maintenance': 'صيانة النظام',
          'update_system': 'تحديث النظام',
          'generate_report': 'إنشاء تقرير',
          'export_data': 'تصدير بيانات',
          'import_data': 'استيراد بيانات',
          'sync_data': 'مزامنة البيانات',
          'validate_data': 'التحقق من صحة البيانات',
          'approve_request': 'اعتماد طلب',
          'reject_request': 'رفض طلب',
          'forward_request': 'تحويل طلب',
          'escalate_request': 'تصعيد طلب',
          'close_request': 'إغلاق طلب',
          'reopen_request': 'إعادة فتح طلب',
          'assign_task': 'تعيين مهمة',
          'complete_task': 'إكمال مهمة',
          'cancel_task': 'إلغاء مهمة',
          'schedule_meeting': 'جدولة اجتماع',
          'join_meeting': 'الانضمام لاجتماع',
          'leave_meeting': 'مغادرة اجتماع',
          'record_meeting': 'تسجيل اجتماع',
          'send_notification': 'إرسال إشعار',
          'read_notification': 'قراءة إشعار',
          'delete_notification': 'حذف إشعار',
          'mark_as_read': 'تحديد كمقروء',
          'mark_as_unread': 'تحديد كغير مقروء',
          'filter_logs': 'تصفية السجلات',
          'search_logs': 'البحث في السجلات',
          'clear_logs': 'مسح السجلات',
          'export_logs': 'تصدير السجلات',
          'backup_logs': 'نسخ احتياطي للسجلات',
          'restore_logs': 'استعادة السجلات',
          'analyze_logs': 'تحليل السجلات',
          'generate_log_report': 'إنشاء تقرير السجلات',
          'set_log_level': 'تعيين مستوى السجل',
          'configure_logging': 'تكوين التسجيل',
          'test_connection': 'اختبار الاتصال',
          'reset_password': 'إعادة تعيين كلمة المرور',
          'change_password': 'تغيير كلمة المرور',
          'lock_account': 'قفل الحساب',
          'unlock_account': 'إلغاء قفل الحساب',
          'suspend_account': 'تعليق الحساب',
          'activate_account': 'تفعيل الحساب',
          'verify_email': 'التحقق من البريد الإلكتروني',
          'confirm_registration': 'تأكيد التسجيل',
          'request_password_reset': 'طلب إعادة تعيين كلمة المرور',
          'confirm_password_reset': 'تأكيد إعادة تعيين كلمة المرور',
          'enable_two_factor': 'تفعيل المصادقة الثنائية',
          'disable_two_factor': 'إلغاء تفعيل المصادقة الثنائية',
          'generate_api_key': 'إنشاء مفتاح API',
          'revoke_api_key': 'سحب مفتاح API',
          'view_audit_trail': 'عرض سجل التدقيق',
          'export_audit_trail': 'تصدير سجل التدقيق',
          'clear_audit_trail': 'مسح سجل التدقيق',
          'configure_security': 'تكوين الأمان',
          'update_security_settings': 'تحديث إعدادات الأمان',
          'run_security_scan': 'تشغيل فحص الأمان',
          'block_ip': 'حظر عنوان IP',
          'unblock_ip': 'إلغاء حظر عنوان IP',
          'view_security_logs': 'عرض سجلات الأمان',
          'generate_security_report': 'إنشاء تقرير الأمان'
        },
        en: {
          'create_folder': 'Create Folder',
          'update_folder': 'Update Folder',
          'delete_folder': 'Delete Folder',
          'add_folder_name': 'Add Folder Name',
          'update_folder_name': 'Update Folder Name',
          'delete_folder_name': 'Delete Folder Name',
          'add_content': 'Add Content',
          'update_content': 'Update Content',
          'delete_content': 'Delete Content',
          'add_department': 'Add Department',
          'add_user_permission': 'Add User Permission',
          'update_department': 'Update Department',
          'delete_department': 'Delete Department',

          'add_user': 'Add User',
          'update_user': 'Update User',
          'delete_user': 'Delete User',
          'change_role': 'Change Role',
          'login': 'Login',
          'logout': 'Logout',
          'register_user': 'Register User',
          'create_ticket': 'Create Ticket',
          'update_ticket': 'Update Ticket',
          'delete_ticket': 'Delete Ticket',
          'add_reply': 'Add Reply',
          'approve_content': 'Approve Content',
          'reject_content': 'Reject Content',
          'sign_document': 'Sign Document',
          'delegate_signature': 'Delegate Signature',
          'view_department_content': 'View Department Content',
          'view_committee_content': 'View Committee Content',
          'send_approval_request': 'Send Approval Request',
          'partial_approve_content': 'Partially Approve Content',
          'upload_file': 'Upload File',
          'download_file': 'Download File',
          'view_file': 'View File',
          'share_file': 'Share File',
          'move_file': 'Move File',
          'copy_file': 'Copy File',
          'rename_file': 'Rename File',
          'archive_file': 'Archive File',
          'restore_file': 'Restore File',
          'permanent_delete': 'Permanent Delete',
          'change_permissions': 'Change Permissions',
          'grant_access': 'Grant Access',
          'revoke_access': 'Revoke Access',
          'create_backup': 'Create Backup',
          'restore_backup': 'Restore Backup',
          'system_maintenance': 'System Maintenance',
          'update_system': 'Update System',
          'generate_report': 'Generate Report',
          'export_data': 'Export Data',
          'import_data': 'Import Data',
          'sync_data': 'Sync Data',
          'validate_data': 'Validate Data',
          'approve_request': 'Approve Request',
          'reject_request': 'Reject Request',
          'forward_request': 'Forward Request',
          'escalate_request': 'Escalate Request',
          'close_request': 'Close Request',
          'reopen_request': 'Reopen Request',
          'assign_task': 'Assign Task',
          'complete_task': 'Complete Task',
          'cancel_task': 'Cancel Task',
          'schedule_meeting': 'Schedule Meeting',
          'join_meeting': 'Join Meeting',
          'leave_meeting': 'Leave Meeting',
          'record_meeting': 'Record Meeting',
          'send_notification': 'Send Notification',
          'read_notification': 'Read Notification',
          'delete_notification': 'Delete Notification',
          'mark_as_read': 'Mark as Read',
          'mark_as_unread': 'Mark as Unread',
          'filter_logs': 'Filter Logs',
          'search_logs': 'Search Logs',
          'clear_logs': 'Clear Logs',
          'export_logs': 'Export Logs',
          'backup_logs': 'Backup Logs',
          'restore_logs': 'Restore Logs',
          'analyze_logs': 'Analyze Logs',
          'generate_log_report': 'Generate Log Report',
          'set_log_level': 'Set Log Level',
          'configure_logging': 'Configure Logging',
          'test_connection': 'Test Connection',
          'reset_password': 'Reset Password',
          'change_password': 'Change Password',
          'lock_account': 'Lock Account',
          'unlock_account': 'Unlock Account',
          'suspend_account': 'Suspend Account',
          'activate_account': 'Activate Account',
          'verify_email': 'Verify Email',
          'confirm_registration': 'Confirm Registration',
          'request_password_reset': 'Request Password Reset',
          'confirm_password_reset': 'Confirm Password Reset',
          'enable_two_factor': 'Enable Two Factor',
          'disable_two_factor': 'Disable Two Factor',
          'generate_api_key': 'Generate API Key',
          'revoke_api_key': 'Revoke API Key',
          'view_audit_trail': 'View Audit Trail',
          'export_audit_trail': 'Export Audit Trail',
          'clear_audit_trail': 'Clear Audit Trail',
          'configure_security': 'Configure Security',
          'update_security_settings': 'Update Security Settings',
          'run_security_scan': 'Run Security Scan',
          'block_ip': 'Block IP',
          'unblock_ip': 'Unblock IP',
          'view_security_logs': 'View Security Logs',
          'generate_security_report': 'Generate Security Report'
        }
      };
      
      return actionTranslations[lang] && actionTranslations[lang][action] 
        ? actionTranslations[lang][action] 
        : action;
    }

    // دالة لاستخراج النص العربي من الوصف
    function extractArabicDescription(description) {
      if (!description) return '';
      
      try {
        // إذا كان الوصف JSON يحتوي على نصوص ثنائية اللغة
        if (typeof description === 'string' && description.trim().startsWith('{')) {
          const parsed = JSON.parse(description);
          return parsed.ar || parsed.en || description;
        }
        return description;
      } catch (e) {
        return description;
      }
    }

    // إنشاء ملف Excel باستخدام ExcelJS
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('سجلات النظام');

    // إضافة العنوان الرئيسي
    const titleRow = worksheet.addRow(['تقرير سجلات النظام - نظام معايير الجودة ']);
    titleRow.height = 40;
    titleRow.font = { 
      bold: true, 
      size: 18, 
      color: { argb: 'FF2E86AB' } 
    };
    titleRow.alignment = { 
      horizontal: 'center', 
      vertical: 'middle' 
    };
    worksheet.mergeCells('A1:E1');

    // إضافة التاريخ
    const dateRow = worksheet.addRow([`تاريخ التقرير: ${new Date().toLocaleDateString('ar-SA')}`]);
    dateRow.font = { 
      size: 12, 
      color: { argb: 'FF666666' } 
    };
    dateRow.alignment = { 
      horizontal: 'right' 
    };
    worksheet.mergeCells('A2:E2');

    // إضافة مسافة
    worksheet.addRow([]);

    // إضافة رؤوس الأعمدة
    const headers = ['اسم المستخدم', 'نوع الإجراء', 'الوصف', 'تاريخ الإنشاء', 'وقت الإنشاء'];
    const headerRow = worksheet.addRow(headers);
    headerRow.height = 30;
    headerRow.font = { 
      bold: true, 
      size: 14, 
      color: { argb: 'FFFFFFFF' } 
    };
    headerRow.fill = { 
      type: 'pattern', 
      pattern: 'solid', 
      fgColor: { argb: 'FF2E86AB' } 
    };
    headerRow.alignment = { 
      horizontal: 'center', 
      vertical: 'middle' 
    };

    // إضافة البيانات
    logs.forEach((log, index) => {
      // ترجمة الإجراء
      const translatedAction = translateAction(log.action, 'ar');
      
      // استخراج الوصف بالعربية
      const arabicDescription = extractArabicDescription(log.description);
      
      // تنسيق التاريخ والوقت
      const createdDate = new Date(log.created_at);
      const dateStr = createdDate.toLocaleDateString('ar-SA');
      const timeStr = createdDate.toLocaleTimeString('ar-SA');
      
      const dataRow = worksheet.addRow([
        log.user_name || 'غير محدد',
        translatedAction,
        arabicDescription,
        dateStr,
        timeStr
      ]);

      // تصميم متناوب للصفوف
      const isEvenRow = index % 2 === 0;
      dataRow.height = 25;
      dataRow.font = { 
        size: 12, 
        color: { argb: 'FF000000' } 
      };
      dataRow.fill = { 
        type: 'pattern', 
        pattern: 'solid', 
        fgColor: { argb: isEvenRow ? 'FFF8F9FA' : 'FFFFFFFF' } 
      };
      dataRow.alignment = { 
        horizontal: 'right', 
        vertical: 'middle',
        wrapText: true
      };
    });

    // ضبط عرض الأعمدة
    worksheet.columns.forEach(column => {
      column.width = 25;
    });

    // ضبط عرض عمود الوصف ليكون أوسع
    worksheet.getColumn(3).width = 60;

    // إضافة حدود للخلايا
    for (let i = 1; i <= worksheet.rowCount; i++) {
      const row = worksheet.getRow(i);
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
          left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
          bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
          right: { style: 'thin', color: { argb: 'FFCCCCCC' } }
        };
      });
    }

    // إعداد اسم الملف
    const currentDate = new Date().toLocaleDateString('ar-SA').replace(/\//g, '-');
    const currentTime = new Date().toLocaleTimeString('ar-SA').replace(/:/g, '-');
    const filename = `سجلات_النظام_${currentDate}_${currentTime}.xlsx`;
    
    // ترميز اسم الملف للتوافق مع معايير HTTP
    const encodedFilename = encodeURIComponent(filename);
    
    // إعداد headers للتحميل
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedFilename}`);
    
    // إرسال الملف
    await workbook.xlsx.write(res);
    res.end();

  } catch (error) {
    console.error('Error exporting logs:', error);
    res.status(500).json({ message: 'خطأ في تصدير السجلات' });
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
  getHospitalManager,
  getUserApprovalSequenceFiles,
  revokeUserFromFiles,
  deleteLog,
  deleteMultipleLogs,
  deleteAllLogs,
  exportLogsToExcel,
};
