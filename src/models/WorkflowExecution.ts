import { pool } from '../config/db.js';

export type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface WorkflowExecution {
  id: number;
  workflow_id: number;
  user_id: number;
  n8n_execution_id: string | null;
  status: ExecutionStatus;
  input_data: object | null;
  output_data: object | null;
  error_message: string | null;
  error_analysis: string | null;
  started_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
}

export interface CreateWorkflowExecutionInput {
  workflow_id: number;
  user_id: number;
  input_data?: object;
  status?: ExecutionStatus;
}

export interface UpdateWorkflowExecutionInput {
  status?: ExecutionStatus;
  input_data?: object;
  output_data?: object;
  error_message?: string | null;
  started_at?: Date | null;
  completed_at?: Date | null;
}

export async function createWorkflowExecution(input: CreateWorkflowExecutionInput): Promise<WorkflowExecution> {
  const [result] = await pool.execute(
    'INSERT INTO workflow_executions (workflow_id, user_id, input_data, status) VALUES (?, ?, ?, ?)',
    [input.workflow_id, input.user_id, input.input_data ? JSON.stringify(input.input_data) : null, input.status || 'pending']
  );
  const insertId = (result as any).insertId;
  const execution = await getWorkflowExecutionById(insertId);
  if (!execution) throw new Error('Failed to retrieve created workflow execution');
  return execution;
}

export async function getWorkflowExecutionById(id: number): Promise<WorkflowExecution | null> {
  const [rows] = await pool.execute('SELECT * FROM workflow_executions WHERE id = ?', [id]);
  return (rows as WorkflowExecution[])[0] || null;
}

export async function getWorkflowExecutionsByWorkflowId(workflowId: number): Promise<WorkflowExecution[]> {
  const [rows] = await pool.execute('SELECT * FROM workflow_executions WHERE workflow_id = ? ORDER BY created_at DESC', [workflowId]);
  return rows as WorkflowExecution[];
}

export async function getWorkflowExecutionsByWorkflowIdPaginated(
  workflowId: number,
  options: { page: number; limit: number }
): Promise<{ rows: WorkflowExecution[]; total: number }> {
  const [countRows] = await pool.execute(
    'SELECT COUNT(*) AS total FROM workflow_executions WHERE workflow_id = ?',
    [workflowId]
  );
  const total = Number((countRows as any[])[0]?.total ?? 0);
  const offset = (options.page - 1) * options.limit;

  const [rows] = await pool.execute(
    'SELECT * FROM workflow_executions WHERE workflow_id = ? ORDER BY id DESC LIMIT ? OFFSET ?',
    [workflowId, options.limit, offset]
  );

  return { rows: rows as WorkflowExecution[], total };
}

export interface ExecutionStats {
  total: number;
  completed: number;
  failed: number;
  lastExecutionAt: Date | null;
}

export async function getExecutionStatsByWorkflowId(workflowId: number): Promise<ExecutionStats> {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(status = 'completed'), 0) AS completed,
            COALESCE(SUM(status = 'failed'), 0) AS failed,
            MAX(created_at) AS last_execution_at
     FROM workflow_executions WHERE workflow_id = ?`,
    [workflowId]
  );
  const row = (rows as any[])[0] ?? {};
  return {
    total: Number(row.total ?? 0),
    completed: Number(row.completed ?? 0),
    failed: Number(row.failed ?? 0),
    lastExecutionAt: row.last_execution_at ?? null,
  };
}

export async function getWorkflowExecutionsByUserId(userId: number): Promise<WorkflowExecution[]> {
  const [rows] = await pool.execute('SELECT * FROM workflow_executions WHERE user_id = ? ORDER BY created_at DESC', [userId]);
  return rows as WorkflowExecution[];
}

export async function updateWorkflowExecution(id: number, input: UpdateWorkflowExecutionInput): Promise<WorkflowExecution | null> {
  const fields: string[] = [];
  const values: any[] = [];

  if (input.status !== undefined) {
    fields.push('status = ?');
    values.push(input.status);
  }
  if (input.input_data !== undefined) {
    fields.push('input_data = ?');
    values.push(input.input_data ? JSON.stringify(input.input_data) : null);
  }
  if (input.output_data !== undefined) {
    fields.push('output_data = ?');
    values.push(input.output_data ? JSON.stringify(input.output_data) : null);
  }
  if (input.error_message !== undefined) {
    fields.push('error_message = ?');
    values.push(input.error_message);
  }
  if (input.started_at !== undefined) {
    fields.push('started_at = ?');
    values.push(input.started_at);
  }
  if (input.completed_at !== undefined) {
    fields.push('completed_at = ?');
    values.push(input.completed_at);
  }

  if (fields.length === 0) return getWorkflowExecutionById(id);

  values.push(id);
  await pool.execute(`UPDATE workflow_executions SET ${fields.join(', ')} WHERE id = ?`, values);
  return getWorkflowExecutionById(id);
}

export async function deleteWorkflowExecution(id: number): Promise<boolean> {
  const [result] = await pool.execute('DELETE FROM workflow_executions WHERE id = ?', [id]);
  return (result as any).affectedRows > 0;
}