const bcrypt = require('bcryptjs');
const db = require('../config/db');

const ROLES = new Set(['ADMIN', 'SCOLARITE', 'ETUDIANT']);

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 8) {
    return 'Le mot de passe doit contenir au moins 8 caractères.';
  }
  return null;
}

async function listUsers(req, res, next) {
  try {
    const { rows } = await db.query(
      `SELECT u.id, u.nom_complet, u.email, u.role, u.actif, u.created_at, u.updated_at,
              e.id AS etudiant_id, e.numero_etudiant
       FROM utilisateurs u
       LEFT JOIN etudiants e ON e.utilisateur_id = u.id
       ORDER BY u.created_at DESC, u.id DESC`
    );
    return res.json({ users: rows });
  } catch (error) {
    return next(error);
  }
}

async function createUser(req, res, next) {
  const body = req.body || {};
  const nomComplet = String(body.nom_complet || '').trim();
  const email = normalizeEmail(body.email);
  const password = body.password;
  const role = String(body.role || '').trim().toUpperCase();
  const actif = body.actif === undefined ? true : body.actif;

  if (!nomComplet || !email || password === undefined || !role) {
    return res.status(400).json({ error: 'Nom complet, email, mot de passe et rôle sont obligatoires.' });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Adresse email invalide.' });
  }
  if (!ROLES.has(role)) {
    return res.status(400).json({ error: 'Rôle invalide. Valeurs autorisées : ADMIN, SCOLARITE, ETUDIANT.' });
  }
  if (typeof actif !== 'boolean') {
    return res.status(400).json({ error: 'Le statut actif doit être un booléen.' });
  }
  const passwordError = validatePassword(password);
  if (passwordError) {
    return res.status(400).json({ error: passwordError });
  }

  try {
    const passwordHash = await bcrypt.hash(String(password), 10);
    const { rows } = await db.query(
      `INSERT INTO utilisateurs (nom_complet, email, mot_de_passe_hash, role, actif)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, nom_complet, email, role, actif, created_at`,
      [nomComplet, email, passwordHash, role, actif]
    );
    return res.status(201).json({ user: rows[0] });
  } catch (error) {
    return next(error);
  }
}

async function updateUser(req, res, next) {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId) || userId < 1) {
    return res.status(400).json({ error: 'Identifiant utilisateur invalide.' });
  }

  const body = req.body || {};
  const hasNom = Object.prototype.hasOwnProperty.call(body, 'nom_complet');
  const hasEmail = Object.prototype.hasOwnProperty.call(body, 'email');
  const hasRole = Object.prototype.hasOwnProperty.call(body, 'role');
  const hasActif = Object.prototype.hasOwnProperty.call(body, 'actif');
  const hasPassword = Object.prototype.hasOwnProperty.call(body, 'password');
  const hasLink = Object.prototype.hasOwnProperty.call(body, 'etudiant_id');

  if (![hasNom, hasEmail, hasRole, hasActif, hasPassword, hasLink].some(Boolean)) {
    return res.status(400).json({ error: 'Aucune modification fournie.' });
  }

  const nomComplet = hasNom ? String(body.nom_complet || '').trim() : null;
  const email = hasEmail ? normalizeEmail(body.email) : null;
  const role = hasRole ? String(body.role || '').trim().toUpperCase() : null;
  const actif = hasActif ? body.actif : null;
  const password = hasPassword ? body.password : null;
  const etudiantId = hasLink ? body.etudiant_id : undefined;

  if (hasNom && !nomComplet) return res.status(400).json({ error: 'Nom complet invalide.' });
  if (hasEmail && !isValidEmail(email)) return res.status(400).json({ error: 'Adresse email invalide.' });
  if (hasRole && !ROLES.has(role)) {
    return res.status(400).json({ error: 'Rôle invalide. Valeurs autorisées : ADMIN, SCOLARITE, ETUDIANT.' });
  }
  if (hasActif && typeof actif !== 'boolean') {
    return res.status(400).json({ error: 'Le statut actif doit être un booléen.' });
  }
  if (hasPassword) {
    const passwordError = validatePassword(password);
    if (passwordError) return res.status(400).json({ error: passwordError });
  }
  if (hasLink && etudiantId !== null && (!Number.isInteger(Number(etudiantId)) || Number(etudiantId) < 1)) {
    return res.status(400).json({ error: 'Identifiant étudiant invalide.' });
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query('SELECT id FROM utilisateurs WHERE id = $1 FOR UPDATE', [userId]);
    if (!existing.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Utilisateur introuvable.' });
    }

    if (hasLink) {
      await client.query('UPDATE etudiants SET utilisateur_id = NULL WHERE utilisateur_id = $1', [userId]);
      if (etudiantId !== null) {
        const linked = await client.query(
          `UPDATE etudiants SET utilisateur_id = $1 WHERE id = $2
           RETURNING id, numero_etudiant`,
          [userId, etudiantId]
        );
        if (!linked.rows[0]) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: 'Dossier étudiant introuvable.' });
        }
      }
    }

    const passwordHash = hasPassword ? await bcrypt.hash(String(password), 10) : null;
    const { rows } = await client.query(
      `UPDATE utilisateurs
       SET nom_complet = COALESCE($1, nom_complet),
           email = COALESCE($2, email),
           role = COALESCE($3, role),
           actif = COALESCE($4, actif),
           mot_de_passe_hash = COALESCE($5, mot_de_passe_hash),
           updated_at = NOW()
       WHERE id = $6
       RETURNING id, nom_complet, email, role, actif, updated_at`,
      [nomComplet, email, role, actif, passwordHash, userId]
    );

    await client.query('COMMIT');
    return res.json({ user: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    return next(error);
  } finally {
    client.release();
  }
}

module.exports = { listUsers, createUser, updateUser };
