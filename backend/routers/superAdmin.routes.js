const express = require('express');
const router = express.Router();
const {
    checkSuperAdminAuth,
    getDeletedStatistics,
    getDeletedItemsByTable,
    getAllDeletedItems,
    restoreDeletedItem,
    restoreAllItemsByTable,
    restoreAllItems,
    permanentDeleteItem,
    permanentDeleteAllByTable,
    permanentDeleteAllItems
} = require('../controllers/superAdminController');

// تطبيق middleware التحقق من صلاحيات السوبر أدمن على جميع المسارات
router.use(checkSuperAdminAuth);

// إحصائيات العناصر المحذوفة
router.get('/deleted-statistics', getDeletedStatistics);

// جلب العناصر المحذوفة من جدول معين
router.get('/deleted-items/:table', getDeletedItemsByTable);

// مسار إضافي لتتوافق مع الـ frontend
router.get('/deleted/:table', getDeletedItemsByTable);

// جلب جميع العناصر المحذوفة من جميع الجداول
router.get('/all-deleted-items', getAllDeletedItems);

// Routes إضافية لتتوافق مع الـ frontend
router.get('/deleted-stats', getDeletedStatistics);
router.get('/deleted-all', getAllDeletedItems);

// استرجاع عنصر محذوف
router.post('/restore/:table/:id', restoreDeletedItem);

// استرجاع جميع العناصر المحذوفة من جدول معين
router.post('/restore-all/:table', restoreAllItemsByTable);

// استرجاع جميع العناصر المحذوفة من جميع الجداول
router.post('/restore-all', restoreAllItems);

// حذف عنصر نهائياً
router.delete('/permanent-delete/:table/:id', permanentDeleteItem);

// حذف جميع العناصر المحذوفة من جدول معين نهائياً
router.delete('/permanent-delete-all/:table', permanentDeleteAllByTable);

// حذف جميع العناصر المحذوفة من جميع الجداول نهائياً
router.delete('/permanent-delete-all', permanentDeleteAllItems);

module.exports = router;
