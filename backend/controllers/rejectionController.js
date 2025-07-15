const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
const { logAction } = require('../models/logger');
const { addReply, getReplies } = require('../models/rejectionReplies');
require('dotenv').config();

const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

// رفض ملف مع سبب
const rejectContent = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ status: 'error', message: 'لا يوجد توكن' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.id;
    let contentId = req.params.contentId;
    if (typeof contentId === 'string' && (contentId.startsWith('dept-') || contentId.startsWith('comm-'))) {
      contentId = contentId.split('-')[1];
    }
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ status: 'error', message: 'يرجى إدخال سبب الرفض' });

    // أضف سجل رفض في approval_logs
    await db.execute(`
      INSERT INTO approval_logs (content_id, approver_id, status, comments, created_at)
      VALUES (?, ?, 'rejected', ?, NOW())
      ON DUPLICATE KEY UPDATE status='rejected', comments=VALUES(comments), created_at=NOW()
    `, [contentId, userId, reason]);

    // حدّث حالة الملف
    await db.execute(`
      UPDATE contents SET approval_status='rejected', updated_at=NOW() WHERE id=?
    `, [contentId]);

    // جلب اسم الملف
    const [rows] = await db.execute('SELECT title FROM contents WHERE id=?', [contentId]);
    const fileTitle = rows.length ? rows[0].title : contentId;

    // سجل لوق
    await logAction(
      userId,
      'reject_content',
      JSON.stringify({ ar: `تم رفض الملف: "${fileTitle}"`, en: `Rejected file: "${fileTitle}"` }),
      'content',
      contentId
    );

    res.json({ status: 'success', message: 'تم الرفض بنجاح' });
  } catch (err) {
    console.error('rejectionController error:', err);
    res.status(500).json({ status: 'error', message: 'خطأ أثناء رفض الملف' });
  }
};

// إضافة رد جديد
const addRejectionReply = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ status: 'error', message: 'لا يوجد توكن' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.id;
    let contentId = req.params.contentId;
    if (typeof contentId === 'string' && (contentId.startsWith('dept-') || contentId.startsWith('comm-'))) {
      contentId = contentId.split('-')[1];
    }
    const { reply } = req.body;
    if (!reply) return res.status(400).json({ status: 'error', message: 'يرجى كتابة الرد' });
    await addReply(contentId, userId, reply);
    res.json({ status: 'success', message: 'تم إرسال الرد' });
  } catch (err) {
    console.error('addRejectionReply error:', err);
    res.status(500).json({ status: 'error', message: 'خطأ أثناء إرسال الرد' });
  }
};

// جلب كل الردود
const getRejectionReplies = async (req, res) => {
  try {
    let contentId = req.params.contentId;
    if (typeof contentId === 'string' && (contentId.startsWith('dept-') || contentId.startsWith('comm-'))) {
      contentId = contentId.split('-')[1];
    }
    const replies = await getReplies(contentId);
    res.json({ status: 'success', data: replies });
  } catch (err) {
    console.error('getRejectionReplies error:', err);
    res.status(500).json({ status: 'error', message: 'خطأ في جلب الردود' });
  }
};

// جلب سبب الرفض الحقيقي من approval_logs
const getRejectionReason = async (req, res) => {
  try {
    let contentId = req.params.contentId;
    if (typeof contentId === 'string' && (contentId.startsWith('dept-') || contentId.startsWith('comm-'))) {
      contentId = contentId.split('-')[1];
    }
    const [rows] = await db.execute(
      `SELECT al.comments, u.username FROM approval_logs al JOIN users u ON al.approver_id = u.id WHERE al.content_id = ? AND al.status = 'rejected' ORDER BY al.created_at DESC LIMIT 1`,
      [contentId]
    );
    const reason = rows.length ? rows[0].comments : '';
    const author = rows.length ? rows[0].username : '';
    res.json({ status: 'success', reason, author });
  } catch (err) {
    console.error('getRejectionReason error:', err);
    res.status(500).json({ status: 'error', message: 'خطأ في جلب سبب الرفض' });
  }
};

module.exports = { rejectContent, addRejectionReply, getRejectionReplies, getRejectionReason }; 