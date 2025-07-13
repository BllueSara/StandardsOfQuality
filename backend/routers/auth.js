const express = require('express');
const router  = express.Router();
const {
  register,
  login,
  forgotPassword,
  resetPassword,
  authenticateToken,
  adminResetPassword,
  checkRole
} = require('../controllers/authController');

router.post('/register', register);
router.post('/login',    login);
router.post('/forgot-password',          forgotPassword);
router.post('/reset-password/:token',    resetPassword);
router.put ('/users/:id/reset-password', authenticateToken, adminResetPassword);
router.get('/check-role', authenticateToken, checkRole);

module.exports = router;
