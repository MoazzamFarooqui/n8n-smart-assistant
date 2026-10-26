import { pool } from '../config/db.js';

export interface Workflow {
  id: number;
  user_id: number;
  name: string;
  description: string | null;
  prompt: string | null;
  definition: object;
  is_active: boolean;
  n8n_workflow_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface WorkflowListRow extends Workflow {
  execution_count: number;
  last_execution_status: string | null;
  last_executed_at: Date | null;
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

export interface ListWorkflowsOptions {
  page: number;
  limit: number;
  isActive?: boolean;
  search?: string;
}

export async function getWorkflowsByUserIdPaginated(
  userId: number,
  options: ListWorkflowsOptions
): Promise<{ rows: WorkflowListRow[]; total: number }> {
  const where: string[] = ['w.user_id = ?'];
  const params: any[] = [userId];

  if (options.isActive !== undefined) {
    where.push('w.is_active = ?');
    params.push(options.isActive ? 1 : 0);
  }
  if (options.search) {
    where.push('w.name LIKE ?');
    params.push(`%${options.search}%`);
  }

  const whereClause = where.join(' AND ');
  const offset = (options.page - 1) * options.limit;

  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total FROM workflows w WHERE ${whereClause}`,
    params
  );
  const total = Number((countRows as any[])[0]?.total ?? 0);

  const [rows] = await pool.execute(
    `SELECT w.*,
            (SELECT COUNT(*) FROM workflow_executions e WHERE e.workflow_id = w.id) AS execution_count,
            (SELECT e.status FROM workflow_executions e WHERE e.workflow_id = w.id ORDER BY e.id DESC LIMIT 1) AS last_execution_status,
            (SELECT e.created_at FROM workflow_executions e WHERE e.workflow_id = w.id ORDER BY e.id DESC LIMIT 1) AS last_executed_at
     FROM workflows w
     WHERE ${whereClause}
     ORDER BY w.updated_at DESC, w.id DESC
     LIMIT ? OFFSET ?`,
    [...params, options.limit, offset]
  );

  return { rows: rows as WorkflowListRow[], total };
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