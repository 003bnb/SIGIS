require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const db = require('./config/db');

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET doit contenir au moins 32 caractères.');
}

const app = express();
const port = Number(process.env.PORT || 3000);
const allowedOrigins = (process.env.FRONTEND_ORIGIN || 'http://localhost:8080')
  .split(',').map((origin) => origin.trim());

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origine CORS non autorisée.'));
  }
}));
app.use(express.json({ limit: '100kb' }));
app.use('/api/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 20 }));
app.use('/api/admission', rateLimit({ windowMs: 60 * 60 * 1000, limit: 30 }));
app.get('/api/health', async (req, res, next) => {
  try {
    await db.query('SELECT 1');
    return res.json({ status: 'ok', database: 'connected' });
  } catch (error) {
    return next(error);
  }
});

app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/users', require('./routes/users.routes'));
app.use('/api/admission', require('./routes/admission.routes'));
app.use('/api/scolarite', require('./routes/scolarite.routes'));
app.use('/api/notes', require('./routes/notes.routes'));
app.use((req, res) => res.status(404).json({ error: 'Route introuvable.' }));
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error.code === '23503') return res.status(400).json({ error: 'Référence inconnue.' });
  if (error.code === '23505') return res.status(409).json({ error: 'Un enregistrement similaire existe déjà.' });
  if (error.code?.startsWith('22')) return res.status(400).json({ error: 'Valeur invalide pour un champ.' });
  if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'Corps JSON invalide.' });
  console.error(error);
  return res.status(500).json({ error: 'Erreur interne du serveur.' });
});

const server = app.listen(port, () => console.log(`API SIGIS disponible sur le port ${port}`));

async function shutdown(signal) {
  console.log(`${signal} reçu, arrêt de l’API…`);
  server.close(async () => {
    await db.end();
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
