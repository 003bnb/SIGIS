const db = require('../config/db');

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
  if (niveau !== undefined && !String(niveau).trim()) {
    return res.status(400).json({ error: 'Le niveau ne peut pas être vide.' });
  }
  if (annee_academique !== undefined && !String(annee_academique).trim()) {
    return res.status(400).json({ error: 'L’année académique ne peut pas être vide.' });
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

async function listCourses(req, res, next) {
  try {
    const { rows } = await db.query(
      `SELECT ue.id, ue.code, ue.intitule, ue.filiere_id, f.nom AS filiere,
              ue.niveau, ue.semestre, ue.ects, ue.coefficient
       FROM unites_enseignement ue
       JOIN filieres f ON f.id = ue.filiere_id
       ORDER BY f.nom, ue.niveau, ue.semestre, ue.code`
    );
    return res.json({ courses: rows });
  } catch (error) {
    return next(error);
  }
}

async function createCourse(req, res, next) {
  const { code, intitule, filiere_id, niveau, semestre, ects, coefficient = 1 } = req.body || {};
  const programId = Number(filiere_id);
  const semester = Number(semestre);
  const credits = Number(ects);
  const courseCoefficient = Number(coefficient);
  if (![code, intitule, niveau].every((value) => typeof value === 'string' && value.trim()) ||
      !Number.isInteger(programId) || programId < 1 ||
      !Number.isInteger(semester) || semester < 1 || semester > 12 ||
      !Number.isFinite(credits) || credits <= 0 ||
      !Number.isFinite(courseCoefficient) || courseCoefficient <= 0) {
    return res.status(400).json({ error: 'Code, intitulé, filière, niveau, semestre, ECTS ou coefficient invalide.' });
  }

  try {
    const { rows } = await db.query(
      `INSERT INTO unites_enseignement (code, intitule, filiere_id, niveau, semestre, ects, coefficient)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, code, intitule, filiere_id, niveau, semestre, ects, coefficient`,
      [code.trim(), intitule.trim(), programId, niveau.trim(), semester, credits, courseCoefficient]
    );
    return res.status(201).json({ course: rows[0] });
  } catch (error) {
    return next(error);
  }
}

async function enrollStudentInCourse(req, res, next) {
  const studentId = Number(req.params.id);
  const courseId = Number(req.body?.ue_id);
  if (!Number.isInteger(studentId) || studentId < 1 ||
      !Number.isInteger(courseId) || courseId < 1) {
    return res.status(400).json({ error: 'Identifiant étudiant ou UE invalide.' });
  }

  try {
    const { rows } = await db.query(
      `INSERT INTO inscriptions_ue (etudiant_id, ue_id, annee_academique)
       SELECT e.id, ue.id, e.annee_academique
       FROM etudiants e
       JOIN unites_enseignement ue
         ON ue.id = $2 AND ue.filiere_id = e.filiere_id AND ue.niveau = e.niveau
       WHERE e.id = $1
       RETURNING id, etudiant_id, ue_id, annee_academique`,
      [studentId, courseId]
    );
    if (!rows[0]) {
      const student = await db.query('SELECT id FROM etudiants WHERE id = $1', [studentId]);
      if (!student.rows[0]) return res.status(404).json({ error: 'Dossier étudiant introuvable.' });
      const course = await db.query('SELECT id FROM unites_enseignement WHERE id = $1', [courseId]);
      if (!course.rows[0]) return res.status(404).json({ error: 'Unité d’enseignement introuvable.' });
      return res.status(400).json({ error: 'Cette UE ne correspond pas à la filière et au niveau de l’étudiant.' });
    }
    return res.status(201).json({ enrollment: rows[0] });
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

module.exports = {
  dashboard, listStudents, createStudent, getStudentFile, updateStudent, listPrograms,
  listCourses, createCourse, enrollStudentInCourse, myStudentFile
};
