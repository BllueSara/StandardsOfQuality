// controllers/permissionsDefController.js
const mysql = require('mysql2/promise');
require('dotenv').config();
const jwt = require('jsonwebtoken');
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

const db = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'Quality'
});

// 1) جلب جميع التعريفات
const getPermissionsList = async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT
         id,
         permission_key AS \`key\`,
         description
       FROM permissions
       ORDER BY permission_key`
    );

    return res.status(200).json({ status: 'success', data: rows });
  } catch (error) {
    res.status(500).json({ message: 'خطأ في جلب التعريفات' });
  }
};

// 2) إضافة تعريف جديد
const addPermissionDef = async (req, res) => {
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

  const { key, description } = req.body;
  if (!key || !description) {
    return res.status(400).json({ status: 'error', message: 'المفتاح والوصف مطلوبان' });
  }

  try {
    const [exists] = await db.execute(
      'SELECT id FROM permissions WHERE permission_key = ?',
      [key]
    );

    if (exists.length) {
      return res.status(409).json({ status: 'error', message: 'الصلاحية موجودة مسبقاً' });
    }

    const [result] = await db.execute(
      'INSERT INTO permissions (permission_key, description) VALUES (?, ?)',
      [key, description]
    );

    // ✅ تسجيل اللوق بعد نجاح إضافة تعريف الصلاحية
    try {
      const logDescription = {
        ar: `تم إضافة تعريف صلاحية جديد: ${key}`,
        en: `Added new permission definition: ${key}`
      };
      
      await logAction(adminUserId, 'add_permission_definition', JSON.stringify(logDescription), 'permission', result.insertId);
    } catch (logErr) {
      console.error('logAction error:', logErr);
    }

    return res.status(201).json({ status: 'success', message: 'تم إضافة الصلاحية بنجاح', id: result.insertId });
  } catch (error) {
    res.status(500).json({ message: 'خطأ في إضافة تعريف الصلاحية' });
  }
};

// 3) تعديل تعريف
const updatePermissionDef = async (req, res) => {
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

  const { id } = req.params;
  const { key, description } = req.body;
  if (!key) {
    return res.status(400).json({ status: 'error', message: 'المفتاح مطلوب' });
  }

  try {
    // Fetch old permission details for logging
    const [[oldPermission]] = await db.execute(
      'SELECT permission_key, description FROM permissions WHERE id = ?',
      [id]
    );

    if (!oldPermission) {
      return res.status(404).json({ status: 'error', message: 'الصلاحية غير موجودة' });
    }

    const [exists] = await db.execute(
      'SELECT id FROM permissions WHERE permission_key = ? AND id != ?',
      [key, id]
    );

    if (exists.length) {
      return res.status(409).json({ status: 'error', message: 'الصلاحية موجودة مسبقاً' });
    }

    const [result] = await db.execute(
      'UPDATE permissions SET permission_key = ?, description = ? WHERE id = ?',
      [key, description, id]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ status: 'error', message: 'الصلاحية غير موجودة' });
    }

    // ✅ تسجيل اللوق بعد نجاح تحديث تعريف الصلاحية
    try {
      const logDescription = {
        ar: `تم تحديث تعريف الصلاحية: ${oldPermission.permission_key} إلى ${key}`,
        en: `Updated permission definition: ${oldPermission.permission_key} to ${key}`
      };
      
      await logAction(adminUserId, 'update_permission_definition', JSON.stringify(logDescription), 'permission', id);
    } catch (logErr) {
      console.error('logAction error:', logErr);
    }

    return res.status(200).json({ status: 'success', message: 'تم تحديث الصلاحية بنجاح' });
  } catch (error) {
    res.status(500).json({ message: 'خطأ في تعديل تعريف الصلاحية' });
  }
};

// 4) حذف تعريف
const deletePermissionDef = async (req, res) => {
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

  const { id } = req.params;

  try {
    // Fetch permission details for logging
    const [[permissionDetails]] = await db.execute(
      'SELECT permission_key, description FROM permissions WHERE id = ?',
      [id]
    );

    if (!permissionDetails) {
      return res.status(404).json({ status: 'error', message: 'الصلاحية غير موجودة' });
    }

    const [related] = await db.execute(
      'SELECT COUNT(*) AS count FROM user_permissions WHERE permission_id = ?',
      [id]
    );

    if (related[0].count > 0) {
      return res.status(400).json({ status: 'error', message: 'لا يمكن حذف الصلاحية لوجود مستخدمين مرتبطين بها' });
    }

    const [result] = await db.execute(
      'DELETE FROM permissions WHERE id = ?',
      [id]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ status: 'error', message: 'الصلاحية غير موجودة' });
    }

    // ✅ تسجيل اللوق بعد نجاح حذف تعريف الصلاحية
    try {
      const logDescription = {
        ar: `تم حذف تعريف الصلاحية: ${permissionDetails.permission_key}`,
        en: `Deleted permission definition: ${permissionDetails.permission_key}`
      };
      
      await logAction(adminUserId, 'delete_permission_definition', JSON.stringify(logDescription), 'permission', id);
    } catch (logErr) {
      console.error('logAction error:', logErr);
    }

    return res.status(200).json({ status: 'success', message: 'تم حذف الصلاحية بنجاح' });
  } catch (error) {
    res.status(500).json({ message: 'خطأ في حذف تعريف الصلاحية' });
  }
};

module.exports = {
  getPermissionsList,
  addPermissionDef,
  updatePermissionDef,
  deletePermissionDef
};
