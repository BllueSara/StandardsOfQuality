const express = require('express');
const router = express.Router();
const {
    getAllJobTitles,
    addJobTitle,
    deleteJobTitle,
    updateJobTitle
} = require('../controllers/jobTitlesController');

// جلب جميع المسميات الوظيفية
router.get('/', getAllJobTitles);

// إضافة مسمى وظيفي جديد
router.post('/', addJobTitle);

// حذف مسمى وظيفي
router.delete('/:id', deleteJobTitle);

// تحديث مسمى وظيفي
router.put('/:id', updateJobTitle);

module.exports = router; 