// controllers/permissionsController.js
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

// 1) جلب صلاحيات مستخدم
const getUserPermissions = async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (Number.isNaN(userId)) {
    return res.status(400).json({ status: 'error', message: 'معرّف المستخدم غير صالح' });
  }

  try {
    const [rows] = await db.execute(
      `SELECT
         p.id,
         p.permission_key AS permission,
         p.description
       FROM permissions p
       JOIN user_permissions up ON p.id = up.permission_id
       WHERE up.user_id = ?
       ORDER BY p.permission_key`,
      [userId]
    );

   const keys = rows.map(r => r.permission);
    return res.status(200).json({ status: 'success', data: keys });
  } catch (error) {
    res.status(500).json({ message: 'خطأ في جلب صلاحيات المستخدم' });
  }
};

// 2) تحديث صلاحيات مستخدم
const updateUserPermissions = async (req, res) => {
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

  const userId = parseInt(req.params.id, 10);
  if (Number.isNaN(userId)) {
    return res.status(400).json({ status: 'error', message: 'معرّف المستخدم غير صالح' });
  }

  const newPerms = req.body;
  const conn = await db.getConnection();

  try {
    // Fetch user details for logging
    const [[userDetails]] = await conn.execute(
      'SELECT username FROM users WHERE id = ?',
      [userId]
    );

    // Fetch old permissions for comparison
    const [oldPermsRows] = await conn.execute(
      `SELECT p.permission_key
       FROM permissions p
       JOIN user_permissions up ON p.id = up.permission_id
       WHERE up.user_id = ?`,
      [userId]
    );
    const oldPerms = oldPermsRows.map(r => r.permission_key);

    await conn.beginTransaction();

    // حذف القديم
    await conn.execute('DELETE FROM user_permissions WHERE user_id = ?', [userId]);

    const keys = Object.keys(newPerms).filter(k => newPerms[k]);
    if (keys.length) {
      const placeholders = keys.map(() => '?').join(',');
      const sqlFetch = `SELECT id FROM permissions WHERE permission_key IN (${placeholders})`;
      const [permsRows] = await conn.execute(sqlFetch, keys);

      const inserts = permsRows.map(p => [userId, p.id]);
      if (inserts.length) {
        await conn.query(
          'INSERT INTO user_permissions (user_id, permission_id) VALUES ?',
          [inserts]
        );
      }
    }

    // Add to logs
    const addedPerms = keys.filter(k => !oldPerms.includes(k));
    const removedPerms = oldPerms.filter(k => !keys.includes(k));

    if (addedPerms.length > 0 || removedPerms.length > 0) {
        try {
            const logDescription = {
                ar: `تم تحديث صلاحيات المستخدم: ${userDetails.username}`,
                en: `Updated permissions for user: ${userDetails.username}`,
                details: {
                    added: addedPerms,
                    removed: removedPerms
                }
            };
            
            await logAction(adminUserId, 'update_user_permissions', JSON.stringify(logDescription), 'user', userId);
        } catch (logErr) {
            console.error('logAction error:', logErr);
        }
    }

    await conn.commit();
    return res.json({ status: 'success', message: 'تم تحديث الصلاحيات بنجاح' });
  } catch (error) {
    await conn.rollback();
    res.status(500).json({ message: 'Failed to update user permissions.' });
  } finally {
    conn.release();
  }
};

