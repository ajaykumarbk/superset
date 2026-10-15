// backend/database.js  (legacy CommonJS – kept for compatibility)
// The TypeScript project uses src/config/database.ts instead.
const { Pool } = require('pg');

const isLocal = (process.env.NODE_ENV || 'development') === 'development';

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  user:     process.env.DB_USER     || 'superset',
  database: process.env.DB_DATABASE || 'superset_db',
  password: process.env.DB_PASSWORD || 'superset_local_pw',
  port:     parseInt(process.env.DB_PORT || '5432'),
  // Disable SSL for local dev; enable for production
  ssl: isLocal ? false : { rejectUnauthorized: false },
  connectionTimeoutMillis: 5000
});

async function initDatabase() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS game_users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS game_user_stats (
        user_id INT PRIMARY KEY REFERENCES game_users(id) ON DELETE CASCADE,
        games_played INT DEFAULT 0,
        wins INT DEFAULT 0
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS game_history (
        id SERIAL PRIMARY KEY,
        winner_id INT REFERENCES game_users(id) ON DELETE SET NULL,
        played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query('COMMIT');
    console.log('Database tables verified/created successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error initializing database schema:', err);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  initDatabase
};
