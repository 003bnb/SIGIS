const db = require('../config/db');

async function createCandidate(req, res, next) {
  const { nom, prenom, email, telephone, date_naissance, filiere_id, niveau_souhaite, annee_academique } = req.body || {};
  if (![nom, prenom, email, filiere_id, niveau_souhaite, annee_academique]
    .every((value) => String(value || '').trim())) {
    return res.status(400).json({ error: 'Nom, prénom, email, filière, niveau et année académique sont obligatoires.' });
  }
  if (!Number.isInteger(Number(filiere_id)) || Number(filiere_id) < 1) {
    return res.status(400).json({ error: 'Filière invalide.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Adresse email invalide.' });
  }
  if (date_naissance && Number.isNaN(Date.parse(date_naissance))) {
    return res.status(400).json({ error: 'Date de naissance invalide.' });
  }

  try {
    const result = await db.query(
      `INSERT INTO candidats
         (nom, prenom, email, telephone, date_naissance, filiere_id, niveau_souhaite, annee_academique)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, nom, prenom, email, statut, created_at`,
      [nom.trim(), prenom.trim(), email.trim().toLowerCase(), telephone || null,
        date_naissance || null, filiere_id, niveau_souhaite.trim(), annee_academique.trim()]
    );
    return res.status(201).json({ candidate: result.rows[0] });
  } catch (error) {
    return next(error);
  }
}

async function listCandidates(req, res, next) {
  try {
    const { rows } = await db.query(
      `SELECT c.id, c.nom, c.prenom, c.email, c.telephone, c.niveau_souhaite,
              c.annee_academique, c.statut, c.notes_admin, c.created_at,
              f.nom AS filiere, e.numero_etudiant
       FROM candidats c LEFT JOIN filieres f ON f.id = c.filiere_id
       LEFT JOIN etudiants e ON e.candidat_id = c.id
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

    const existingStudentResult = await client.query(
      `SELECT id, numero_etudiant FROM etudiants WHERE candidat_id = $1`,
      [candidateId]
    );
    const existingStudent = existingStudentResult.rows[0];
    if (existingStudent && statut !== 'ACCEPTE') {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'Un dossier étudiant existe déjà. Gérez son statut depuis la scolarité.',
        student: existingStudent
      });
    }
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
         RETURNING id, numero_etudiant`,
        [studentNumber, candidate.id, candidate.filiere_id, candidate.niveau_souhaite, candidate.annee_academique]
      );
      student = studentResult.rows[0];
    }

    const result = await client.query(
      `UPDATE candidats SET statut = $1, notes_admin = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING id, nom, prenom, email, statut, notes_admin`,
      [statut, notes_admin ?? null, candidateId]
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

module.exports = { createCandidate, listCandidates, updateCandidateStatus };
