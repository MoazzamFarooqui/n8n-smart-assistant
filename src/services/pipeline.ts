import { randomUUID } from 'crypto';
import type { ResultSetHeader } from 'mysql2';
import { callGemini, SYSTEM_PROMPTS } from './gemini.js';
import * as n8n from './n8n.js';
import { N8nError, type N8nExecution, type N8nNode, type N8nWorkflow } from './n8n.js';
import { pool } from '../config/db.js';
import { config } from '../config/env.js';

export interface StageReport {
  stage: 'generate' | 'validate' | 'audit' | 'deploy' | 'execute';
  ok: boolean;
  ms: number;
  error?: string;
  detail?: unknown;
}

export interface PipelineResult {
  workflowId: number;
  n8nWorkflowId: string;
  n8nWorkflowUrl: string;
  name: string;
  status: 'success' | 'failed';
  prompt: string;
  stages: StageReport[];
  validation: unknown;
  audit: unknown;
  execution?: {
    n8nExecutionId?: string;
    status: string;
    data?: unknown;
    error?: string;
  };
  errorAnalysis?: string;
  totalMs: number;
}

export class PipelineError extends Error {
  stage: string;
  status: number;
  stages: StageReport[];

  constructor(stage: string, message: string, status: number, stages: StageReport[]) {
    super(message);
    this.name = 'PipelineError';
    this.stage = stage;
    this.status = status;
    this.stages = stages;
  }
}

interface CleanWorkflow {
  name: string;
  nodes: N8nNode[];
  connections: Record<string, any>;
}

const WEBHOOK_TYPE = 'n8n-nodes-base.webhook';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function msg(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function extractJson(text: string): any {
  let cleaned = text.trim();
  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) cleaned = fence[1].trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('no JSON object found in the AI response');
  }
  return JSON.parse(cleaned.slice(start, end + 1));
}

function safeExtractJson(text: string): { parsed?: unknown; raw?: string } {
  try {
    return { parsed: extractJson(text) };
  } catch {
    return { raw: text.trim().slice(0, 4000) };
  }
}

const SET_NODE_TYPE = 'n8n-nodes-base.set';
const SET_NODE_VERSION = 3.5;

interface SetAssignment {
  id: string;
  name: string;
  value: unknown;
  type: string;
}

function toAssignment(rawType: unknown, rawValue: unknown): { type: string; value: unknown } {
  const t = typeof rawType === 'string' ? rawType : 'string';
  switch (t) {
    case 'number':
    case 'numberValue':
      return { type: 'number', value: Number(rawValue) };
    case 'boolean':
    case 'booleanValue':
      return { type: 'boolean', value: rawValue === true || rawValue === 'true' };
    case 'array':
    case 'arrayValue':
      return { type: 'array', value: rawValue };
    case 'object':
    case 'objectValue':
      return { type: 'object', value: rawValue };
    default:
      return { type: 'string', value: String(rawValue ?? '') };
  }
}

function normalizeSetNode(parameters: any): { parameters: any; version?: number } | undefined {
  const p = parameters ?? {};
  const items: SetAssignment[] = [];

  const push = (name: unknown, type: string, value: unknown) => {
    if (name === undefined || name === null || String(name).trim() === '') return;
    items.push({ id: randomUUID(), name: String(name), ...toAssignment(type, value) });
  };

  if (Array.isArray(p.assignments?.assignments)) {
    for (const a of p.assignments.assignments) {
      push(a?.name, String(a?.type ?? 'string'), a?.value);
    }
  } else if (Array.isArray(p.fields?.values)) {
    for (const f of p.fields.values) {
      push(f?.name, String(f?.type ?? 'stringValue'), f?.[String(f?.type ?? 'stringValue')]);
    }
  } else if (p.values && typeof p.values === 'object') {
    for (const t of ['string', 'number', 'boolean'] as const) {
      for (const it of Array.isArray(p.values[t]) ? p.values[t] : []) {
        push(it?.name, t, it?.value);
      }
    }
  } else {
    return undefined;
  }

  if (items.length === 0) return undefined;

  const includeOther =
    p.include === 'all' || p.include === 'selected' || p.includeOtherFields === true;

  return {
    version: SET_NODE_VERSION,
    parameters: {
      mode: 'manual',
      ...(includeOther ? { includeOtherFields: true } : {}),
      assignments: { assignments: items },
      options: p.options ?? {},
    },
  };
}

