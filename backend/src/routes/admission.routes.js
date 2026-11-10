const express = require('express');
const { createCandidate, listCandidates, updateCandidateStatus } = require('../controllers/admission.controller');
const { authenticateToken, authorize } = require('../middleware/auth');

const router = express.Router();
router.post('/', createCandidate);
router.get('/', authenticateToken, authorize('ADMIN', 'SCOLARITE'), listCandidates);
router.patch('/:id/status', authenticateToken, authorize('ADMIN', 'SCOLARITE'), updateCandidateStatus);

module.exports = router;
