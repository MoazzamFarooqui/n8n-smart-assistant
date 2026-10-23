import { pool } from '../config/db.js';

export interface UserCredential {
  id: number;
  user_id: number;
  app: string;
  credential_type: string;
  credential_name: string;
  n8n_credential_id: string;
  managed: boolean | number;
  created_at: Date;
  updated_at: Date;
}

export interface UpsertUserCredentialInput {
  user_id: number;
  app: string;
  credential_type: string;
  credential_name: string;
  n8n_credential_id: string;
  managed: boolean;
}

export async function listUserCredentials(userId: number): Promise<UserCredential[]> {
  const [rows] = await pool.execute(
    'SELECT * FROM user_credentials WHERE user_id = ? ORDER BY app ASC',
    [userId]
  );
  return rows as UserCredential[];
}

export async function getUserCredential(userId: number, app: string): Promise<UserCredential | null> {
  const [rows] = await pool.execute(
    'SELECT * FROM user_credentials WHERE user_id = ? AND app = ?',
    [userId, app]
  );
  return (rows as UserCredential[])[0] || null;
}

export async function upsertUserCredential(input: UpsertUserCredentialInput): Promise<UserCredential> {
  await pool.execute(
    `INSERT INTO user_credentials
       (user_id, app, credential_type, credential_name, n8n_credential_id, managed)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       credential_type = VALUES(credential_type),
       credential_name = VALUES(credential_name),
       n8n_credential_id = VALUES(n8n_credential_id),
       managed = VALUES(managed)`,
    [
      input.user_id,
      input.app,
      input.credential_type,
      input.credential_name,
      input.n8n_credential_id,
      input.managed ? 1 : 0,
    ]
  );
  const credential = await getUserCredential(input.user_id, input.app);
  if (!credential) throw new Error('Failed to retrieve saved credential');
  return credential;
}

export async function deleteUserCredential(userId: number, app: string): Promise<UserCredential | null> {
  const existing = await getUserCredential(userId, app);
  if (!existing) return null;
  await pool.execute('DELETE FROM user_credentials WHERE user_id = ? AND app = ?', [userId, app]);
  return existing;
}
