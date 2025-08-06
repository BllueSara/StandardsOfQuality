const express = require('express');
const { authenticateToken } = require('../controllers/authController');
const {
  getUsers,
  getUserById,
  addUser,
  updateUser,
  deleteUser,
  changeUserRole,
  adminResetPassword,
  getRoles,
  getLogs,
  getActionTypes,
  getNotifications,
  markAllAsRead,
  getUnreadCount,
  deleteNotification,
  updateUserStatus,
  getNotificationSettings,
  updateNotificationSettings,
  resetNotificationSettings,
  getHospitalManager,
  getUserApprovalSequenceFiles,
  revokeUserFromFiles,
  deleteLog,
  deleteMultipleLogs,
  deleteAllLogs,
  exportLogsToExcel
} = require('../controllers/usersController');

const router = express.Router();

// 1) الراوتات العامة
router.get('/hospital-manager', authenticateToken, getHospitalManager);
router.get('/', authenticateToken, getUsers);
router.get('/logs', authenticateToken, getLogs);
router.get('/action-types', authenticateToken, getActionTypes);
router.get('/roles', authenticateToken, getRoles);

// 2) راوتات حذف السجلات
router.delete('/logs/bulk-delete', authenticateToken, deleteMultipleLogs);
router.delete('/logs/delete-all', authenticateToken, deleteAllLogs);
router.delete('/logs/:id', authenticateToken, deleteLog);

// 3) راوتات تصدير السجلات
router.get('/logs/export/excel', authenticateToken, exportLogsToExcel);

// 4) الراوتات المرتبطة بـ notifications — ✨ رتب من الأكثر تحديداً إلى الأقل
router.get('/:id/notifications/unread-count', authenticateToken, getUnreadCount);
router.put('/:id/notifications/mark-read', authenticateToken, markAllAsRead);
router.delete('/:id/notifications/:nid', authenticateToken, deleteNotification);
router.get('/:id/notifications', authenticateToken, getNotifications);

// جلب الملفات التي المستخدم في تسلسلها
router.get('/:id/approvals-sequence-files', authenticateToken, getUserApprovalSequenceFiles);
// سحب المستخدم من ملفات محددة
router.post('/:id/revoke-files', authenticateToken, revokeUserFromFiles);
// جلب حالة التفويض للمستخدم
router.get('/:id/delegation-status', authenticateToken, require('../controllers/approvalController').getDelegationStatus);

// 5) الراوتات الباقية
router.get('/:id', authenticateToken, getUserById);
router.post('/', authenticateToken, addUser);
router.put('/:id', authenticateToken, updateUser);
router.delete('/:id', authenticateToken, deleteUser);
router.put('/:id/role', authenticateToken, changeUserRole);
router.put('/:id/reset-password', authenticateToken, adminResetPassword);
// بعد راوت /:id/reset-password
router.patch(
  '/:id/status',
  authenticateToken,
  updateUserStatus
);

module.exports = router;
