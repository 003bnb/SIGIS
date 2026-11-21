const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { after, test } = require('node:test');
const db = require('../src/config/db');
const { getStoredPath, removeFile } = require('../src/middleware/candidate-document');

const apiBaseUrl = process.env.API_BASE_URL || 'http://127.0.0.1:3000/api';
const candidateIds = [];
const candidateDocumentKeys = [];
const testStudentIds = [];

async function request(path, { method = 'GET', body, file, token } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let requestBody;
  if (file) {
    const formData = new FormData();
    for (const [key, value] of Object.entries(body || {})) formData.append(key, value);
    formData.append('diplome', new Blob([file.content], { type: file.type }), file.name);
    requestBody = formData;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    requestBody = JSON.stringify(body);
  }
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method,
    headers,
    body: requestBody
  });
  const payload = await response.json();
  return { status: response.status, payload };
}

async function download(path, token) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return {
    status: response.status,
    contentType: response.headers.get('content-type'),
    content: Buffer.from(await response.arrayBuffer())
  };
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
    for (const storageKey of candidateDocumentKeys) {
      await removeFile(getStoredPath(storageKey));
    }
    if (testStudentIds.length) {
      await db.query('DELETE FROM etudiants WHERE id = ANY($1::bigint[])', [testStudentIds]);
    }
    if (candidateIds.length) {
      await db.query('DELETE FROM etudiants WHERE candidat_id = ANY($1::bigint[])', [candidateIds]);
      await db.query('DELETE FROM candidats WHERE id = ANY($1::bigint[])', [candidateIds]);
    }
    await db.end();
  });

  const [{ token: adminToken }, studentUser, { token: staffToken }] = await Promise.all([
    login('admin@sigis.local'),
    login('etudiant@sigis.local'),
    login('scolarite@sigis.local')
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

  const invalidCandidateLevel = await request('/admission', {
    method: 'POST',
    body: {
      nom: 'Test',
      prenom: 'Niveau',
      email: `test-${randomUUID()}@example.test`,
      filiere_id: programId,
      niveau_souhaite: 'D1',
      annee_academique: '2026-2027'
    }
  });
  assert.equal(invalidCandidateLevel.status, 400);

  const invalidCandidateYear = await request('/admission', {
    method: 'POST',
    body: {
      nom: 'Test',
      prenom: 'Année',
      email: `test-${randomUUID()}@example.test`,
      filiere_id: programId,
      niveau_souhaite: 'L1',
      annee_academique: '2026-2028'
    }
  });
  assert.equal(invalidCandidateYear.status, 400);

  const invalidStudentLevel = await request('/scolarite/students', {
    method: 'POST',
    token: adminToken,
    body: {
      numero_etudiant: `SIG-T-${randomUUID().slice(0, 20)}`,
      filiere_id: programId,
      niveau: 'D1',
      annee_academique: '2026-2027'
    }
  });
  assert.equal(invalidStudentLevel.status, 400);

  const invalidStudentYear = await request('/scolarite/students', {
    method: 'POST',
    token: adminToken,
    body: {
      numero_etudiant: `SIG-T-${randomUUID().slice(0, 20)}`,
      filiere_id: programId,
      niveau: 'L1',
      annee_academique: '2026-2028'
    }
  });
  assert.equal(invalidStudentYear.status, 400);

  const email = `test-${randomUUID()}@example.test`;
  const validDiploma = {
    content: '%PDF-1.7\nSIGIS test diploma',
    type: 'application/pdf',
    name: 'diplome.pdf'
  };
  const missingDiploma = await request('/admission', {
    method: 'POST',
    body: {
      nom: 'Candidat',
      prenom: 'SansPiece',
      email: `test-${randomUUID()}@example.test`,
      filiere_id: programId,
      niveau_souhaite: 'L1',
      annee_academique: '2026-2027'
    }
  });
  assert.equal(missingDiploma.status, 400);

  const invalidDiploma = await request('/admission', {
    method: 'POST',
    body: {
      nom: 'Candidat',
      prenom: 'FichierInvalide',
      email: `test-${randomUUID()}@example.test`,
      filiere_id: programId,
      niveau_souhaite: 'L1',
      annee_academique: '2026-2027'
    },
    file: { content: 'not a pdf', type: 'application/pdf', name: 'fake.pdf' }
  });
  assert.equal(invalidDiploma.status, 400);

  const oversizedDiploma = await request('/admission', {
    method: 'POST',
    body: {
      nom: 'Candidat',
      prenom: 'FichierVolumineux',
      email: `test-${randomUUID()}@example.test`,
      filiere_id: programId,
      niveau_souhaite: 'L1',
      annee_academique: '2026-2027'
    },
    file: {
      content: Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(5 * 1024 * 1024)]),
      type: 'application/pdf',
      name: 'volumineux.pdf'
    }
  });
  assert.equal(oversizedDiploma.status, 413);

  const created = await request('/admission', {
    method: 'POST',
    body: {
      nom: 'Candidat',
      prenom: 'Integration',
      email,
      filiere_id: programId,
      niveau_souhaite: 'L1',
      annee_academique: '2026-2027'
    },
    file: validDiploma
  });
  assert.equal(created.status, 201);
  const candidateId = created.payload.candidate.id;
  candidateIds.push(candidateId);
  const savedDocument = await db.query(
    `SELECT storage_key FROM pieces_candidature
     WHERE candidat_id = $1 AND type_document = 'DIPLOME'`,
    [candidateId]
  );
  assert.equal(savedDocument.rowCount, 1);
  candidateDocumentKeys.push(savedDocument.rows[0].storage_key);

  const duplicate = await request('/admission', {
    method: 'POST',
    body: {
      nom: 'Candidat',
      prenom: 'Doublon',
      email: email.toUpperCase(),
      filiere_id: programId,
      niveau_souhaite: 'L1',
      annee_academique: '2026-2027'
    },
    file: validDiploma
  });
  assert.equal(duplicate.status, 409);

  const adminDownload = await download(`/admission/${candidateId}/documents/diplome`, adminToken);
  assert.equal(adminDownload.status, 200);
  assert.match(adminDownload.contentType, /^application\/pdf/);
  assert.equal(adminDownload.content.subarray(0, 5).toString(), '%PDF-');
  const studentDownload = await download(`/admission/${candidateId}/documents/diplome`, studentUser.token);
  assert.equal(studentDownload.status, 403);

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

  const refusalWithoutReason = await request(`/admission/${candidateId}/status`, {
    method: 'PATCH',
    token: adminToken,
    body: { statut: 'REFUSE' }
  });
  assert.equal(refusalWithoutReason.status, 400);

  const rejectedAfterAdmission = await request(`/admission/${candidateId}/status`, {
    method: 'PATCH',
    token: adminToken,
    body: { statut: 'REFUSE', notes_admin: 'Admission corrigée par erreur.' }
  });
  assert.equal(rejectedAfterAdmission.status, 200);
  assert.equal(rejectedAfterAdmission.payload.student.statut, 'RADIE');

  const staffCorrection = await request(`/admission/${candidateId}/status`, {
    method: 'PATCH',
    token: staffToken,
    body: { statut: 'EN_ATTENTE' }
  });
  assert.equal(staffCorrection.status, 403);

  const reopened = await request(`/admission/${candidateId}/status`, {
    method: 'PATCH',
    token: adminToken,
    body: { statut: 'EN_ATTENTE' }
  });
  assert.equal(reopened.status, 200);

  const reaccepted = await request(`/admission/${candidateId}/status`, {
    method: 'PATCH',
    token: adminToken,
    body: { statut: 'ACCEPTE' }
  });
  assert.equal(reaccepted.status, 200);
  assert.equal(reaccepted.payload.student.statut, 'RADIE');

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

  const invalidDatabaseInserts = [
    () => db.query(
      `INSERT INTO candidats (nom, prenom, email, filiere_id, niveau_souhaite, annee_academique)
       VALUES ('Test', 'Niveau', $1, $2, 'D1', '2026-2027')`,
      [`test-${randomUUID()}@example.test`, testCourses.rows[0].filiere_id]
    ),
    () => db.query(
      `INSERT INTO candidats (nom, prenom, email, filiere_id, niveau_souhaite, annee_academique)
       VALUES ('Test', 'Année', $1, $2, 'L1', '2026-2028')`,
      [`test-${randomUUID()}@example.test`, testCourses.rows[0].filiere_id]
    ),
    () => db.query(
      `INSERT INTO etudiants (numero_etudiant, filiere_id, niveau, annee_academique)
       VALUES ($1, $2, 'D1', '2026-2027')`,
      [`SIG-T-${randomUUID().slice(0, 20)}`, testCourses.rows[0].filiere_id]
    ),
    () => db.query(
      `INSERT INTO etudiants (numero_etudiant, filiere_id, niveau, annee_academique)
       VALUES ($1, $2, 'L1', '2026-2028')`,
      [`SIG-T-${randomUUID().slice(0, 20)}`, testCourses.rows[0].filiere_id]
    )
  ];
  for (const invalidInsert of invalidDatabaseInserts) {
    await assert.rejects(invalidInsert(), (error) => error.code === '23514');
  }

  await assert.rejects(
    db.query(
      `INSERT INTO unites_enseignement (code, intitule, filiere_id, niveau, semestre, ects)
       VALUES ($1, 'Semestre invalide', $2, 'L2', 11, 5)`,
      [`UE-T-${randomUUID().slice(0, 20)}`, testCourses.rows[0].filiere_id]
    ),
    (error) => error.code === '23514'
  );

  const testStudent = await db.query(
    `INSERT INTO etudiants (numero_etudiant, filiere_id, niveau, annee_academique)
     VALUES ($1, $2, 'L2', '2026-2027')
     RETURNING id`,
    [`SIG-T-${randomUUID().slice(0, 20)}`, testCourses.rows[0].filiere_id]
  );
  const testStudentId = testStudent.rows[0].id;
  testStudentIds.push(testStudentId);

  const invalidStudentUpdate = await request(`/scolarite/students/${testStudentId}`, {
    method: 'PATCH',
    token: adminToken,
    body: { niveau: 'D1' }
  });
  assert.equal(invalidStudentUpdate.status, 400);

  const invalidStudentYearUpdate = await request(`/scolarite/students/${testStudentId}`, {
    method: 'PATCH',
    token: adminToken,
    body: { annee_academique: '2026-2028' }
  });
  assert.equal(invalidStudentYearUpdate.status, 400);

  await assert.rejects(
    db.query(
      `INSERT INTO inscriptions_ue (etudiant_id, ue_id, annee_academique)
       VALUES ($1, $2, '2026-2028')`,
      [testStudentId, testCourses.rows[0].id]
    ),
    (error) => error.code === '23514'
  );

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
