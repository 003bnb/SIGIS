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

module.exports = {
  dashboard, listStudents, createStudent, getStudentFile, updateStudent, listPrograms, myStudentFile
};
