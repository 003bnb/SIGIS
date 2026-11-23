const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { after, test } = require('node:test');
const db = require('../src/config/db');

const apiBaseUrl = process.env.API_BASE_URL || 'http://127.0.0.1:3000/api';
const candidateIds = [];
const courseIds = [];

after(async () => {
  await db.end();
});

async function request(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const payload = await response.json();
  return { status: response.status, payload };
}

async function login(email) {
  const { status, payload } = await request('/auth/login', {
    method: 'POST',
    body: { email, password: 'password' }
  });
  assert.equal(status, 200);
  return payload;
}

test('admission acceptance creates one student file and role access stays scoped', async (t) => {
  t.after(async () => {
    if (candidateIds.length) {
      await db.query('DELETE FROM etudiants WHERE candidat_id = ANY($1::bigint[])', [candidateIds]);
      await db.query('DELETE FROM candidats WHERE id = ANY($1::bigint[])', [candidateIds]);
    }
    if (courseIds.length) {
      await db.query('DELETE FROM unites_enseignement WHERE id = ANY($1::bigint[])', [courseIds]);
    }
  });

  const [{ token: adminToken }, studentUser] = await Promise.all([
    login('admin@sigis.local'),
    login('etudiant@sigis.local')
  ]);
  const programs = await request('/scolarite/programs');
  assert.equal(programs.status, 200);
  const programId = programs.payload.programs[0]?.id;
  assert.ok(programId, 'seed data should include a program');

  const missingProgram = await request('/admission', {
    method: 'POST',
    body: {
      nom: 'Test',
      prenom: 'Validation',
      email: `test-${randomUUID()}@example.test`,
      niveau_souhaite: 'L1',
      annee_academique: '2026-2027'
    }
  });
  assert.equal(missingProgram.status, 400);

  const email = `test-${randomUUID()}@example.test`;
  const created = await request('/admission', {
    method: 'POST',
    body: {
      nom: 'Candidat',
      prenom: 'Integration',
      email,
      filiere_id: programId,
      niveau_souhaite: 'L1',
      annee_academique: '2026-2027'
    }
  });
  assert.equal(created.status, 201);
  const candidateId = created.payload.candidate.id;
  candidateIds.push(candidateId);

  const studentAccess = await request('/admission', { token: studentUser.token });
  assert.equal(studentAccess.status, 403);

  const accepted = await request(`/admission/${candidateId}/status`, {
    method: 'PATCH',
    token: adminToken,
    body: { statut: 'ACCEPTE' }
  });
  assert.equal(accepted.status, 200);
  assert.equal(accepted.payload.candidate.statut, 'ACCEPTE');
  assert.match(accepted.payload.student.numero_etudiant, /^SIG-2026-\d{6,}$/);

  const courseData = {
    code: `TEST-${randomUUID().slice(0, 12)}`,
    intitule: 'UE de test',
    filiere_id: programId,
    niveau: 'L1',
    semestre: 1,
    ects: 6
  };
  const createdCourse = await request('/scolarite/courses', {
    method: 'POST',
    token: adminToken,
    body: courseData
  });
  assert.equal(createdCourse.status, 201);
  courseIds.push(createdCourse.payload.course.id);

  const courses = await request('/scolarite/courses', { token: adminToken });
  assert.equal(courses.status, 200);
  assert.ok(courses.payload.courses.some((course) => course.id === createdCourse.payload.course.id));

  const forbiddenCourseCreation = await request('/scolarite/courses', {
    method: 'POST',
    token: studentUser.token,
    body: { ...courseData, code: `NO-${randomUUID().slice(0, 12)}` }
  });
  assert.equal(forbiddenCourseCreation.status, 403);

  const enrollment = await request(`/scolarite/students/${accepted.payload.student.id}/enrollments`, {
    method: 'POST',
    token: adminToken,
    body: { ue_id: createdCourse.payload.course.id }
  });
  assert.equal(enrollment.status, 201);
  assert.equal(enrollment.payload.enrollment.annee_academique, '2026-2027');

  const duplicateEnrollment = await request(`/scolarite/students/${accepted.payload.student.id}/enrollments`, {
    method: 'POST',
    token: adminToken,
    body: { ue_id: createdCourse.payload.course.id }
  });
  assert.equal(duplicateEnrollment.status, 409);

  const mismatchedCourse = await request('/scolarite/courses', {
    method: 'POST',
    token: adminToken,
    body: { ...courseData, code: `TEST-${randomUUID().slice(0, 12)}`, niveau: 'L2' }
  });
  assert.equal(mismatchedCourse.status, 201);
  courseIds.push(mismatchedCourse.payload.course.id);
  const mismatchedEnrollment = await request(`/scolarite/students/${accepted.payload.student.id}/enrollments`, {
    method: 'POST',
    token: adminToken,
    body: { ue_id: mismatchedCourse.payload.course.id }
  });
  assert.equal(mismatchedEnrollment.status, 400);

  const transcript = await request(`/notes/student/${accepted.payload.student.id}/transcript`, {
    token: adminToken
  });
  assert.equal(transcript.status, 200);
  assert.equal(transcript.payload.courses[0].average, null);
  assert.equal(transcript.payload.summary.ects_total, 6);

  const studentFiles = await db.query(
    'SELECT id, numero_etudiant FROM etudiants WHERE candidat_id = $1',
    [candidateId]
  );
  assert.equal(studentFiles.rowCount, 1);
  assert.equal(studentFiles.rows[0].numero_etudiant, accepted.payload.student.numero_etudiant);

  const acceptedAgain = await request(`/admission/${candidateId}/status`, {
    method: 'PATCH',
    token: adminToken,
    body: { statut: 'ACCEPTE' }
  });
  assert.equal(acceptedAgain.status, 200);
  assert.equal(acceptedAgain.payload.student.id, accepted.payload.student.id);
  assert.equal((await db.query('SELECT id FROM etudiants WHERE candidat_id = $1', [candidateId])).rowCount, 1);

  const rejectedAfterAdmission = await request(`/admission/${candidateId}/status`, {
    method: 'PATCH',
    token: adminToken,
    body: { statut: 'REFUSE' }
  });
  assert.equal(rejectedAfterAdmission.status, 409);

  const ownStudent = await db.query(
    `SELECT id FROM etudiants
     WHERE utilisateur_id = (SELECT id FROM utilisateurs WHERE email = $1)`,
    ['etudiant@sigis.local']
  );
  assert.equal(ownStudent.rowCount, 1, 'seed student should be linked to the demo account');
  const ownTranscript = await request(`/notes/student/${ownStudent.rows[0].id}/transcript`, {
    token: studentUser.token
  });
  assert.equal(ownTranscript.status, 200);
  assert.equal(ownTranscript.payload.summary.average, 15.04);

  const forbiddenTranscript = await request(`/notes/student/${accepted.payload.student.id}/transcript`, {
    token: studentUser.token
  });
  assert.equal(forbiddenTranscript.status, 403);
});
