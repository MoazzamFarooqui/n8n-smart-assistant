import { pool } from '../config/db.js';

export interface Workflow {
  id: number;
  user_id: number;
  name: string;
  description: string | null;
  definition: object;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CreateWorkflowInput {
  user_id: number;
  name: string;
  description?: string;
  definition: object;
  is_active?: boolean;
}

export interface UpdateWorkflowInput {
  name?: string;
  description?: string;
  definition?: object;
  is_active?: boolean;
}

export async function createWorkflow(input: CreateWorkflowInput): Promise<Workflow> {
  const [result] = await pool.execute(
    'INSERT INTO workflows (user_id, name, description, definition, is_active) VALUES (?, ?, ?, ?, ?)',
    [input.user_id, input.name, input.description || null, JSON.stringify(input.definition), input.is_active ?? true]
  );
  const insertId = (result as any).insertId;
  const workflow = await getWorkflowById(insertId);
  if (!workflow) throw new Error('Failed to retrieve created workflow');
  return workflow;
}

export async function getWorkflowById(id: number): Promise<Workflow | null> {
  const [rows] = await pool.execute('SELECT * FROM workflows WHERE id = ?', [id]);
  return (rows as Workflow[])[0] || null;
}

export async function getWorkflowsByUserId(userId: number): Promise<Workflow[]> {
  const [rows] = await pool.execute('SELECT * FROM workflows WHERE user_id = ? ORDER BY updated_at DESC', [userId]);
  return rows as Workflow[];
}

export async function updateWorkflow(id: number, input: UpdateWorkflowInput): Promise<Workflow | null> {
  const fields: string[] = [];
  const values: any[] = [];

  if (input.name !== undefined) {
    fields.push('name = ?');
    values.push(input.name);
  }
  if (input.description !== undefined) {
    fields.push('description = ?');
    values.push(input.description);
  }
  if (input.definition !== undefined) {
    fields.push('definition = ?');
    values.push(JSON.stringify(input.definition));
  }
  if (input.is_active !== undefined) {
    fields.push('is_active = ?');
    values.push(input.is_active);
  }

  if (fields.length === 0) return getWorkflowById(id);

  values.push(id);
  await pool.execute(`UPDATE workflows SET ${fields.join(', ')} WHERE id = ?`, values);
  return getWorkflowById(id);
}

export async function deleteWorkflow(id: number): Promise<boolean> {
  const [result] = await pool.execute('DELETE FROM workflows WHERE id = ?', [id]);
  return (result as any).affectedRows > 0;
}