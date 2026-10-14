import { pool } from '../config/db.js';

export type MessageRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id: number;
  session_id: number;
  role: MessageRole;
  content: string;
  metadata: object | null;
  created_at: Date;
}

export interface CreateChatMessageInput {
  session_id: number;
  role: MessageRole;
  content: string;
  metadata?: object;
}

export async function createChatMessage(input: CreateChatMessageInput): Promise<ChatMessage> {
  const [result] = await pool.execute(
    'INSERT INTO chat_messages (session_id, role, content, metadata) VALUES (?, ?, ?, ?)',
    [input.session_id, input.role, input.content, input.metadata ? JSON.stringify(input.metadata) : null]
  );
  const insertId = (result as any).insertId;
  const message = await getChatMessageById(insertId);
  if (!message) throw new Error('Failed to retrieve created chat message');
  return message;
}

export async function getChatMessageById(id: number): Promise<ChatMessage | null> {
  const [rows] = await pool.execute('SELECT * FROM chat_messages WHERE id = ?', [id]);
  return (rows as ChatMessage[])[0] || null;
}

export async function getChatMessagesBySessionId(sessionId: number): Promise<ChatMessage[]> {
  const [rows] = await pool.execute('SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC', [sessionId]);
  return rows as ChatMessage[];
}

export async function deleteChatMessagesBySessionId(sessionId: number): Promise<boolean> {
  const [result] = await pool.execute('DELETE FROM chat_messages WHERE session_id = ?', [sessionId]);
  return (result as any).affectedRows > 0;
}