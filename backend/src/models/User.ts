// backend/src/models/User.ts
import { pool } from '../config/database';

export interface UserRow {
  id: number;
  username: string;
  password_hash: string;
}

export const UserModel = {
  async findByUsername(username: string): Promise<UserRow | null> {
    const result = await pool.query<UserRow>(
      'SELECT id, username, password_hash FROM game_users WHERE username = $1',
      [username.trim()]
    );
    return result.rows[0] ?? null;
  },

  async existsByUsername(username: string): Promise<boolean> {
    const result = await pool.query(
      'SELECT id FROM game_users WHERE username = $1',
      [username.toLowerCase().trim()]
    );
    return result.rows.length > 0;
  },

  async create(username: string, passwordHash: string): Promise<{ id: number; username: string }> {
    const result = await pool.query<{ id: number; username: string }>(
      'INSERT INTO game_users (username, password_hash) VALUES ($1, $2) RETURNING id, username',
      [username.trim(), passwordHash]
    );
    return result.rows[0];
  },

  async initStats(userId: number): Promise<void> {
    await pool.query('INSERT INTO game_user_stats (user_id) VALUES ($1)', [userId]);
  },

  async getLeaderboard(): Promise<{ username: string; games_played: number; wins: number }[]> {
    const result = await pool.query(`
      SELECT u.username, s.games_played, s.wins
      FROM game_user_stats s
      JOIN game_users u ON s.user_id = u.id
      ORDER BY s.wins DESC, s.games_played ASC
      LIMIT 10
    `);
    return result.rows;
  },
};
