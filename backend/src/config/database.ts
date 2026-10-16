// backend/src/config/database.ts
import { Pool } from 'pg';
import { ENV } from './env';

// DB_SSL=true only when connecting to a cloud Postgres that requires SSL (e.g. Render, Railway)
// Set DB_SSL=false (or leave unset) for local Docker Postgres
const useSSL = ENV.DB_SSL === 'true';

export const pool = new Pool({
  host:     ENV.DB_HOST,
  user:     ENV.DB_USER,
  database: ENV.DB_DATABASE,
  password: ENV.DB_PASSWORD,
  port:     ENV.DB_PORT,
  ssl: useSSL ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 15000,
  idleTimeoutMillis: 30000,
  max: 20,
});

export async function initDatabase(retries = 3): Promise<void> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
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
        await client.query(`
          CREATE TABLE IF NOT EXISTS game_wallets (
            user_id INT PRIMARY KEY REFERENCES game_users(id) ON DELETE CASCADE,
            practice_chips BIGINT DEFAULT 10000,
            cash_chips NUMERIC(12,2) DEFAULT 100.00,
            gems INT DEFAULT 50,
            last_daily_bonus TIMESTAMP DEFAULT NULL
          )
        `);
        await client.query(`
          CREATE TABLE IF NOT EXISTS wallet_transactions (
            id SERIAL PRIMARY KEY,
            user_id INT REFERENCES game_users(id) ON DELETE CASCADE,
            currency_type VARCHAR(20) NOT NULL,
            amount NUMERIC(12,2) NOT NULL,
            type VARCHAR(50) NOT NULL,
            room_id VARCHAR(100),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
        await client.query('COMMIT');
        console.log('Database tables verified/created successfully.');
        return;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      console.warn(`Database init attempt ${attempt}/${retries} failed:`, (err as Error).message);
      if (attempt === retries) throw err;
      await new Promise(res => setTimeout(res, 2000));
    }
  }
}
