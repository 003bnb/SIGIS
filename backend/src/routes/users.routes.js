const express = require('express');
const { listUsers, createUser, updateUser } = require('../controllers/users.controller');
const { authenticateToken, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(authenticateToken, authorize('ADMIN'));
router.get('/', listUsers);
router.post('/', createUser);
router.patch('/:id', updateUser);

module.exports = router;
