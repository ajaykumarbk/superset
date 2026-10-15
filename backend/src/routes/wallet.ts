// backend/src/routes/wallet.ts
import { Router, Request, Response } from 'express';
import { WalletModel } from '../models/Wallet';

const router = Router();

router.get('/wallet/balance', async (req: Request, res: Response): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    const wallet = await WalletModel.getWallet(Number(userId));
    res.json(wallet);
  } catch (err) {
    console.error('Failed to fetch wallet:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/wallet/daily-bonus', async (req: Request, res: Response): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    const result = await WalletModel.claimDailyBonus(Number(userId));
    if (!result.success) {
      res.status(400).json(result);
      return;
    }
    res.json(result);
  } catch (err) {
    console.error('Failed to claim daily bonus:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
