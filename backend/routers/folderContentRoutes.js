// routes/folderContentRoutes.js
const express = require('express');
const { 
  getContentsByFolderId, 
  addContent,
  updateContent,
  deleteContent,
  downloadContent,
  getContentById,
  approveContent,
  upload    // middleware من الـ controller
} = require('../controllers/contentController');

const router = express.Router();

// جلب المحتويات في مجلد
router.get('/:folderId/contents', getContentsByFolderId);

// إضافة محتوى جديد في المجلد (title + file)
// الحقل النصّي title في req.body، والملف في req.file
router.post(
  '/:folderId/contents',
  upload.single('file'),
  addContent
);

// تحديث محتوى
router.put(
  '/:contentId', 
  upload.single('file'),
  updateContent
);

// حذف محتوى
router.delete('/:contentId', deleteContent);

// تحميل محتوى
router.get('/:contentId/download', downloadContent);

// جلب محتوى مفرد
router.get('/:contentId', getContentById);

// اعتماد محتوى
router.post('/:contentId/approve', approveContent);



module.exports = router;
