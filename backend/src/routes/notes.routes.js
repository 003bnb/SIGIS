const express = require('express');
const { upsertGrade, transcript } = require('../controllers/notes.controller');
const { authenticateToken, authorize } = require('../middleware/auth');

const router = express.Router();
router.get('/student/:studentId/transcript', authenticateToken, transcript);
router.post('/', authenticateToken, authorize('ADMIN', 'SCOLARITE'), upsertGrade);

module.exports = router;
