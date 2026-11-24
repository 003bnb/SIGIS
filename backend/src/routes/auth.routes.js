const express = require('express');
const { login, me, changePassword } = require('../controllers/auth.controller');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.post('/login', login);
router.get('/me', authenticateToken, me);
router.post('/change-password', authenticateToken, changePassword);

module.exports = router;