function sanitizeWorkflow(raw: any, prompt: string): CleanWorkflow {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('AI response was not a JSON workflow object');
  }
  const rawNodes = Array.isArray(raw.nodes) ? raw.nodes : [];
  if (rawNodes.length === 0) {
    throw new Error('generated workflow has no nodes');
  }

  const usedNames = new Set<string>();
  const nodes: N8nNode[] = rawNodes.map((node: any, i: number) => {
    let name = typeof node?.name === 'string' && node.name.trim() ? node.name.trim() : `Node ${i + 1}`;
    while (usedNames.has(name)) name = `${name} (${i + 1})`;
    usedNames.add(name);
    const built: N8nNode = {
      ...node,
      name,
      type: typeof node?.type === 'string' && node.type.includes('.') ? node.type : 'n8n-nodes-base.noOp',
      typeVersion: typeof node?.typeVersion === 'number' ? node.typeVersion : 1,
      position: Array.isArray(node?.position) && node.position.length === 2 ? node.position : [i * 220, 0],
      parameters: node?.parameters && typeof node.parameters === 'object' ? node.parameters : {},
    };
    if (built.type === SET_NODE_TYPE) {
      const normalized = normalizeSetNode(built.parameters);
      if (normalized) {
        built.parameters = normalized.parameters;
        built.typeVersion = normalized.version ?? built.typeVersion;
      }
    }
    return built;
  });

  const name =
    typeof raw.name === 'string' && raw.name.trim()
      ? raw.name.trim().slice(0, 128)
      : `AI: ${prompt.slice(0, 60).trim()}`;

  const connections: Record<string, any> = {};
  const rawConnections = raw.connections && typeof raw.connections === 'object' ? raw.connections : {};
  for (const [source, data] of Object.entries(rawConnections)) {
    if (!usedNames.has(source)) continue;
    const main = (data as any)?.main;
    if (!Array.isArray(main)) continue;
    connections[source] = {
      ...(data as any),
      main: main.map((branch: any) =>
        Array.isArray(branch) ? branch.filter((c: any) => c?.node && usedNames.has(c.node)) : []
      ),
    };
  }

  const work: CleanWorkflow = { name, nodes, connections };

  const webhookPath = `aies-${randomUUID().slice(0, 8)}`;
  const hasRespondNode = nodes.some((n) => n.type === 'n8n-nodes-base.respondToWebhook');
  const responseMode = hasRespondNode ? 'responseNode' : 'lastNode';
  const existingWebhook = nodes.find((n) => n.type === WEBHOOK_TYPE);
  if (existingWebhook) {
    existingWebhook.parameters = {
      ...(existingWebhook.parameters ?? {}),
      path: webhookPath,
      httpMethod: (existingWebhook.parameters as any)?.httpMethod || 'POST',
      responseMode,
    };
  } else {
    const webhook: N8nNode = {
      name: 'Webhook Trigger',
      type: WEBHOOK_TYPE,
      typeVersion: 2,
      position: [-220, 0],
      parameters: { httpMethod: 'POST', path: webhookPath, responseMode, options: {} },
    };
    while (usedNames.has(webhook.name)) webhook.name = `${webhook.name} 2`;
    usedNames.add(webhook.name);
    nodes.unshift(webhook);

    const incoming = new Set<string>();
    for (const data of Object.values(connections)) {
      for (const branch of (data as any)?.main ?? []) {
        for (const c of branch ?? []) incoming.add(c.node);
      }
    }
    const target =
      nodes.find((n) => n.name !== webhook.name && !incoming.has(n.name)) ??
      nodes.find((n) => n.name !== webhook.name);
    if (target) {
      connections[webhook.name] = { main: [[{ node: target.name, type: 'main', index: 0 }]] };
    }
  }

  return work;
}

