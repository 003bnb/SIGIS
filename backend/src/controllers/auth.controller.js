const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');

async function login(req, res, next) {
  const body = req.body || {};
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');

  if (!email || !password) {
    return res.status(400).json({ error: 'Email et mot de passe sont obligatoires.' });
  }

  try {
    const result = await db.query(
      `SELECT id, nom_complet, email, mot_de_passe_hash, role
       FROM utilisateurs WHERE LOWER(email) = $1 AND actif = TRUE`,
      [email]
    );
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.mot_de_passe_hash))) {
      return res.status(401).json({ error: 'Identifiants incorrects.' });
    }

    const token = jwt.sign(
      { sub: String(user.id), email: user.email, role: user.role, name: user.nom_complet },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );
    return res.json({
      token,
      user: { id: user.id, nom_complet: user.nom_complet, email: user.email, role: user.role }
    });
  } catch (error) {
    return next(error);
  }
}

async function me(req, res, next) {
  try {
    const result = await db.query(
      `SELECT id, nom_complet, email, role FROM utilisateurs WHERE id = $1 AND actif = TRUE`,
      [req.user.sub]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Compte introuvable.' });
    return res.json({ user: result.rows[0] });
  } catch (error) {
    return next(error);
  }
}

async function changePassword(req, res, next) {
  const body = req.body || {};
  const currentPassword = String(body.current_password || '');
  const newPassword = String(body.new_password || '');

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Mot de passe actuel et nouveau mot de passe sont obligatoires.' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'Le nouveau mot de passe doit contenir au moins 8 caractères.' });
  }
  if (currentPassword === newPassword) {
    return res.status(400).json({ error: 'Le nouveau mot de passe doit être différent du mot de passe actuel.' });
  }

  try {
    const result = await db.query(
      `SELECT id, mot_de_passe_hash FROM utilisateurs WHERE id = $1 AND actif = TRUE`,
      [req.user.sub]
    );
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: 'Compte introuvable.' });
    const valid = await bcrypt.compare(currentPassword, user.mot_de_passe_hash);
    if (!valid) return res.status(401).json({ error: 'Mot de passe actuel incorrect.' });

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await db.query(
      `UPDATE utilisateurs SET mot_de_passe_hash = $1, updated_at = NOW() WHERE id = $2`,
      [passwordHash, user.id]
    );
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
}

module.exports = { login, me, changePassword };
