const express = require('express');
const { authenticateToken } = require('../controllers/authController');
const {
  getPermissionsList,
  addPermissionDef,
  updatePermissionDef,
  deletePermissionDef
} = require('../controllers/permissionsDefController');
const router = express.Router();

router.get(   '/permissions',       authenticateToken, getPermissionsList);
router.post(  '/permissions',       authenticateToken, addPermissionDef);
router.put(   '/permissions/:id',   authenticateToken, updatePermissionDef);
router.delete('/permissions/:id',   authenticateToken, deletePermissionDef);

module.exports = router;
