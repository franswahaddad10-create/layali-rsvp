const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');
const { authLimiter } = require('../config/security');

router.post('/login', authLimiter, authController.loginUser);
router.get('/me', protect, authController.getCurrentUser);
router.get('/users', protect, authorizeRoles('admin'), authController.getUsers);
router.post('/users', protect, authorizeRoles('admin'), authController.createUser);
router.put('/users/:id', protect, authorizeRoles('admin'), authController.updateUser);
router.delete('/users/:id', protect, authorizeRoles('admin'), authController.deleteUser);

module.exports = router;
