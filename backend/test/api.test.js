const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { after, test } = require('node:test');
const db = require('../src/config/db');

const apiBaseUrl = process.env.API_BASE_URL || 'http://127.0.0.1:3000/api';
const candidateIds = [];
const testStudentIds = [];

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
    if (testStudentIds.length) {
      await db.query('DELETE FROM etudiants WHERE id = ANY($1::bigint[])', [testStudentIds]);
    }
    if (candidateIds.length) {
      await db.query('DELETE FROM etudiants WHERE candidat_id = ANY($1::bigint[])', [candidateIds]);
      await db.query('DELETE FROM candidats WHERE id = ANY($1::bigint[])', [candidateIds]);
    }
    await db.end();
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

  const testCourses = await db.query(
    'SELECT id, filiere_id FROM unites_enseignement ORDER BY id LIMIT 2'
  );
  assert.equal(testCourses.rowCount, 2, 'seed data should include at least two courses');
  const testStudent = await db.query(
    `INSERT INTO etudiants (numero_etudiant, filiere_id, niveau, annee_academique)
     VALUES ($1, $2, 'L2', '2026-2027')
     RETURNING id`,
    [`SIG-T-${randomUUID().slice(0, 20)}`, testCourses.rows[0].filiere_id]
  );
  const testStudentId = testStudent.rows[0].id;
  testStudentIds.push(testStudentId);

  const registrations = [];
  for (const course of testCourses.rows) {
    const registration = await db.query(
      `INSERT INTO inscriptions_ue (etudiant_id, ue_id, annee_academique)
       VALUES ($1, $2, '2026-2027')
       RETURNING id`,
      [testStudentId, course.id]
    );
    registrations.push(registration.rows[0].id);
  }
  await db.query(
    `INSERT INTO notes (inscription_ue_id, type_evaluation, note)
     VALUES ($1, 'CC', 14)`,
    [registrations[0]]
  );
  const incompleteTranscript = await request(
    `/notes/student/${testStudentId}/transcript`,
    { token: adminToken }
  );
  assert.equal(incompleteTranscript.status, 200);
  assert.equal(incompleteTranscript.payload.courses[0].average, 14);
  assert.equal(incompleteTranscript.payload.courses[1].average, null);
  assert.equal(incompleteTranscript.payload.summary.average, null);

  const forbiddenTranscript = await request(`/notes/student/${accepted.payload.student.id}/transcript`, {
    token: studentUser.token
  });
  assert.equal(forbiddenTranscript.status, 403);
});
