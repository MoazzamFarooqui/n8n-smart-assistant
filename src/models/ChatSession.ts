import { pool } from '../config/db.js';

export interface ChatSession {
  id: number;
  user_id: number;
  title: string | null;
  workflow_id: number | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateChatSessionInput {
  user_id: number;
  title?: string;
  workflow_id?: number;
}

export interface UpdateChatSessionInput {
  title?: string;
  workflow_id?: number | null;
}

export async function createChatSession(input: CreateChatSessionInput): Promise<ChatSession> {
  const [result] = await pool.execute(
    'INSERT INTO chat_sessions (user_id, title, workflow_id) VALUES (?, ?, ?)',
    [input.user_id, input.title || null, input.workflow_id || null]
  );
  const insertId = (result as any).insertId;
  const session = await getChatSessionById(insertId);
  if (!session) throw new Error('Failed to retrieve created chat session');
  return session;
}

export async function getChatSessionById(id: number): Promise<ChatSession | null> {
  const [rows] = await pool.execute('SELECT * FROM chat_sessions WHERE id = ?', [id]);
  return (rows as ChatSession[])[0] || null;
}

export async function getChatSessionsByUserId(userId: number): Promise<ChatSession[]> {
  const [rows] = await pool.execute('SELECT * FROM chat_sessions WHERE user_id = ? ORDER BY updated_at DESC', [userId]);
  return rows as ChatSession[];
}

export async function updateChatSession(id: number, input: UpdateChatSessionInput): Promise<ChatSession | null> {
  const fields: string[] = [];
  const values: any[] = [];

  if (input.title !== undefined) {
    fields.push('title = ?');
    values.push(input.title);
  }
  if (input.workflow_id !== undefined) {
    fields.push('workflow_id = ?');
    values.push(input.workflow_id);
  }

  if (fields.length === 0) return getChatSessionById(id);

  values.push(id);
  await pool.execute(`UPDATE chat_sessions SET ${fields.join(', ')} WHERE id = ?`, values);
  return getChatSessionById(id);
}

export async function deleteChatSession(id: number): Promise<boolean> {
  const [result] = await pool.execute('DELETE FROM chat_sessions WHERE id = ?', [id]);
  return (result as any).affectedRows > 0;
}

export async function touchChatSession(id: number, title?: string): Promise<void> {
  if (title) {
    await pool.execute('UPDATE chat_sessions SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [title, id]);
    return;
  }
  await pool.execute('UPDATE chat_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
}