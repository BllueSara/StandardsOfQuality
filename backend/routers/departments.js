const express = require('express');
const router = express.Router();
const multer = require('multer');
const { getDepartments, addDepartment, updateDepartment, deleteDepartment, getApprovalSequence, updateApprovalSequence } = require('../controllers/departmentController');

// إعدادات تخزين multer
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, './uploads/images');
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ storage: storage });

// مسار جلب الأقسام
router.get('/', getDepartments);

// مسار إضافة قسم جديد (مع تحميل الصورة)
router.post('/', upload.single('image'), addDepartment);

// مسار تعديل قسم موجود (مع تحميل الصورة اختياريًا)
router.put('/:id', upload.single('image'), updateDepartment);

// مسار حذف قسم
router.delete('/:id', deleteDepartment);

router.get('/:id/approval-sequence', getApprovalSequence);
router.put('/:id/approval-sequence', updateApprovalSequence);
module.exports = router; 