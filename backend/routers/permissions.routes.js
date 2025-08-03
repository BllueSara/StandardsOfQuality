// routes/permissions.routes.js
const express = require('express');
const { authenticateToken } = require('../controllers/authController');
const {
  getUserPermissions,
  updateUserPermissions,
  addUserPermission,
  removeUserPermission,
  getUserCommittees,
  saveUserCommittees,
  removeUserCommittee,
  grantAllPermissions
} = require('../controllers/permissionsController');

const router = express.Router();

// لاحظ النقطتين: مسار نسبي + mergeParams لو تحتاج params من usersRouter
router.get('/:id/permissions',         authenticateToken, getUserPermissions);
router.put('/:id/permissions',         authenticateToken, updateUserPermissions);
router.post('/:id/permissions/:key',   authenticateToken, addUserPermission);
router.delete('/:id/permissions/:key', authenticateToken, removeUserPermission);
router.post('/:id/grant-all-permissions', authenticateToken, grantAllPermissions);

// Routes for user committees
router.get('/:userId/committees',      authenticateToken, getUserCommittees);
router.post('/:userId/committees',     authenticateToken, saveUserCommittees);
router.delete('/:userId/committees/:committeeId', authenticateToken, removeUserCommittee);

module.exports = router;