async function findLatestExecution(workflowId: string, tries: number): Promise<N8nExecution | undefined> {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await n8n.listExecutions({ workflowId, limit: 1 });
      if (res.data.length > 0) return res.data[0];
    } catch {
      // ignore and retry
    }
    await sleep(1000);
  }
  return undefined;
}

function buildErrorText(execution: N8nExecution | undefined, fallback: string, workflowName: string): string {
  if (execution) {
    const summary = n8n.summarizeExecution(execution);
    if (summary.error) {
      return [
        `Workflow: ${workflowName}`,
        summary.error.node ? `Failed node: ${summary.error.node}` : '',
        `Error message: ${summary.error.message}`,
        summary.error.description ? `Description: ${summary.error.description}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    }
  }
  return `Workflow: ${workflowName}\nError: ${fallback}`;
}

async function analyzeError(workflowName: string, prompt: string, errorText: string): Promise<string | undefined> {
  try {
    const res = await callGemini(
      SYSTEM_PROMPTS.translateError,
      `An automation was generated from this request: "${prompt}"\n\n${errorText}\n\nExplain what happened in simple English and how to fix it.`
    );
    return res.text.trim();
  } catch {
    return undefined;
  }
}

export async function runPipeline(userId: number, prompt: string): Promise<PipelineResult> {
  const stages: StageReport[] = [];
  const overallStart = Date.now();

  const generateStart = Date.now();
  let clean: CleanWorkflow;
  try {
    const genPrompt = `${prompt}\n\nIMPORTANT: the entry point must be a Webhook trigger node (type "n8n-nodes-base.webhook", typeVersion 2) so the workflow can be executed via its webhook URL. Keep the workflow small (2 to 5 nodes).`;
    const res = await callGemini(SYSTEM_PROMPTS.generateWorkflow, genPrompt);
    const parsed = extractJson(res.text);
    clean = sanitizeWorkflow(parsed, prompt);
    stages.push({
      stage: 'generate',
      ok: true,
      ms: Date.now() - generateStart,
      detail: { model: res.model, name: clean.name, nodes: clean.nodes.length },
    });
  } catch (err) {
    stages.push({ stage: 'generate', ok: false, ms: Date.now() - generateStart, error: msg(err) });
    throw new PipelineError('generate', `Workflow generation failed: ${msg(err)}`, 502, stages);
  }

  const validateStart = Date.now();
  let validation: unknown = null;
  try {
    const res = await callGemini(
      SYSTEM_PROMPTS.validateWorkflow,
      JSON.stringify({ name: clean.name, nodes: clean.nodes, connections: clean.connections })
    );
    const extracted = safeExtractJson(res.text);
    validation = extracted.parsed ?? null;
    const invalid = (extracted.parsed as any)?.valid === false;
    stages.push({
      stage: 'validate',
      ok: !invalid,
      ms: Date.now() - validateStart,
      detail: extracted,
      ...(invalid ? { error: 'AI validator reported issues (advisory — deployment continues)' } : {}),
    });
  } catch (err) {
    stages.push({
      stage: 'validate',
      ok: false,
      ms: Date.now() - validateStart,
      error: `Validator unavailable: ${msg(err)} (advisory — deployment continues)`,
    });
  }

  const auditStart = Date.now();
  let audit: unknown = null;
  try {
    const res = await callGemini(
      SYSTEM_PROMPTS.securityAudit,
      JSON.stringify({ name: clean.name, nodes: clean.nodes, connections: clean.connections })
    );
    const extracted = safeExtractJson(res.text);
    audit = extracted.parsed ?? null;
    stages.push({ stage: 'audit', ok: true, ms: Date.now() - auditStart, detail: extracted });
  } catch (err) {
    stages.push({
      stage: 'audit',
      ok: false,
      ms: Date.now() - auditStart,
      error: `Security audit unavailable: ${msg(err)} (advisory — deployment continues)`,
    });
  }

  const deployStart = Date.now();
  let created: N8nWorkflow | undefined;
  let workflowId: number | undefined;
  try {
    created = await n8n.createWorkflow({
      name: clean.name,
      nodes: clean.nodes,
      connections: clean.connections,
      settings: {},
      description: `AI generated from prompt: ${prompt.slice(0, 200)}`,
    });
    const [insert] = await pool.query<ResultSetHeader>(
      `INSERT INTO workflows (user_id, name, description, definition, is_active, n8n_workflow_id, prompt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        clean.name,
        `AI generated from prompt: ${prompt.slice(0, 200)}`,
        JSON.stringify({ nodes: clean.nodes, connections: clean.connections }),
        0,
        created.id,
        prompt,
      ]
    );
    workflowId = insert.insertId;
    stages.push({
      stage: 'deploy',
      ok: true,
      ms: Date.now() - deployStart,
      detail: { workflowId, n8nWorkflowId: created.id },
    });
  } catch (err) {
    if (created) {
      try {
        await n8n.deleteWorkflow(created.id);
      } catch {
        // best-effort cleanup of the orphaned n8n workflow
      }
    }
    stages.push({ stage: 'deploy', ok: false, ms: Date.now() - deployStart, error: msg(err) });
    const status = err instanceof N8nError ? err.status : 500;
    throw new PipelineError('deploy', `Deploy to n8n failed: ${msg(err)}`, status, stages);
  }

  const executeStart = Date.now();
  let execution: PipelineResult['execution'];
  let errorAnalysis: string | undefined;
  try {
    await n8n.activateWorkflow(created.id);
    const run = await n8n.executeViaWebhook(created, { payload: {} });
    await pool.query(`UPDATE workflows SET is_active = 1 WHERE id = ?`, [workflowId]);

    const latest = await findLatestExecution(created.id, 3);
    await pool.query(
      `INSERT INTO workflow_executions
         (workflow_id, user_id, n8n_execution_id, status, input_data, output_data, started_at, completed_at)
       VALUES (?, ?, ?, 'completed', ?, ?, NOW(), NOW())`,
      [
        workflowId,
        userId,
        latest?.id ?? null,
        JSON.stringify({}),
        JSON.stringify(run.data ?? null),
      ]
    );

    execution = { n8nExecutionId: latest?.id, status: 'success', data: run.data };
    stages.push({
      stage: 'execute',
      ok: true,
      ms: Date.now() - executeStart,
      detail: { n8nExecutionId: latest?.id, webhookUrl: run.webhookUrl },
    });
  } catch (err) {
    const n8nError = err instanceof N8nError ? err : undefined;
    let errorText = msg(err);
    const latest = await findLatestExecution(created.id, 5);
    if (latest?.id) {
      try {
        const full = await n8n.getExecution(latest.id, true);
        errorText = buildErrorText(full, errorText, clean.name);
      } catch {
        errorText = buildErrorText(latest, errorText, clean.name);
      }
    }

    errorAnalysis = await analyzeError(clean.name, prompt, errorText);

    await pool.query(
      `INSERT INTO workflow_executions
         (workflow_id, user_id, n8n_execution_id, status, input_data, output_data, error_message, error_analysis, started_at, completed_at)
       VALUES (?, ?, ?, 'failed', ?, NULL, ?, ?, NOW(), NOW())`,
      [
        workflowId,
        userId,
        latest?.id ?? null,
        JSON.stringify({}),
        errorText.slice(0, 60000),
        errorAnalysis ?? null,
      ]
    );

    execution = { n8nExecutionId: latest?.id, status: 'failed', error: errorText };
    stages.push({ stage: 'execute', ok: false, ms: Date.now() - executeStart, error: errorText });
    if (n8nError?.details) {
      stages[stages.length - 1].detail = { details: n8nError.details };
    }
  }

  return {
    workflowId: workflowId!,
    n8nWorkflowId: created.id,
    n8nWorkflowUrl: `${config.n8n.publicUrl}/workflow/${created.id}`,
    name: clean.name,
    status: execution?.status === 'success' ? 'success' : 'failed',
    prompt,
    stages,
    validation,
    audit,
    execution,
    ...(errorAnalysis ? { errorAnalysis } : {}),
    totalMs: Date.now() - overallStart,
  };
}

export interface WorkflowRef {
  id: number;
  name: string;
  prompt: string | null;
  n8n_workflow_id: string | null;
}

export interface ReexecutionResult {
  status: 'success' | 'failed';
  dbExecutionId: number;
  n8nExecutionId?: string;
  webhookUrl: string;
  data?: unknown;
  error?: string;
  errorAnalysis?: string;
  ms: number;
}

export async function rerunWorkflow(
  userId: number,
  workflow: WorkflowRef,
  payload: unknown = {}
): Promise<ReexecutionResult> {
  if (!workflow.n8n_workflow_id) {
    throw new N8nError('Workflow has not been deployed to n8n yet', 409);
  }

  const started = Date.now();
  const n8nId = workflow.n8n_workflow_id;
  const n8nWorkflow = await n8n.getWorkflow(n8nId);

  if (!n8n.isWorkflowActive(n8nWorkflow)) {
    await n8n.activateWorkflow(n8nId);
    await pool.query(`UPDATE workflows SET is_active = 1 WHERE id = ?`, [workflow.id]);
  }

  const webhookNode = n8n.findWebhookNode(n8nWorkflow);
  const webhookPath = webhookNode?.parameters?.path;
  const webhookUrl =
    typeof webhookPath === 'string' && webhookPath
      ? `${config.n8n.publicUrl}/webhook/${webhookPath.replace(/^\/+/, '')}`
      : '';

  try {
    const run = await n8n.executeViaWebhook(n8nWorkflow, { payload });
    const latest = await findLatestExecution(n8nId, 3);

    const [insert] = await pool.query<ResultSetHeader>(
      `INSERT INTO workflow_executions
         (workflow_id, user_id, n8n_execution_id, status, input_data, output_data, started_at, completed_at)
       VALUES (?, ?, ?, 'completed', ?, ?, NOW(), NOW())`,
      [workflow.id, userId, latest?.id ?? null, JSON.stringify(payload ?? {}), JSON.stringify(run.data ?? null)]
    );

    return {
      status: 'success',
      dbExecutionId: insert.insertId,
      n8nExecutionId: latest?.id,
      webhookUrl: run.webhookUrl,
      data: run.data,
      ms: Date.now() - started,
    };
  } catch (err) {
    let errorText = msg(err);
    const latest = await findLatestExecution(n8nId, 5);
    if (latest?.id) {
      try {
        const full = await n8n.getExecution(latest.id, true);
        errorText = buildErrorText(full, errorText, workflow.name);
      } catch {
        errorText = buildErrorText(latest, errorText, workflow.name);
      }
    }

    const errorAnalysis = await analyzeError(workflow.name, workflow.prompt ?? '', errorText);

    const [insert] = await pool.query<ResultSetHeader>(
      `INSERT INTO workflow_executions
         (workflow_id, user_id, n8n_execution_id, status, input_data, output_data, error_message, error_analysis, started_at, completed_at)
       VALUES (?, ?, ?, 'failed', ?, NULL, ?, ?, NOW(), NOW())`,
      [
        workflow.id,
        userId,
        latest?.id ?? null,
        JSON.stringify(payload ?? {}),
        errorText.slice(0, 60000),
        errorAnalysis ?? null,
      ]
    );

    return {
      status: 'failed',
      dbExecutionId: insert.insertId,
      n8nExecutionId: latest?.id,
      webhookUrl,
      error: errorText,
      errorAnalysis,
      ms: Date.now() - started,
    };
  }
}
