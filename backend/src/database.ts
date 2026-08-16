// backend/src/database.ts
import { Pool } from 'pg';

export const pool = new Pool({
  host:     process.env.DB_HOST     || '129.159.233.130',
  user:     process.env.DB_USER     || 'myuser',
  database: process.env.DB_DATABASE || 'mydb',
  password: process.env.DB_PASSWORD || 'mypassword',
  port:     parseInt(process.env.DB_PORT || '5432', 10),
  ssl: {
    rejectUnauthorized: false
  },
  connectionTimeoutMillis: 5000
});

export async function initDatabase(): Promise<void> {
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
    throw err;
  } finally {
    client.release();
  }
}
