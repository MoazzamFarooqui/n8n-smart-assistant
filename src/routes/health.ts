import { Router, Request, Response } from 'express';
import { pool } from '../config/db.js';

const router = Router();

router.get('/health', async (_req: Request, res: Response) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'ok', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'error', db: 'down', timestamp: new Date().toISOString() });
  }
});

export default router;
