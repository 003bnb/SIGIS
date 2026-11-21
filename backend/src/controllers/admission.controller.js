const { randomUUID } = require('node:crypto');
const fs = require('node:fs/promises');
const db = require('../config/db');
const {
  getStoredPath, removeFile, safeOriginalName, verifyDiploma
} = require('../middleware/candidate-document');
const { isValidAcademicYear, isValidLevel } = require('../validation/academic');

async function createCandidate(req, res, next) {
  const { nom, prenom, email, telephone, date_naissance, filiere_id, niveau_souhaite, annee_academique } = req.body || {};
  const file = req.file;
  let client;
  let transactionStarted = false;
  let storedPath;

  try {
    if (![nom, prenom, email, filiere_id, niveau_souhaite, annee_academique]
      .every((value) => String(value || '').trim())) {
      await removeFile(file?.path);
      return res.status(400).json({ error: 'Nom, prénom, email, filière, niveau et année académique sont obligatoires.' });
    }
    if (!isValidLevel(niveau_souhaite)) {
      await removeFile(file?.path);
      return res.status(400).json({ error: 'Niveau invalide. Valeurs autorisées : L1, L2, L3, M1, M2.' });
    }
    if (!isValidAcademicYear(annee_academique)) {
      await removeFile(file?.path);
      return res.status(400).json({ error: 'Année académique invalide. Format attendu : YYYY-YYYY avec deux années consécutives.' });
    }
    if (!Number.isInteger(Number(filiere_id)) || Number(filiere_id) < 1) {
      await removeFile(file?.path);
      return res.status(400).json({ error: 'Filière invalide.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      await removeFile(file?.path);
      return res.status(400).json({ error: 'Adresse email invalide.' });
    }
    if (date_naissance && Number.isNaN(Date.parse(date_naissance))) {
      await removeFile(file?.path);
      return res.status(400).json({ error: 'Date de naissance invalide.' });
    }
    if (!file) {
      return res.status(400).json({ error: 'Le dernier diplôme est obligatoire.' });
    }
    const mimeType = await verifyDiploma(file);
    const originalName = safeOriginalName(file.originalname);
    const storageKey = randomUUID();

    client = await db.connect();
    await client.query('BEGIN');
    transactionStarted = true;
    const result = await client.query(
      `INSERT INTO candidats
         (nom, prenom, email, telephone, date_naissance, filiere_id, niveau_souhaite, annee_academique)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, nom, prenom, email, statut, created_at`,
      [nom.trim(), prenom.trim(), email.trim().toLowerCase(), telephone || null,
        date_naissance || null, filiere_id, niveau_souhaite.trim(), annee_academique.trim()]
    );
    const candidate = result.rows[0];
    await client.query(
      `INSERT INTO pieces_candidature
         (candidat_id, type_document, storage_key, nom_original, mime_type, taille_octets)
       VALUES ($1, 'DIPLOME', $2, $3, $4, $5)`,
      [candidate.id, storageKey, originalName, mimeType, file.size]
    );

    storedPath = getStoredPath(storageKey);
    await fs.rename(file.path, storedPath);
    await client.query('COMMIT');
    transactionStarted = false;
    return res.status(201).json({ candidate });
  } catch (error) {
    try {
      if (transactionStarted) await client.query('ROLLBACK');
      await removeFile(file?.path);
      await removeFile(storedPath);
    } catch (cleanupError) {
      return next(cleanupError);
    }
    if (error.code === '23505' && error.constraint === 'idx_candidats_email_annee_unique') {
      return res.status(409).json({ error: 'Une candidature existe déjà pour cette adresse email et cette année académique.' });
    }
    if (error.code === 'INVALID_DOCUMENT_CONTENT') {
      return res.status(400).json({ error: error.message });
    }
    return next(error);
  } finally {
    client?.release();
  }
}

async function listCandidates(req, res, next) {
  try {
    const { rows } = await db.query(
      `SELECT c.id, c.nom, c.prenom, c.email, c.telephone, c.niveau_souhaite,
              c.annee_academique, c.statut, c.notes_admin, c.created_at,
              f.nom AS filiere, e.numero_etudiant, p.nom_original AS diplome_nom
       FROM candidats c LEFT JOIN filieres f ON f.id = c.filiere_id
       LEFT JOIN etudiants e ON e.candidat_id = c.id
       LEFT JOIN pieces_candidature p ON p.candidat_id = c.id AND p.type_document = 'DIPLOME'
       ORDER BY c.created_at DESC LIMIT 200`
    );
    return res.json({ candidates: rows });
  } catch (error) {
    return next(error);
  }
}

async function updateCandidateStatus(req, res, next) {
  const { statut, notes_admin } = req.body || {};
  if (!['EN_ATTENTE', 'ACCEPTE', 'REFUSE'].includes(statut)) {
    return res.status(400).json({ error: 'Statut invalide.' });
  }
  if (typeof notes_admin !== 'undefined' && typeof notes_admin !== 'string') {
    return res.status(400).json({ error: 'Le motif doit être du texte.' });
  }
  const refusalReason = notes_admin?.trim() || null;
  if (statut === 'REFUSE' && !refusalReason) {
    return res.status(400).json({ error: 'Un motif est obligatoire pour refuser une candidature.' });
  }
  if (refusalReason && refusalReason.length > 2000) {
    return res.status(400).json({ error: 'Le motif ne peut pas dépasser 2 000 caractères.' });
  }
  const candidateId = Number(req.params.id);
  if (!Number.isInteger(candidateId) || candidateId < 1) {
    return res.status(400).json({ error: 'Identifiant candidat invalide.' });
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const candidateResult = await client.query(
      `SELECT id, nom, prenom, filiere_id, niveau_souhaite, annee_academique, statut
       FROM candidats WHERE id = $1 FOR UPDATE`,
      [candidateId]
    );
    const candidate = candidateResult.rows[0];
    if (!candidate) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Candidat introuvable.' });
    }
    if (candidate.statut !== 'EN_ATTENTE' && req.user.role !== 'ADMIN') {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Seul un administrateur peut corriger une décision déjà prise.' });
    }

    const existingStudentResult = await client.query(
      `SELECT id, numero_etudiant, statut FROM etudiants WHERE candidat_id = $1`,
      [candidateId]
    );
    const existingStudent = existingStudentResult.rows[0];
    if (statut === 'ACCEPTE' && !candidate.filiere_id) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Une filière doit être associée à la candidature avant son acceptation.' });
    }

    let student = existingStudent || null;
    if (statut === 'ACCEPTE' && !student) {
      const academicYear = candidate.annee_academique.slice(0, 4);
      const studentNumber = `SIG-${academicYear}-${String(candidate.id).padStart(6, '0')}`;
      const studentResult = await client.query(
        `INSERT INTO etudiants
           (numero_etudiant, candidat_id, filiere_id, niveau, annee_academique)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, numero_etudiant, statut`,
        [studentNumber, candidate.id, candidate.filiere_id, candidate.niveau_souhaite, candidate.annee_academique]
      );
      student = studentResult.rows[0];
    }
    if (student && statut !== 'ACCEPTE') {
      const studentResult = await client.query(
        `UPDATE etudiants SET statut = 'RADIE' WHERE id = $1
         RETURNING id, numero_etudiant, statut`,
        [student.id]
      );
      student = studentResult.rows[0];
    }

    const result = await client.query(
      `UPDATE candidats SET statut = $1, notes_admin = COALESCE($2, notes_admin), updated_at = NOW()
       WHERE id = $3
       RETURNING id, nom, prenom, email, statut, notes_admin`,
      [statut, refusalReason, candidateId]
    );
    await client.query('COMMIT');
    return res.json({ candidate: result.rows[0], student });
  } catch (error) {
    await client.query('ROLLBACK');
    return next(error);
  } finally {
    client.release();
  }
}

async function downloadCandidateDiploma(req, res, next) {
  const candidateId = Number(req.params.id);
  if (!Number.isInteger(candidateId) || candidateId < 1) {
    return res.status(400).json({ error: 'Identifiant candidat invalide.' });
  }
  try {
    const { rows } = await db.query(
      `SELECT storage_key, nom_original, mime_type FROM pieces_candidature
       WHERE candidat_id = $1 AND type_document = 'DIPLOME'`,
      [candidateId]
    );
    const document = rows[0];
    if (!document) return res.status(404).json({ error: 'Diplôme introuvable.' });

    const filePath = getStoredPath(document.storage_key);
    try {
      await fs.access(filePath);
    } catch (error) {
      if (error.code === 'ENOENT') return res.status(404).json({ error: 'Fichier du diplôme introuvable.' });
      throw error;
    }
    return res.download(
      filePath,
      safeOriginalName(document.nom_original),
      { headers: { 'Content-Type': document.mime_type } },
      (error) => {
        if (error && !res.headersSent) next(error);
      }
    );
  } catch (error) {
    return next(error);
  }
}

module.exports = { createCandidate, downloadCandidateDiploma, listCandidates, updateCandidateStatus };
