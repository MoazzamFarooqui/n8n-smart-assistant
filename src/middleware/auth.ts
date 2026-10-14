import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { getUserById } from '../models/User.js';

export interface AuthRequest extends Request {
  user?: { id: number; email: string };
}

export async function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, config.jwt.secret) as { id: number; email: string };
    const user = await getUserById(decoded.id);
    if (!user) return res.status(401).json({ error: 'User not found' });
    req.user = { id: user.id, email: user.email };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

export function generateToken(user: { id: number; email: string }): string {
  return jwt.sign({ id: user.id, email: user.email }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn as jwt.SignOptions['expiresIn'],
  });
}