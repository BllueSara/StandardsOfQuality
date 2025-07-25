const mysql = require('mysql2/promise');
require('dotenv').config();

const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

// إضافة رد جديد
async function addReply(contentId, userId, replyText) {
  await db.execute(
    'INSERT INTO rejection_replies (content_id, user_id, reply_text) VALUES (?, ?, ?)',
    [contentId, userId, replyText]
  );
}

// جلب كل الردود لملف معين
async function getReplies(contentId) {
  const [rows] = await db.execute(
    `SELECT r.*, u.username FROM rejection_replies r JOIN users u ON r.user_id = u.id WHERE r.content_id = ? ORDER BY r.created_at ASC`,
    [contentId]
  );
  return rows;
}

module.exports = { addReply, getReplies }; 