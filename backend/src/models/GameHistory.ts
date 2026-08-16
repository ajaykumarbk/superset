// backend/src/models/GameHistory.ts
import { pool } from '../config/database';
import type { Room } from '../utils/gameManager';

export const GameHistoryModel = {
  async persistResult(room: Room): Promise<number | null> {
    const winner = room.players.find(p => p.id === room.winnerId);
    const winnerDbId = winner && !winner.isAI ? parseInt(winner.id, 10) : null;

    const res = await pool.query<{ id: number }>(
      'INSERT INTO game_history (winner_id) VALUES ($1) RETURNING id',
      [winnerDbId]
    );

    for (const player of room.players) {
      if (!player.isAI) {
        const userId = parseInt(player.id, 10);
        const isWinner = player.id === room.winnerId;
        await pool.query(
          `INSERT INTO game_user_stats (user_id, games_played, wins)
           VALUES ($1, 1, $2)
           ON CONFLICT (user_id) DO UPDATE SET
             games_played = game_user_stats.games_played + 1,
             wins         = game_user_stats.wins + $2`,
          [userId, isWinner ? 1 : 0]
        );
      }
    }

    console.log(`Room ${room.id} result persisted. Winner DB ID: ${winnerDbId}`);
    return res.rows[0]?.id ?? null;
  },
};
