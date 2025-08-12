const express = require('express');
const router = express.Router();
const {
    getAllJobNames,
    addJobName,
    deleteJobName,
    updateJobName,
    initJobNamesTable
} = require('../controllers/jobNamesController');

// جلب جميع المسميات
router.get('/', getAllJobNames);

// إضافة مسمى جديد
router.post('/', addJobName);

// حذف مسمى
router.delete('/:id', deleteJobName);

// تحديث مسمى
router.put('/:id', updateJobName);

// تهيئة جدول job_names
router.post('/init', initJobNamesTable);

module.exports = router;

