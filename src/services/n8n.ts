import axios, { AxiosError, AxiosRequestConfig } from 'axios';
import { randomUUID } from 'crypto';
import { config } from '../config/env.js';

export class N8nError extends Error {
  status: number;
  n8nStatus?: number;
  details?: unknown;

  constructor(message: string, status: number, n8nStatus?: number, details?: unknown) {
    super(message);
    this.name = 'N8nError';
    this.status = status;
    this.n8nStatus = n8nStatus;
    this.details = details;
  }
}

export interface N8nNode {
  id?: string;
  name: string;
  type: string;
  typeVersion?: number;
  position?: number[];
  parameters?: Record<string, any>;
  webhookId?: string;
  disabled?: boolean;
  credentials?: Record<string, any>;
}

export interface N8nWorkflow {
  id: string;
  name: string;
  active?: boolean;
  activeVersionId?: string | null;
  nodes: N8nNode[];
  connections: Record<string, any>;
  settings?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
}

export interface N8nExecution {
  id: string;
  workflowId: string;
  status: string;
  finished: boolean;
  mode: string;
  startedAt: string;
  stoppedAt?: string | null;
  data?: any;
}

export interface CreateWorkflowInput {
  name: string;
  nodes: N8nNode[];
  connections: Record<string, any>;
  settings?: Record<string, any>;
  description?: string;
}

