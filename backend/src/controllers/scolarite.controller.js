const db = require('../config/db');
const { isValidAcademicYear, isValidLevel } = require('../validation/academic');

async function dashboard(req, res, next) {
  try {
    const { rows } = await db.query(
      `SELECT
         (SELECT COUNT(*)::int FROM etudiants WHERE statut = 'ACTIF') AS etudiants_actifs,
         (SELECT COUNT(*)::int FROM candidats WHERE statut = 'EN_ATTENTE') AS candidatures_en_attente,
         (SELECT COUNT(*)::int FROM unites_enseignement) AS unites_enseignement,
         (SELECT COUNT(*)::int FROM notes) AS notes_saisies`
    );
    return res.json({ indicators: rows[0] });
  } catch (error) {
    return next(error);
  }
}

async function listStudents(req, res, next) {
  try {
    const { rows } = await db.query(
      `SELECT e.id, e.numero_etudiant, e.niveau, e.annee_academique, e.statut,
              u.nom_complet, u.email, f.nom AS filiere
       FROM etudiants e
       LEFT JOIN utilisateurs u ON u.id = e.utilisateur_id
       JOIN filieres f ON f.id = e.filiere_id
       ORDER BY e.numero_etudiant LIMIT 500`
    );
    return res.json({ students: rows });
  } catch (error) {
    return next(error);
  }
}

async function createStudent(req, res, next) {
  const { numero_etudiant, utilisateur_id, filiere_id, niveau, annee_academique } = req.body || {};
  if (![numero_etudiant, filiere_id, niveau, annee_academique].every((value) => String(value || '').trim())) {
    return res.status(400).json({ error: 'Numéro étudiant, filière, niveau et année académique sont obligatoires.' });
  }
  if (!isValidLevel(niveau)) {
    return res.status(400).json({ error: 'Niveau invalide. Valeurs autorisées : L1, L2, L3, M1, M2.' });
  }
  if (!isValidAcademicYear(annee_academique)) {
    return res.status(400).json({ error: 'Année académique invalide. Format attendu : YYYY-YYYY avec deux années consécutives.' });
  }
  try {
    const { rows } = await db.query(
      `INSERT INTO etudiants (numero_etudiant, utilisateur_id, filiere_id, niveau, annee_academique)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, numero_etudiant, niveau, annee_academique, statut`,
      [numero_etudiant.trim(), utilisateur_id || null, filiere_id, niveau.trim(), annee_academique.trim()]
    );
    return res.status(201).json({ student: rows[0] });
  } catch (error) {
    return next(error);
  }
}

