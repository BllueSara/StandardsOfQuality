const mysql = require('mysql2/promise');

const db = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'StandardOfQuality'
});


async function logAction(userId, action, description, referenceType, referenceId) {
  await db.execute(
    `INSERT INTO activity_logs 
     (user_id, action, description, reference_type, reference_id, created_at)
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [userId, action, description, referenceType, referenceId]
  );
}

module.exports = { logAction }; 