export interface N8nCredential {
  id: string;
  name: string;
  type: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateCredentialInput {
  name: string;
  type: string;
  data: Record<string, unknown>;
}

export interface WebhookTriggerResult {
  webhookUrl: string;
  nodeName: string;
  status: number;
  data: unknown;
}

const WEBHOOK_NODE_TYPE = 'n8n-nodes-base.webhook';
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function isN8nConfigured(): boolean {
  return Boolean(config.n8n.apiKey);
}

function ensureConfigured(): void {
  if (!isN8nConfigured()) {
    throw new N8nError(
      'n8n is not configured. Set N8N_API_URL and N8N_API_KEY in .env (see docs/PHASE3.md).',
      503
    );
  }
}

function toN8nError(err: unknown): N8nError {
  if (err instanceof N8nError) return err;
  const ax = err as AxiosError<any>;
  if (ax.response) {
    const n8nStatus = ax.response.status;
    let message: unknown = (ax.response.data as any)?.message || ax.message;
    if (Array.isArray(message)) message = message.join('; ');
    if (n8nStatus === 401 || n8nStatus === 403) {
      return new N8nError(
        `n8n rejected the request (${n8nStatus}). Check N8N_API_KEY (for credential endpoints the key needs credential scopes).`,
        502,
        n8nStatus,
        ax.response.data
      );
    }
    if (n8nStatus === 404) {
      return new N8nError(String(message || 'Not found in n8n'), 404, n8nStatus, ax.response.data);
    }
    if (n8nStatus >= 500) {
      return new N8nError(`n8n server error (${n8nStatus}): ${String(message)}`, 502, n8nStatus, ax.response.data);
    }
    return new N8nError(String(message || 'n8n request failed'), 400, n8nStatus, ax.response.data);
  }
  if (ax.code === 'ECONNABORTED' || ax.code === 'ETIMEDOUT') {
    return new N8nError(`n8n timed out after ${config.n8n.timeoutMs}ms`, 504);
  }
  return new N8nError(`Cannot reach n8n at ${config.n8n.apiUrl} (${ax.message}). Is n8n running?`, 502);
}

function isRetryable(err: N8nError): boolean {
  if (err.n8nStatus !== undefined) return RETRYABLE_STATUS.has(err.n8nStatus);
  return err.status >= 500;
}

async function request<T>(cfg: AxiosRequestConfig, opts: { retry?: boolean } = {}): Promise<T> {
  ensureConfigured();
  const attempts = opts.retry ? config.n8n.maxRetries + 1 : 1;
  let lastError: N8nError | undefined;

  for (let i = 0; i < attempts; i++) {
    try {
      const res = await axios.request<T>({
        baseURL: config.n8n.apiUrl,
        timeout: config.n8n.timeoutMs,
        headers: {
          'X-N8N-API-KEY': config.n8n.apiKey,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        ...cfg,
      });
      return res.data;
    } catch (err) {
      const n8nErr = toN8nError(err);
      lastError = n8nErr;
      if (!opts.retry || !isRetryable(n8nErr) || i === attempts - 1) throw n8nErr;
      await sleep(400 * (i + 1));
    }
  }
  throw lastError;
}

export function isWorkflowActive(workflow: N8nWorkflow): boolean {
  return workflow.active === true || workflow.activeVersionId != null;
}

export async function listWorkflows(params: {
  active?: boolean;
  limit?: number;
  cursor?: string;
  name?: string;
} = {}): Promise<{ data: N8nWorkflow[]; nextCursor: string | null }> {
  return request(
    {
      method: 'GET',
      url: '/workflows',
      params: {
        limit: params.limit ?? 100,
        ...(params.active !== undefined ? { active: String(params.active) } : {}),
        ...(params.cursor ? { cursor: params.cursor } : {}),
        ...(params.name ? { name: params.name } : {}),
      },
    },
    { retry: true }
  );
}

export async function getWorkflow(id: string): Promise<N8nWorkflow> {
  return request({ method: 'GET', url: `/workflows/${encodeURIComponent(id)}` }, { retry: true });
}

function normalizeNode(node: N8nNode): N8nNode {
  return {
    ...node,
    id: node.id || randomUUID(),
    position: node.position && node.position.length === 2 ? node.position : [0, 0],
    ...(node.type === WEBHOOK_NODE_TYPE && !node.webhookId ? { webhookId: randomUUID() } : {}),
  };
}

export async function createWorkflow(input: CreateWorkflowInput): Promise<N8nWorkflow> {
  return request({
    method: 'POST',
    url: '/workflows',
    data: {
      name: input.name,
      nodes: input.nodes.map(normalizeNode),
      connections: input.connections,
      settings: input.settings ?? {},
      ...(input.description ? { description: input.description } : {}),
    },
  });
}

export async function deleteWorkflow(id: string): Promise<N8nWorkflow> {
  // n8n refuses to delete a published workflow (HTTP 400) and unpublishes
  // asynchronously, so a delete right after deactivation can still fail —
  // deactivate and retry with backoff until n8n lets the delete through.
  const attempts = 5;
  for (let i = 0; i < attempts; i++) {
    try {
      return await request({ method: 'DELETE', url: `/workflows/${encodeURIComponent(id)}` });
    } catch (err) {
      if (!(err instanceof N8nError)) throw err;

      const published = err.n8nStatus === 400 && /published/i.test(err.message);
      const unpublishing = err.n8nStatus === 409;
      if ((!published && !unpublishing) || i === attempts - 1) throw err;

      if (published) {
        await deactivateWorkflow(id).catch(() => undefined);
      }
      await sleep(900 * (i + 1));
    }
  }
  throw new N8nError('Delete workflow failed', 502);
}

export async function updateWorkflow(
  id: string,
  input: {
    name?: string;
    nodes?: N8nNode[];
    connections?: Record<string, any>;
    settings?: Record<string, any>;
    description?: string;
  }
): Promise<N8nWorkflow> {
  const current = await getWorkflow(id);
  return request({
    method: 'PUT',
    url: `/workflows/${encodeURIComponent(id)}`,
    data: {
      name: input.name ?? current.name,
      nodes: (input.nodes ?? current.nodes).map(normalizeNode),
      connections: input.connections ?? current.connections,
      settings: input.settings ?? current.settings ?? {},
      ...(input.description !== undefined
        ? { description: input.description }
        : (current as any).description
          ? { description: (current as any).description }
          : {}),
    },
  });
}

export async function activateWorkflow(id: string): Promise<N8nWorkflow> {
  const path = `/workflows/${encodeURIComponent(id)}`;
  try {
    return await request({ method: 'POST', url: `${path}/activate` });
  } catch (err) {
    if (err instanceof N8nError && err.n8nStatus === 404) {
      return request({ method: 'POST', url: `${path}/publish` });
    }
    throw err;
  }
}

export async function deactivateWorkflow(id: string): Promise<N8nWorkflow> {
  const path = `/workflows/${encodeURIComponent(id)}`;
  try {
    return await request({ method: 'POST', url: `${path}/deactivate` });
  } catch (err) {
    if (err instanceof N8nError && err.n8nStatus === 404) {
      return request({ method: 'POST', url: `${path}/unpublish` });
    }
    throw err;
  }
}

export async function listExecutions(params: {
  workflowId?: string;
  status?: string;
  limit?: number;
  cursor?: string;
  includeData?: boolean;
} = {}): Promise<{ data: N8nExecution[]; nextCursor: string | null }> {
  return request(
    {
      method: 'GET',
      url: '/executions',
      params: {
        limit: params.limit ?? 50,
        ...(params.workflowId ? { workflowId: params.workflowId } : {}),
        ...(params.status ? { status: params.status } : {}),
        ...(params.cursor ? { cursor: params.cursor } : {}),
        ...(params.includeData ? { includeData: 'true' } : {}),
      },
    },
    { retry: true }
  );
}

export async function getExecution(id: string, includeData = true): Promise<N8nExecution> {
  return request(
    {
      method: 'GET',
      url: `/executions/${encodeURIComponent(id)}`,
      params: includeData ? { includeData: 'true' } : {},
    },
    { retry: true }
  );
}

export function findWebhookNode(workflow: N8nWorkflow, nodeName?: string): N8nNode | undefined {
  if (nodeName) {
    const byName = workflow.nodes.find((n) => n.name === nodeName);
    if (byName && byName.type === WEBHOOK_NODE_TYPE) return byName;
    return undefined;
  }
  return workflow.nodes.find((n) => n.type === WEBHOOK_NODE_TYPE && !n.disabled);
}

export async function executeViaWebhook(
  workflow: N8nWorkflow,
  options: { payload?: unknown; nodeName?: string } = {}
): Promise<WebhookTriggerResult> {
  const node = findWebhookNode(workflow, options.nodeName);
  if (!node) {
    throw new N8nError(
      'No Webhook trigger node found in this workflow. n8n\'s public API cannot run workflows directly; ' +
        'add an "n8n-nodes-base.webhook" trigger node to execute it via its webhook URL.',
      400
    );
  }

  const path = node.parameters?.path;
  if (!path || typeof path !== 'string') {
    throw new N8nError(`Webhook node "${node.name}" has no "path" parameter.`, 400);
  }

  const webhookUrl = `${config.n8n.publicUrl}/webhook/${path.replace(/^\/+/, '')}`;
  const method = String(node.parameters?.httpMethod || 'POST').toUpperCase();
  const payload = options.payload ?? {};
  const sendsBody = method === 'POST' || method === 'PUT' || method === 'PATCH';

  // n8n publishes/unpublishes asynchronously; right after activation the webhook
  // may still 404 for a moment, so retry briefly.
  const attempts = 4;
  let lastNotFound: N8nError | undefined;

  for (let i = 0; i < attempts; i++) {
    try {
      const res = await axios.request({
        url: webhookUrl,
        method,
        timeout: config.n8n.timeoutMs,
        headers: { 'Content-Type': 'application/json' },
        validateStatus: () => true,
        ...(sendsBody ? { data: payload } : { params: payload as Record<string, any> }),
      });

      if (res.status === 404) {
        lastNotFound = new N8nError(
          `Webhook not found at ${webhookUrl}. Is the workflow active? (activate it first)`,
          404,
          404,
          res.data
        );
        if (i < attempts - 1) {
          await sleep(800 * (i + 1));
          continue;
        }
        throw lastNotFound;
      }
      if (res.status >= 400) {
        const message = (res.data as any)?.message || `Workflow execution failed (webhook returned ${res.status})`;
        throw new N8nError(String(message), 502, res.status, res.data);
      }

      return { webhookUrl, nodeName: node.name, status: res.status, data: res.data };
    } catch (err) {
      if (err instanceof N8nError) throw err;
      throw toN8nError(err);
    }
  }
  throw lastNotFound ?? new N8nError('Webhook execution failed', 502);
}

export function summarizeExecution(execution: N8nExecution) {
  const error = execution.data?.resultData?.error;
  return {
    id: execution.id,
    workflowId: execution.workflowId,
    status: execution.status,
    finished: execution.finished,
    mode: execution.mode,
    startedAt: execution.startedAt,
    stoppedAt: execution.stoppedAt ?? null,
    error: error
      ? {
          message: error.message,
          node: error.node?.name,
          description: error.description,
        }
      : null,
  };
}

export async function listCredentials(params: {
  limit?: number;
  cursor?: string;
} = {}): Promise<{ data: N8nCredential[]; nextCursor: string | null }> {
  return request(
    {
      method: 'GET',
      url: '/credentials',
      params: {
        limit: params.limit ?? 100,
        ...(params.cursor ? { cursor: params.cursor } : {}),
      },
    },
    { retry: true }
  );
}

export async function getCredential(id: string): Promise<N8nCredential> {
  return request({ method: 'GET', url: `/credentials/${encodeURIComponent(id)}` }, { retry: true });
}

export async function createCredential(input: CreateCredentialInput): Promise<N8nCredential> {
  return request({
    method: 'POST',
    url: '/credentials',
    data: { name: input.name, type: input.type, data: input.data },
  });
}

export async function updateCredential(
  id: string,
  input: { name?: string; data?: Record<string, unknown> }
): Promise<N8nCredential> {
  return request({
    method: 'PATCH',
    url: `/credentials/${encodeURIComponent(id)}`,
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.data !== undefined ? { data: input.data } : {}),
    },
  });
}

export async function deleteCredential(id: string): Promise<N8nCredential> {
  return request({ method: 'DELETE', url: `/credentials/${encodeURIComponent(id)}` });
}

