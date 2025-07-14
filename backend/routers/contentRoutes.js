// routes/contentRoutes.js
const express = require('express');
const multer  = require('multer');
const mysql = require('mysql2/promise');
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});
const path = require('path');
const fs = require('fs');

const { getMyUploadedContent, addContent } = require('../controllers/contentController');
const { getContentById } = require('../controllers/contentController');
const { updateContent } = require('../controllers/contentController');
const { deleteContent } = require('../controllers/contentController');
const { logContentView } = require('../controllers/contentController');


const router = express.Router();


// وسطح التخزين في مجلّد uploads (أو عدّل على كيفما تحب)
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      const uploadDir = path.join(__dirname, '../../uploads/content_files'); // تأكد أنه مسار مطلق من backend
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const ext = path.extname(file.originalname) || '.pdf';
      cb(null, `${uniqueSuffix}${ext}`);
    }
  });
const upload = multer({ storage });

// GET /api/contents/my-uploads
router.get('/my-uploads', getMyUploadedContent);

router.delete('/:contentId', deleteContent);


// جلب تفاصيل تتبع الطلب
router.get('/track/:contentId', async (req, res) => {
  try {
    const { contentId } = req.params;

    const [contentRows] = await db.execute('SELECT * FROM contents WHERE id = ?', [contentId]);
    if (contentRows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Content not found.' });
    }
    const content = contentRows[0];

    // ✅ استعلام سجل الموافقات
    const [timelineRows] = await db.execute(`
      SELECT 
        al.status, al.comments, al.created_at, 
        u.username AS approver, 
        d.name AS department
      FROM approval_logs al
      JOIN users u ON al.approver_id = u.id
      JOIN contents c ON al.content_id = c.id
      JOIN folders f ON c.folder_id = f.id
      LEFT JOIN departments d ON f.department_id = d.id
      WHERE al.content_id = ?
      ORDER BY al.created_at ASC
    `, [contentId]);

    // ✅ استعلام المعتمدين اللي ما وقعوا
    const [pendingApproversRows] = await db.execute(`
      SELECT 
        u.username AS approver, 
        d.name AS department
      FROM content_approvers ca
      JOIN users u ON ca.user_id = u.id
      JOIN contents c ON ca.content_id = c.id
      JOIN folders f ON c.folder_id = f.id
      LEFT JOIN departments d ON f.department_id = d.id
      WHERE ca.content_id = ?
        AND NOT EXISTS (
          SELECT 1 
          FROM approval_logs al 
          WHERE al.content_id = ca.content_id 
            AND al.approver_id = ca.user_id 
            AND al.status = 'approved'
        )
    `, [contentId]);

    res.json({
      status: 'success',
      content,
      timeline: timelineRows,
      pending: pendingApproversRows
    });
  } catch (err) {
    console.error('❌ Error fetching track info:', err);
    res.status(500).json({ status: 'error', message: 'Failed to fetch track info.' });
  }
});




router.get('/:contentId', getContentById);


// POST /api/contents
// • الحقل النصّي title في req.body  
// • الملف في req.file
router.post(
  '/',
  upload.single('file'),   // يستخدم حقل form-data اسمه "file"
  addContent
);


router.put('/:contentId', upload.single('file'), updateContent);

// POST /api/contents/log-view - تسجيل عرض المحتوى
router.post('/log-view', logContentView);


module.exports = router;
