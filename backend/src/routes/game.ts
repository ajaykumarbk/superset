// backend/src/routes/game.ts
import { Router } from 'express';
import { gameController } from '../controllers/gameController';

const router = Router();

router.get('/leaderboard', gameController.leaderboard);

export default router;
