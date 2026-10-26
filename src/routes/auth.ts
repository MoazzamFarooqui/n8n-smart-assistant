import { Router, Request, Response } from 'express';
import { createUser, getUserByEmail, verifyPassword } from '../models/User.js';
import { generateToken, AuthRequest, authenticate } from '../middleware/auth.js';
import { z } from 'zod';

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

router.post('/register', async (req: Request, res: Response) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() });

  const { email, password, name } = parsed.data;
  const existing = await getUserByEmail(email);
  if (existing) return res.status(409).json({ error: 'Email already registered' });

  const user = await createUser(email, password, name);
  const token = generateToken({ id: user.id, email: user.email });
  res.status(201).json({ user: { id: user.id, email: user.email, name: user.name }, token });
});

router.post('/login', async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() });

  const { email, password } = parsed.data;
  const user = await getUserByEmail(email);
  if (!user || !(await verifyPassword(user, password))) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = generateToken({ id: user.id, email: user.email });
  res.json({ user: { id: user.id, email: user.email, name: user.name }, token });
});

router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  res.json({ user: { id: req.user!.id, email: req.user!.email } });
});

export default router;

