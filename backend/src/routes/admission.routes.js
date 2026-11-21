const express = require('express');
const {
  createCandidate, downloadCandidateDiploma, listCandidates, updateCandidateStatus
} = require('../controllers/admission.controller');
const { authenticateToken, authorize } = require('../middleware/auth');
const { receiveDiploma } = require('../middleware/candidate-document');

const router = express.Router();
router.post('/', receiveDiploma, createCandidate);
router.get('/', authenticateToken, authorize('ADMIN', 'SCOLARITE'), listCandidates);
router.get('/:id/documents/diplome', authenticateToken, authorize('ADMIN', 'SCOLARITE'), downloadCandidateDiploma);
router.patch('/:id/status', authenticateToken, authorize('ADMIN', 'SCOLARITE'), updateCandidateStatus);

module.exports = router;