// 3) إضافة صلاحية واحدة
const addUserPermission = async (req, res) => {
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

  const userId = parseInt(req.params.id, 10);
  const key    = req.params.key;

  if (Number.isNaN(userId)) {
    return res.status(400).json({ status: 'error', message: 'معرّف المستخدم غير صالح' });
  }

  try {
    const [[perm]] = await db.execute(
      'SELECT id FROM permissions WHERE permission_key = ?',
      [key]
    );

    if (!perm) {
      return res.status(404).json({ status: 'error', message: 'صلاحية غير موجودة' });
    }

    // Check if permission already exists
    const [[existing]] = await db.execute(
      'SELECT 1 FROM user_permissions WHERE user_id = ? AND permission_id = ?',
      [userId, perm.id]
    );

    if (existing) {
      return res.status(400).json({ status: 'error', message: 'الصلاحية موجودة بالفعل' });
    }

    // Fetch user details for logging
    const [[userDetails]] = await db.execute(
      'SELECT username FROM users WHERE id = ?',
      [userId]
    );

    await db.execute(
      'INSERT IGNORE INTO user_permissions (user_id, permission_id) VALUES (?, ?)',
      [userId, perm.id]
    );

    // ✅ تسجيل اللوق بعد نجاح إضافة الصلاحية
    try {
      const logDescription = {
        ar: `تم إضافة صلاحية للمستخدم: ${userDetails.username}`,
        en: `Added permission to user: ${userDetails.username}`,
        details: {
            added: [key]
        }
      };
      
      await logAction(adminUserId, 'add_user_permission', JSON.stringify(logDescription), 'user', userId);
    } catch (logErr) {
      console.error('logAction error:', logErr);
    }

    return res.json({ status: 'success', message: 'تم إضافة الصلاحية' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to add user permission.' });
  }
};

// 4) إزالة صلاحية واحدة
const removeUserPermission = async (req, res) => {
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

  const userId = parseInt(req.params.id, 10);
  const key    = req.params.key;

  if (Number.isNaN(userId)) {
    return res.status(400).json({ status: 'error', message: 'معرّف المستخدم غير صالح' });
  }

  try {
    const [[perm]] = await db.execute(
      'SELECT id FROM permissions WHERE permission_key = ?',
      [key]
    );

    if (!perm) {
      return res.status(404).json({ status: 'error', message: 'صلاحية غير موجودة' });
    }

    // Fetch user details for logging
    const [[userDetails]] = await db.execute(
      'SELECT username FROM users WHERE id = ?',
      [userId]
    );

    const [result] = await db.execute(
      'DELETE FROM user_permissions WHERE user_id = ? AND permission_id = ?',
      [userId, perm.id]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ status: 'error', message: 'لم تُمنح هذه الصلاحية للمستخدم' });
    }

    // ✅ تسجيل اللوق بعد نجاح إزالة الصلاحية
    try {
      const logDescription = {
        ar: `تم إزالة صلاحية من المستخدم: ${userDetails.username}`,
        en: `Removed permission from user: ${userDetails.username}`,
        details: {
            removed: [key]
        }
      };
      
      await logAction(adminUserId, 'remove_user_permission', JSON.stringify(logDescription), 'user', userId);
    } catch (logErr) {
      console.error('logAction error:', logErr);
    }

    return res.status(200).json({ status: 'success', message: 'تم إزالة الصلاحية بنجاح' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to remove user permission.' });
  }
};

// جلب اللجان المختارة للمستخدم
const getUserCommittees = async (req, res) => {
    try {
        const { userId } = req.params;
        
        const [rows] = await db.execute(`
            SELECT c.id, c.name
            FROM committees c
            JOIN user_committees uc ON c.id = uc.committee_id
            WHERE uc.user_id = ?
            ORDER BY c.name
        `, [userId]);
        
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error getting user committees:', error);
        res.status(500).json({ message: 'خطأ في جلب اللجان المختارة' });
    }
};

// حفظ اللجان المختارة للمستخدم
const saveUserCommittees = async (req, res) => {
    try {
        const { userId } = req.params;
        const { committeeIds } = req.body;
        
        if (!Array.isArray(committeeIds)) {
            return res.status(400).json({ message: 'committeeIds يجب أن تكون مصفوفة' });
        }
        
        // حذف اللجان القديمة
        await db.execute('DELETE FROM user_committees WHERE user_id = ?', [userId]);
        
        // إضافة اللجان الجديدة
        if (committeeIds.length > 0) {
            // إنشاء placeholders للـ VALUES
            const placeholders = committeeIds.map(() => '(?, ?)').join(', ');
            const values = committeeIds.flatMap(committeeId => [userId, committeeId]);
            
            await db.execute(
                `INSERT INTO user_committees (user_id, committee_id) VALUES ${placeholders}`,
                values
            );
        }
        
        res.status(200).json({ message: 'تم حفظ اللجان المختارة بنجاح' });
    } catch (error) {
        console.error('Error saving user committees:', error);
        res.status(500).json({ message: 'خطأ في حفظ اللجان المختارة' });
    }
};

// حذف لجنة من المستخدم
const removeUserCommittee = async (req, res) => {
    try {
        const { userId, committeeId } = req.params;
        
        await db.execute(
            'DELETE FROM user_committees WHERE user_id = ? AND committee_id = ?',
            [userId, committeeId]
        );
        
        res.status(200).json({ message: 'تم حذف اللجنة بنجاح' });
    } catch (error) {
        console.error('Error removing user committee:', error);
        res.status(500).json({ message: 'خطأ في حذف اللجنة' });
    }
};

// منح أو إلغاء جميع الصلاحيات للمستخدم
const grantAllPermissions = async (req, res) => {
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

  const userId = parseInt(req.params.id, 10);
  const { grantAll } = req.body;

  if (Number.isNaN(userId)) {
    return res.status(400).json({ status: 'error', message: 'معرّف المستخدم غير صالح' });
  }

  const conn = await db.getConnection();

  try {
    // Fetch user details for logging
    const [[userDetails]] = await conn.execute(
      'SELECT username FROM users WHERE id = ?',
      [userId]
    );

    // Fetch old permissions for comparison
    const [oldPermsRows] = await conn.execute(
      `SELECT p.permission_key
       FROM permissions p
       JOIN user_permissions up ON p.id = up.permission_id
       WHERE up.user_id = ?`,
      [userId]
    );
    const oldPerms = oldPermsRows.map(r => r.permission_key);

    await conn.beginTransaction();

    if (grantAll) {
      // منح جميع الصلاحيات مع استثناء الصلاحيات المحددة
      // الصلاحيات التي لا يجب منحها تلقائياً ولكن يمكن منحها يدوياً
      const excludedPermissions = [
        'disable_departments',       // اخفاء الاقسام
        'disable_approvals',         // اخفاء الاعتمادات
        'disable_notifications',     // إلغاء الإشعارات
        'disable_emails',            // إلغاء الإيميلات
        'disable_logs',              // إلغاء اللوقز
        'view_own_department',       // عرض القسم الموجود

      ];
      
      // جلب جميع الصلاحيات المتاحة مع استثناء الصلاحيات المحددة
      const placeholders = excludedPermissions.map(() => '?').join(',');
      const [allPerms] = await conn.execute(
        `SELECT id, permission_key FROM permissions WHERE permission_key NOT IN (${placeholders})`,
        excludedPermissions
      );
      
      console.log('Excluded permissions:', excludedPermissions);
      console.log('Permissions being granted:', allPerms.map(p => p.permission_key));
      
      // حذف الصلاحيات الحالية
      await conn.execute('DELETE FROM user_permissions WHERE user_id = ?', [userId]);
      
      // إضافة جميع الصلاحيات (باستثناء المستبعدة)
      if (allPerms.length > 0) {
        const inserts = allPerms.map(p => [userId, p.id]);
        await conn.query(
          'INSERT INTO user_permissions (user_id, permission_id) VALUES ?',
          [inserts]
        );
      }
    } else {
      // إلغاء جميع الصلاحيات
      await conn.execute('DELETE FROM user_permissions WHERE user_id = ?', [userId]);
    }

    // Fetch new permissions for logging
    const [newPermsRows] = await conn.execute(
      `SELECT p.permission_key
       FROM permissions p
       JOIN user_permissions up ON p.id = up.permission_id
       WHERE up.user_id = ?`,
      [userId]
    );
    const newPerms = newPermsRows.map(r => r.permission_key);

    // Add to logs
    const addedPerms = newPerms.filter(k => !oldPerms.includes(k));
    const removedPerms = oldPerms.filter(k => !newPerms.includes(k));

    if (addedPerms.length > 0 || removedPerms.length > 0) {
        try {
            const logDescription = {
                ar: `تم ${grantAll ? 'منح جميع الصلاحيات' : 'إلغاء جميع الصلاحيات'} للمستخدم: ${userDetails.username}`,
                en: `${grantAll ? 'Granted all permissions' : 'Revoked all permissions'} for user: ${userDetails.username}`,
                details: {
                    action: grantAll ? 'grant_all' : 'revoke_all',
                    added: addedPerms,
                    removed: removedPerms
                }
            };
            
            await logAction(adminUserId, 'grant_all_permissions', JSON.stringify(logDescription), 'user', userId);
        } catch (logErr) {
            console.error('logAction error:', logErr);
        }
    }

    await conn.commit();
    return res.json({ 
      status: 'success', 
      message: grantAll ? 'تم منح جميع الصلاحيات بنجاح' : 'تم إلغاء جميع الصلاحيات بنجاح' 
    });
  } catch (error) {
    await conn.rollback();
    console.error('Error in grantAllPermissions:', error);
    res.status(500).json({ message: 'Failed to update permissions: ' + error.message });
  } finally {
    conn.release();
  }
};

module.exports = {
  getUserPermissions,
  updateUserPermissions,
  addUserPermission,
  removeUserPermission,
  getUserCommittees,
  saveUserCommittees,
  removeUserCommittee,
  grantAllPermissions
};
