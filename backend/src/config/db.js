const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || 'sigis',
  user: process.env.DB_USER || 'sigis',
  password: process.env.DB_PASSWORD || 'sigis-dev',
  max: Number(process.env.DB_POOL_MAX || 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000
});

pool.on('error', (error) => {
  console.error('Erreur inattendue du pool PostgreSQL :', error);
});

module.exports = pool;
