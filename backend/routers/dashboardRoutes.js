const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');

// مسار ملخص الداشبورد الأساسي
router.get('/summary', dashboardController.getDashboardSummary);

// مسار الإحصائيات العامة
router.get('/stats', dashboardController.getStats);

// مسار البيانات الأسبوعية
router.get('/closed-week', dashboardController.getClosedWeek);

// مسار تصدير Excel
router.get('/export-excel', dashboardController.exportDashboardExcel);

// مسار إحصائيات الأقسام
router.get('/department-stats', dashboardController.getDepartmentStats);

// مسار الأداء الشهري
router.get('/monthly-performance', dashboardController.getMonthlyPerformance);

module.exports = router; 