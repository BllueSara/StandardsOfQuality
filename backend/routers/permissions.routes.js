// routes/permissions.routes.js
const express = require('express');
const { authenticateToken } = require('../controllers/authController');
const {
  getUserPermissions,
  updateUserPermissions,
  addUserPermission,
  removeUserPermission,
  grantAllPermissions
} = require('../controllers/permissionsController');

const router = express.Router();

// لاحظ النقطتين: مسار نسبي + mergeParams لو تحتاج params من usersRouter
router.get('/:id/permissions',         authenticateToken, getUserPermissions);
router.put('/:id/permissions',         authenticateToken, updateUserPermissions);
router.post('/:id/permissions/:key',   authenticateToken, addUserPermission);
router.delete('/:id/permissions/:key', authenticateToken, removeUserPermission);
router.post('/:id/grant-all-permissions', authenticateToken, grantAllPermissions);



module.exports = router;
