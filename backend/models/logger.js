const mysql = require('mysql2/promise');

const db = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'StandardOfQuality'
});

// دالة التحقق من صلاحيات المستخدم
async function getUserPermissions(userId) {
  try {
    const [rows] = await db.execute(`
      SELECT p.permission_key
      FROM permissions p
      JOIN user_permissions up ON p.id = up.permission_id
      WHERE up.user_id = ?
    `, [userId]);
    return new Set(rows.map(r => r.permission_key));
  } catch (error) {
    console.error('Error fetching user permissions:', error);
    return new Set();
  }
}

// دالة التحقق من صلاحية إلغاء اللوقز
async function canDisableLogs(userId) {
  try {
    const permissions = await getUserPermissions(userId);
    const hasPermission = permissions.has('disable_logs');
    console.log(`🔍 User ${userId} permissions:`, Array.from(permissions));
    console.log(`🔍 User ${userId} has disable_logs: ${hasPermission}`);
    return hasPermission;
  } catch (error) {
    console.error(`❌ Error checking disable_logs for user ${userId}:`, error);
    return false;
  }
}



async function logAction(userId, action, description, referenceType, referenceId) {
  try {
    console.log(`🔍 Checking logs for user ${userId}, action: ${action}`);
    
    // التحقق من صلاحية إلغاء اللوقز للمستخدم المستهدف
    const canDisable = await canDisableLogs(userId);
    console.log(`🔍 User ${userId} can disable logs: ${canDisable}`);
    
    if (canDisable) {
      console.log(`🚫 User ${userId} has disabled logs, skipping log entry completely`);
      return;
    }

    console.log(`✅ Logging action for user ${userId}: ${action}`);
    await db.execute(
      `INSERT INTO activity_logs 
       (user_id, action, description, reference_type, reference_id, created_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [userId, action, description, referenceType, referenceId]
    );
    console.log(`✅ Successfully logged action for user ${userId}`);
  } catch (error) {
    console.error('❌ Error logging action:', error);
    // لا نوقف العملية إذا فشل تسجيل اللوق
  }
}

module.exports = { 
  logAction,
  canDisableLogs,
  getUserPermissions
}; 