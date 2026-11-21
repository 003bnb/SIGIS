const express = require('express');
const {
  dashboard, listStudents, createStudent, getStudentFile, updateStudent, listPrograms, myStudentFile,
  listCourses, createCourse, updateCourse, listEnrollments, listMyEnrollments, createEnrollment, deleteEnrollment
} = require('../controllers/scolarite.controller');
const { authenticateToken, authorize } = require('../middleware/auth');

const router = express.Router();
router.get('/programs', listPrograms);
router.use(authenticateToken, authorize('ADMIN', 'SCOLARITE', 'ETUDIANT'));
router.get('/dashboard', authorize('ADMIN', 'SCOLARITE'), dashboard);
router.get('/students', authorize('ADMIN', 'SCOLARITE'), listStudents);
router.post('/students', authorize('ADMIN', 'SCOLARITE'), createStudent);
router.get('/students/:id', authorize('ADMIN', 'SCOLARITE'), getStudentFile);
router.patch('/students/:id', authorize('ADMIN', 'SCOLARITE'), updateStudent);
router.get('/me/student', myStudentFile);

router.get('/courses', listCourses);
router.post('/courses', authorize('ADMIN', 'SCOLARITE'), createCourse);
router.patch('/courses/:id', authorize('ADMIN', 'SCOLARITE'), updateCourse);
router.get('/enrollments', authorize('ADMIN', 'SCOLARITE'), listEnrollments);
router.get('/me/enrollments', listMyEnrollments);
router.post('/enrollments', authorize('ADMIN', 'SCOLARITE'), createEnrollment);
router.delete('/enrollments/:id', authorize('ADMIN', 'SCOLARITE'), deleteEnrollment);

module.exports = router;