async function getStudentFile(req, res, next) {
  try {
    const { rows } = await db.query(
      `SELECT e.id, e.numero_etudiant, e.niveau, e.annee_academique, e.date_inscription, e.statut,
              u.nom_complet, u.email, f.nom AS filiere
       FROM etudiants e
       LEFT JOIN utilisateurs u ON u.id = e.utilisateur_id
       JOIN filieres f ON f.id = e.filiere_id
       WHERE e.id = $1`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Dossier étudiant introuvable.' });
    return res.json({ student: rows[0] });
  } catch (error) {
    return next(error);
  }
}

async function updateStudent(req, res, next) {
  const { filiere_id, niveau, annee_academique, statut } = req.body || {};
  if (filiere_id !== undefined && (!Number.isInteger(Number(filiere_id)) || Number(filiere_id) < 1)) {
    return res.status(400).json({ error: 'Filière invalide.' });
  }
  if (statut !== undefined && !['ACTIF', 'SUSPENDU', 'DIPLOME', 'RADIE'].includes(statut)) {
    return res.status(400).json({ error: 'Statut étudiant invalide.' });
  }
  if (niveau !== undefined && !isValidLevel(niveau)) {
    return res.status(400).json({ error: 'Niveau invalide. Valeurs autorisées : L1, L2, L3, M1, M2.' });
  }
  if (annee_academique !== undefined && !isValidAcademicYear(annee_academique)) {
    return res.status(400).json({ error: 'Année académique invalide. Format attendu : YYYY-YYYY avec deux années consécutives.' });
  }
  try {
    const { rows } = await db.query(
      `UPDATE etudiants
       SET filiere_id = COALESCE($1, filiere_id),
           niveau = COALESCE($2, niveau),
           annee_academique = COALESCE($3, annee_academique),
           statut = COALESCE($4, statut)
       WHERE id = $5
       RETURNING id, numero_etudiant, filiere_id, niveau, annee_academique, statut`,
      [filiere_id ?? null, niveau?.trim() ?? null, annee_academique?.trim() ?? null, statut ?? null, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Dossier étudiant introuvable.' });
    return res.json({ student: rows[0] });
  } catch (error) {
    return next(error);
  }
}

async function listPrograms(req, res, next) {
  try {
    const { rows } = await db.query('SELECT id, code, nom FROM filieres ORDER BY nom');
    return res.json({ programs: rows });
  } catch (error) {
    return next(error);
  }
}

async function myStudentFile(req, res, next) {
  try {
    const { rows } = await db.query(
      `SELECT e.id, e.numero_etudiant, e.niveau, e.annee_academique, e.statut,
              u.nom_complet, u.email, f.nom AS filiere
       FROM etudiants e
       LEFT JOIN utilisateurs u ON u.id = e.utilisateur_id
       JOIN filieres f ON f.id = e.filiere_id
       WHERE e.utilisateur_id = $1`,
      [req.user.sub]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Aucun dossier étudiant associé à ce compte.' });
    return res.json({ student: rows[0] });
  } catch (error) {
    return next(error);
  }
}

async function listCourses(req, res, next) {
  const { filiere_id, niveau, semestre } = req.query || {};
  const filters = [];
  const values = [];
  if (filiere_id !== undefined) {
    if (!Number.isInteger(Number(filiere_id)) || Number(filiere_id) < 1) {
      return res.status(400).json({ error: 'Filière invalide.' });
    }
    values.push(Number(filiere_id));
    filters.push(`ue.filiere_id = $${values.length}`);
  }
  if (niveau !== undefined) {
    if (!isValidLevel(niveau)) {
      return res.status(400).json({ error: 'Niveau invalide. Valeurs autorisées : L1, L2, L3, M1, M2.' });
    }
    values.push(String(niveau).trim());
    filters.push(`ue.niveau = $${values.length}`);
  }
  if (semestre !== undefined) {
    const semester = Number(semestre);
    if (!Number.isInteger(semester) || semester < 1 || semester > 10) {
      return res.status(400).json({ error: 'Semestre invalide. Valeurs autorisées : 1 à 10.' });
    }
    values.push(semester);
    filters.push(`ue.semestre = $${values.length}`);
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  try {
    const { rows } = await db.query(
      `SELECT ue.id, ue.code, ue.intitule, ue.filiere_id, f.nom AS filiere, ue.niveau,
              ue.semestre, ue.ects, ue.coefficient
       FROM unites_enseignement ue
       JOIN filieres f ON f.id = ue.filiere_id
       ${where}
       ORDER BY ue.niveau, ue.semestre, ue.code`,
      values
    );
    return res.json({ courses: rows });
  } catch (error) {
    return next(error);
  }
}

async function createCourse(req, res, next) {
  const { code, intitule, filiere_id, niveau, semestre, ects, coefficient } = req.body || {};
  if (![code, intitule, filiere_id, niveau, semestre, ects].every((value) => String(value ?? '').trim() !== '')) {
    return res.status(400).json({ error: 'Code, intitulé, filière, niveau, semestre et ECTS sont obligatoires.' });
  }
  if (!isValidLevel(niveau)) {
    return res.status(400).json({ error: 'Niveau invalide. Valeurs autorisées : L1, L2, L3, M1, M2.' });
  }
  const semester = Number(semestre);
  const ectsValue = Number(ects);
  const coefficientValue = coefficient === undefined || coefficient === null || coefficient === ''
    ? 1
    : Number(coefficient);
  if (!Number.isInteger(Number(filiere_id)) || Number(filiere_id) < 1) {
    return res.status(400).json({ error: 'Filière invalide.' });
  }
  if (!Number.isInteger(semester) || semester < 1 || semester > 10) {
    return res.status(400).json({ error: 'Semestre invalide. Valeurs autorisées : 1 à 10.' });
  }
  if (!Number.isFinite(ectsValue) || ectsValue <= 0) {
    return res.status(400).json({ error: 'Le nombre d’ECTS doit être supérieur à 0.' });
  }
  if (!Number.isFinite(coefficientValue) || coefficientValue <= 0) {
    return res.status(400).json({ error: 'Le coefficient doit être supérieur à 0.' });
  }
  try {
    const { rows } = await db.query(
      `INSERT INTO unites_enseignement (code, intitule, filiere_id, niveau, semestre, ects, coefficient)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, code, intitule, filiere_id, niveau, semestre, ects, coefficient`,
      [String(code).trim(), String(intitule).trim(), Number(filiere_id), String(niveau).trim(), semester, ectsValue, coefficientValue]
    );
    return res.status(201).json({ course: rows[0] });
  } catch (error) {
    return next(error);
  }
}

async function updateCourse(req, res, next) {
  const courseId = Number(req.params.id);
  if (!Number.isInteger(courseId) || courseId < 1) {
    return res.status(400).json({ error: 'Identifiant UE invalide.' });
  }
  const { code, intitule, filiere_id, niveau, semestre, ects, coefficient } = req.body || {};
  if ([code, intitule, filiere_id, niveau, semestre, ects, coefficient].every((value) => value === undefined)) {
    return res.status(400).json({ error: 'Aucune modification fournie.' });
  }
  if (niveau !== undefined && !isValidLevel(niveau)) {
    return res.status(400).json({ error: 'Niveau invalide. Valeurs autorisées : L1, L2, L3, M1, M2.' });
  }
  if (filiere_id !== undefined && (!Number.isInteger(Number(filiere_id)) || Number(filiere_id) < 1)) {
    return res.status(400).json({ error: 'Filière invalide.' });
  }
  if (semestre !== undefined) {
    const semester = Number(semestre);
    if (!Number.isInteger(semester) || semester < 1 || semester > 10) {
      return res.status(400).json({ error: 'Semestre invalide. Valeurs autorisées : 1 à 10.' });
    }
  }
  if (ects !== undefined && (!Number.isFinite(Number(ects)) || Number(ects) <= 0)) {
    return res.status(400).json({ error: 'Le nombre d’ECTS doit être supérieur à 0.' });
  }
  if (coefficient !== undefined && (!Number.isFinite(Number(coefficient)) || Number(coefficient) <= 0)) {
    return res.status(400).json({ error: 'Le coefficient doit être supérieur à 0.' });
  }
  try {
    const { rows } = await db.query(
      `UPDATE unites_enseignement
       SET code = COALESCE($1, code),
           intitule = COALESCE($2, intitule),
           filiere_id = COALESCE($3, filiere_id),
           niveau = COALESCE($4, niveau),
           semestre = COALESCE($5, semestre),
           ects = COALESCE($6, ects),
           coefficient = COALESCE($7, coefficient)
       WHERE id = $8
       RETURNING id, code, intitule, filiere_id, niveau, semestre, ects, coefficient`,
      [
        code === undefined ? null : String(code).trim(),
        intitule === undefined ? null : String(intitule).trim(),
        filiere_id === undefined ? null : Number(filiere_id),
        niveau === undefined ? null : String(niveau).trim(),
        semestre === undefined ? null : Number(semestre),
        ects === undefined ? null : Number(ects),
        coefficient === undefined ? null : Number(coefficient),
        courseId
      ]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Unité d’enseignement introuvable.' });
    return res.json({ course: rows[0] });
  } catch (error) {
    return next(error);
  }
}

async function listEnrollments(req, res, next) {
  const { etudiant_id, annee_academique } = req.query || {};
  const filters = [];
  const values = [];
  if (etudiant_id !== undefined) {
    if (!Number.isInteger(Number(etudiant_id)) || Number(etudiant_id) < 1) {
      return res.status(400).json({ error: 'Identifiant étudiant invalide.' });
    }
    values.push(Number(etudiant_id));
    filters.push(`i.etudiant_id = $${values.length}`);
  }
  if (annee_academique !== undefined) {
    if (!isValidAcademicYear(annee_academique)) {
      return res.status(400).json({ error: 'Année académique invalide. Format attendu : YYYY-YYYY avec deux années consécutives.' });
    }
    values.push(String(annee_academique).trim());
    filters.push(`i.annee_academique = $${values.length}`);
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  try {
    const { rows } = await db.query(
      `SELECT i.id, i.etudiant_id, e.numero_etudiant, i.ue_id, ue.code, ue.intitule,
              ue.semestre, ue.ects, i.annee_academique, i.created_at
       FROM inscriptions_ue i
       JOIN etudiants e ON e.id = i.etudiant_id
       JOIN unites_enseignement ue ON ue.id = i.ue_id
       ${where}
       ORDER BY i.annee_academique DESC, e.numero_etudiant, ue.semestre, ue.code`,
      values
    );
    return res.json({ enrollments: rows });
  } catch (error) {
    return next(error);
  }
}

async function listMyEnrollments(req, res, next) {
  try {
    const studentResult = await db.query('SELECT id FROM etudiants WHERE utilisateur_id = $1', [req.user.sub]);
    const student = studentResult.rows[0];
    if (!student) return res.status(404).json({ error: 'Aucun dossier étudiant associé à ce compte.' });
    const { rows } = await db.query(
      `SELECT i.id, i.etudiant_id, e.numero_etudiant, i.ue_id, ue.code, ue.intitule,
              ue.semestre, ue.ects, i.annee_academique, i.created_at
       FROM inscriptions_ue i
       JOIN etudiants e ON e.id = i.etudiant_id
       JOIN unites_enseignement ue ON ue.id = i.ue_id
       WHERE i.etudiant_id = $1
       ORDER BY i.annee_academique DESC, ue.semestre, ue.code`,
      [student.id]
    );
    return res.json({ enrollments: rows });
  } catch (error) {
    return next(error);
  }
}

async function createEnrollment(req, res, next) {
  const { etudiant_id, ue_id, annee_academique } = req.body || {};
  if (![etudiant_id, ue_id, annee_academique].every((value) => String(value ?? '').trim() !== '')) {
    return res.status(400).json({ error: 'Étudiant, UE et année académique sont obligatoires.' });
  }
  if (!Number.isInteger(Number(etudiant_id)) || Number(etudiant_id) < 1 ||
      !Number.isInteger(Number(ue_id)) || Number(ue_id) < 1) {
    return res.status(400).json({ error: 'Identifiant étudiant ou UE invalide.' });
  }
  if (!isValidAcademicYear(annee_academique)) {
    return res.status(400).json({ error: 'Année académique invalide. Format attendu : YYYY-YYYY avec deux années consécutives.' });
  }
  try {
    const { rows } = await db.query(
      `INSERT INTO inscriptions_ue (etudiant_id, ue_id, annee_academique)
       VALUES ($1, $2, $3)
       RETURNING id, etudiant_id, ue_id, annee_academique, created_at`,
      [Number(etudiant_id), Number(ue_id), String(annee_academique).trim()]
    );
    return res.status(201).json({ enrollment: rows[0] });
  } catch (error) {
    return next(error);
  }
}

async function deleteEnrollment(req, res, next) {
  const enrollmentId = Number(req.params.id);
  if (!Number.isInteger(enrollmentId) || enrollmentId < 1) {
    return res.status(400).json({ error: 'Identifiant d’inscription invalide.' });
  }
  try {
    const { rows } = await db.query(
      'DELETE FROM inscriptions_ue WHERE id = $1 RETURNING id',
      [enrollmentId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Inscription introuvable.' });
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  dashboard, listStudents, createStudent, getStudentFile, updateStudent, listPrograms, myStudentFile,
  listCourses, createCourse, updateCourse, listEnrollments, listMyEnrollments, createEnrollment, deleteEnrollment
};
