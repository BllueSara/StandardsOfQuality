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
  getHospitalManager
} = require('../controllers/usersController');

const router = express.Router();

// 1) الراوتات العامة
router.get('/hospital-manager', authenticateToken, getHospitalManager);
router.get('/', authenticateToken, getUsers);
router.get('/logs', authenticateToken, getLogs);
router.get('/action-types', authenticateToken, getActionTypes);
router.get('/roles', authenticateToken, getRoles);

// 2) الراوتات المرتبطة بـ notifications — ✨ رتب من الأكثر تحديداً إلى الأقل
router.get('/:id/notifications/unread-count', authenticateToken, getUnreadCount);
router.put('/:id/notifications/mark-read', authenticateToken, markAllAsRead);
router.delete('/:id/notifications/:nid', authenticateToken, deleteNotification);
router.get('/:id/notifications', authenticateToken, getNotifications);

// 3) الراوتات الباقية
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
