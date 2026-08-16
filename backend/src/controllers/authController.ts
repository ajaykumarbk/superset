// backend/src/controllers/authController.ts
import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { UserModel } from '../models/User';

type Session = Record<string, unknown>;

export const authController = {
  async register(req: Request, res: Response): Promise<void> {
    const { username, password } = req.body as { username?: string; password?: string };
    if (!username?.trim() || !password?.trim()) {
      res.status(400).json({ error: 'Username and password are required' });
      return;
    }
    try {
      if (await UserModel.existsByUsername(username)) {
        res.status(400).json({ error: 'Username is already taken' });
        return;
      }
      const hash = await bcrypt.hash(password, 10);
      const newUser = await UserModel.create(username, hash);
      await UserModel.initStats(newUser.id);
      (req.session as Session).userId   = newUser.id;
      (req.session as Session).username = newUser.username;
      res.json({ id: newUser.id, username: newUser.username });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error registering user' });
    }
  },

  async login(req: Request, res: Response): Promise<void> {
    const { username, password } = req.body as { username?: string; password?: string };
    if (!username || !password) {
      res.status(400).json({ error: 'Username and password are required' });
      return;
    }
    try {
      const user = await UserModel.findByUsername(username);
      if (!user || !(await bcrypt.compare(password, user.password_hash))) {
        res.status(400).json({ error: 'Invalid username or password' });
        return;
      }
      (req.session as Session).userId   = user.id;
      (req.session as Session).username = user.username;
      res.json({ id: user.id, username: user.username });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error logging in' });
    }
  },

  me(req: Request, res: Response): void {
    const s = req.session as Session;
    if (s?.userId) {
      res.json({ id: s.userId, username: s.username });
    } else {
      res.status(401).json({ error: 'Not authenticated' });
    }
  },

  logout(req: Request, res: Response): void {
    req.session = null;
    res.json({ success: true });
  },
};
