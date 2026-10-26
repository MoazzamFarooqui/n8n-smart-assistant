import { pool } from '../config/db.js';
import bcrypt from 'bcryptjs';

export interface User {
  id: number;
  email: string;
  password_hash: string;
  name?: string;
  created_at: Date;
}

export async function createUser(email: string, password: string, name?: string): Promise<User> {
  const password_hash = await bcrypt.hash(password, 12);
  const [result] = await pool.execute(
    'INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)',
    [email, password_hash, name || null]
  );
  const insertId = (result as any).insertId;
  const user = await getUserById(insertId);
  if (!user) {
    throw new Error('Failed to retrieve created user');
  }
  return user;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const [rows] = await pool.execute('SELECT * FROM users WHERE email = ?', [email]);
  return (rows as User[])[0] || null;
}

export async function getUserById(id: number): Promise<User | null> {
  const [rows] = await pool.execute('SELECT * FROM users WHERE id = ?', [id]);
  return (rows as User[])[0] || null;
}

export async function verifyPassword(user: User, password: string): Promise<boolean> {
  return bcrypt.compare(password, user.password_hash);
}