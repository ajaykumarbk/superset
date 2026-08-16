// backend/src/controllers/gameController.ts
import type { Request, Response } from 'express';
import { UserModel } from '../models/User';

export const gameController = {
  async leaderboard(_req: Request, res: Response): Promise<void> {
    try {
      const rows = await UserModel.getLeaderboard();
      res.json(rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error fetching leaderboard' });
    }
  },
};
