// backend/src/models/Wallet.ts
import { pool } from '../config/database';

export interface WalletData {
  userId: number;
  practiceChips: number;
  cashChips: number;
  gems: number;
  lastDailyBonus: Date | null;
  canClaimDailyBonus: boolean;
}

export const WalletModel = {
  async getWallet(userId: number): Promise<WalletData> {
    let res = await pool.query(
      'SELECT user_id, practice_chips, cash_chips, gems, last_daily_bonus FROM game_wallets WHERE user_id = $1',
      [userId]
    );

    if (res.rows.length === 0) {
      await pool.query('INSERT INTO game_wallets (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [userId]);
      res = await pool.query(
        'SELECT user_id, practice_chips, cash_chips, gems, last_daily_bonus FROM game_wallets WHERE user_id = $1',
        [userId]
      );
    }

    const row = res.rows[0];
    const lastBonus = row.last_daily_bonus ? new Date(row.last_daily_bonus) : null;
    const canClaim = !lastBonus || (Date.now() - lastBonus.getTime() >= 24 * 60 * 60 * 1000);

    return {
      userId: Number(row.user_id),
      practiceChips: Number(row.practice_chips),
      cashChips: Number(row.cash_chips),
      gems: Number(row.gems),
      lastDailyBonus: lastBonus,
      canClaimDailyBonus: canClaim,
    };
  },

  async claimDailyBonus(userId: number): Promise<{ success: boolean; message: string; wallet?: WalletData }> {
    const wallet = await this.getWallet(userId);
    if (!wallet.canClaimDailyBonus) {
      return { success: false, message: 'Daily bonus already claimed within the last 24 hours.' };
    }

    const bonusChips = 2000;
    const bonusGems = 10;

    await pool.query(
      `UPDATE game_wallets 
       SET practice_chips = practice_chips + $1, gems = gems + $2, last_daily_bonus = CURRENT_TIMESTAMP 
       WHERE user_id = $3`,
      [bonusChips, bonusGems, userId]
    );

    await pool.query(
      `INSERT INTO wallet_transactions (user_id, currency_type, amount, type) 
       VALUES ($1, 'practice', $2, 'daily_bonus')`,
      [userId, bonusChips]
    );

    const updated = await this.getWallet(userId);
    return { success: true, message: `Claimed +${bonusChips} Practice Chips and +${bonusGems} Gems!`, wallet: updated };
  },

  async hasSufficientBalance(userId: number, currencyType: 'practice' | 'cash', requiredAmount: number): Promise<boolean> {
    const wallet = await this.getWallet(userId);
    if (currencyType === 'cash') {
      return wallet.cashChips >= requiredAmount;
    }
    return wallet.practiceChips >= requiredAmount;
  },

  async deductEscrow(userId: number, currencyType: 'practice' | 'cash', amount: number, roomId: string): Promise<boolean> {
    if (amount <= 0) return true;
    const col = currencyType === 'cash' ? 'cash_chips' : 'practice_chips';
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const res = await client.query(`SELECT ${col} FROM game_wallets WHERE user_id = $1 FOR UPDATE`, [userId]);
      const current = Number(res.rows[0]?.[col] || 0);
      if (current < amount) {
        await client.query('ROLLBACK');
        return false;
      }
      await client.query(`UPDATE game_wallets SET ${col} = ${col} - $1 WHERE user_id = $2`, [amount, userId]);
      await client.query(
        `INSERT INTO wallet_transactions (user_id, currency_type, amount, type, room_id) VALUES ($1, $2, $3, 'entry_escrow', $4)`,
        [userId, currencyType, -amount, roomId]
      );
      await client.query('COMMIT');
      return true;
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Error deducting escrow:', err);
      return false;
    } finally {
      client.release();
    }
  },

  async settleA23Game(params: {
    roomId: string;
    winnerId: number | null;
    losers: Array<{ userId: number; penaltyPoints: number }>;
    currencyType: 'practice' | 'cash';
    stakePerPoint: number;
    rakePercent: number;
  }): Promise<{ winnerPayout: number; totalRake: number }> {
    const { roomId, winnerId, losers, currencyType, stakePerPoint, rakePercent } = params;
    const col = currencyType === 'cash' ? 'cash_chips' : 'practice_chips';
    let totalPot = 0;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const loser of losers) {
        const lossAmount = Math.min(80, Math.max(0, loser.penaltyPoints)) * stakePerPoint;
        if (lossAmount > 0 && loser.userId > 0) {
          await client.query(`UPDATE game_wallets SET ${col} = GREATEST(0, ${col} - $1) WHERE user_id = $2`, [lossAmount, loser.userId]);
          await client.query(
            `INSERT INTO wallet_transactions (user_id, currency_type, amount, type, room_id) VALUES ($1, $2, $3, 'game_loss', $4)`,
            [loser.userId, currencyType, -lossAmount, roomId]
          );
          totalPot += lossAmount;
        }
      }

      const totalRake = (totalPot * rakePercent) / 100;
      const winnerPayout = totalPot - totalRake;

      if (winnerId && winnerId > 0 && winnerPayout > 0) {
        await client.query(`UPDATE game_wallets SET ${col} = ${col} + $1 WHERE user_id = $2`, [winnerPayout, winnerId]);
        await client.query(
          `INSERT INTO wallet_transactions (user_id, currency_type, amount, type, room_id) VALUES ($1, $2, $3, 'game_winnings', $4)`,
          [winnerId, currencyType, winnerPayout, roomId]
        );
      }

      await client.query('COMMIT');
      return { winnerPayout, totalRake };
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Error settling A23 game:', err);
      return { winnerPayout: 0, totalRake: 0 };
    } finally {
      client.release();
    }
  },
};
