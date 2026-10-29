import { randomUUID } from 'crypto';
import type { ResultSetHeader } from 'mysql2';
import { callGemini, SYSTEM_PROMPTS, type AIResponse } from './gemini.js';
import * as n8n from './n8n.js';
import { N8nError, type N8nExecution, type N8nNode, type N8nWorkflow } from './n8n.js';
import { listUserCredentials } from '../models/UserCredential.js';
import {
  detectRequiredCredentials,
  missingCredentials,
  linkedCredentialsMap,
  injectCredentials,
  toPublicSpec,
} from './credentials.js';
import { pool } from '../config/db.js';
import { config } from '../config/env.js';

export interface StageReport {
  stage: 'generate' | 'validate' | 'audit' | 'deploy' | 'execute' | 'credentials';
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
  detail?: any;

  constructor(stage: string, message: string, status: number, stages: StageReport[], detail?: any) {
    super(message);
    this.name = 'PipelineError';
    this.stage = stage;
    this.status = status;
    this.stages = stages;
    this.detail = detail;
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

function isWordChar(ch: string): boolean {
  return /[A-Za-z0-9_$]/.test(ch);
}

// AI models occasionally emit JSON5-style output. Repairs are only attempted
// after a strict parse fails, so valid definitions are never mutated.
function repairJson(text: string): string {
  let out = '';
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      out += ch;
      if (ch === '\\') {
        out += text[i + 1] ?? '';
        i++;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === ',') {
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) j++;
      if (text[j] === '}' || text[j] === ']') continue;
      out += ch;
      continue;
    }
    if (/[A-Za-z_$]/.test(ch)) {
      const prev = out.replace(/\s+$/, '').slice(-1);
      if (prev === '' || prev === '{' || prev === ',') {
        let j = i;
        while (j < text.length && isWordChar(text[j])) j++;
        const word = text.slice(i, j);
        let k = j;
        while (k < text.length && /\s/.test(text[k])) k++;
        if (text[k] === ':') {
          out += `"${word}"`;
          i = j - 1;
          continue;
        }
      }
    }
    out += ch;
  }
  return out;
}

function parseJsonWithRepair(candidate: string): unknown {
  try {
    return JSON.parse(candidate);
  } catch (strictErr) {
    const repaired = repairJson(candidate);
    if (repaired !== candidate) {
      try {
        return JSON.parse(repaired);
      } catch {
        throw strictErr;
      }
    }
    throw strictErr;
  }
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
  return parseJsonWithRepair(cleaned.slice(start, end + 1));
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

const SLACK_NODE_TYPE = 'n8n-nodes-base.slack';
const SLACK_NODE_VERSION = 2.7;

const SMTP_NODE_TYPE = 'n8n-nodes-base.emailSend';

function normalizeSmtpNode(parameters: any): { parameters: any } | undefined {
  const p = parameters ?? {};
  const out = { ...p };

  // n8n emailSend node uses 'text' for plain text body and 'html' for HTML body.
  // AI often generates 'body', 'message', or 'content' instead.
  if (!out.text && !out.html) {
    const body = out.body || out.message || out.content || out.emailBody || out.bodyText || '';
    if (body) {
      out.text = String(body);
      delete out.body;
      delete out.message;
      delete out.content;
      delete out.emailBody;
      delete out.bodyText;
    }
  }

  // Ensure subject is set
  if (!out.subject) out.subject = 'Message from n8n';

  // Ensure fromEmail is set — SMTP node requires a sender address
  if (!out.fromEmail && !out.from) {
    // Use toEmail as fallback sender, or a generic placeholder
    out.fromEmail = out.toEmail || out.to || 'noreply@automation.local';
  }

  // Normalize toEmail field
  if (!out.toEmail && out.to) {
    out.toEmail = out.to;
  }

  return { parameters: out };
}

function toResourceLocator(value: unknown): { __rl: true; mode: string; value: string } | undefined {
  if (typeof value === 'string' && value.trim()) {
    const v = value.trim();
    return { __rl: true, mode: /^[CGD][A-Z0-9]{2,}$/.test(v) ? 'id' : 'name', value: v };
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const v = value as { value?: unknown; mode?: unknown };
    if (typeof v.value === 'string' && v.value.trim()) {
      return {
        __rl: true,
        mode: typeof v.mode === 'string' && v.mode ? v.mode : 'id',
        value: v.value.trim(),
      };
    }
  }
  return undefined;
}

function normalizeSlackNode(parameters: any): { parameters: any; version?: number } | undefined {
  const p = parameters ?? {};
  const resource = typeof p.resource === 'string' ? p.resource : 'message';
  const operation = typeof p.operation === 'string' ? p.operation : 'post';
  if (resource !== 'message' || (operation !== 'post' && operation !== 'schedule')) return undefined;

  const out: any = { ...p, resource, operation };
  if (!out.messageType) out.messageType = 'text';
  if (!out.select) out.select = out.user ? 'user' : 'channel';

  if (out.select === 'channel') {
    const rl = toResourceLocator(out.channelId ?? out.channel);
    if (rl) out.channelId = rl;
    delete out.channel;
  } else if (out.select === 'user') {
    const rl = toResourceLocator(out.user);
    if (rl) out.user = rl;
  }

  return { parameters: out, version: SLACK_NODE_VERSION };
}

function extractSlackMessageText(parameters: any): string {
  const p = parameters ?? {};

  if (typeof p.jsonBody === 'string' && p.jsonBody.trim()) {
    try {
      const parsed = JSON.parse(p.jsonBody);
      for (const key of ['text', 'content', 'message']) {
        const candidate = parsed?.[key];
        if (typeof candidate === 'string' && candidate.trim()) return candidate;
      }
    } catch {
      // not JSON — fall through
    }
  }

  const bodyParams = p.bodyParameters?.parameters;
  if (Array.isArray(bodyParams)) {
    for (const key of ['text', 'content', 'message']) {
      const hit = bodyParams.find((x: any) => String(x?.name ?? '').toLowerCase() === key);
      if (hit && typeof hit.value === 'string' && hit.value.trim()) return hit.value;
    }
  }

  for (const candidate of [p.body?.text, p.body?.content, p.text, p.content, p.message]) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate;
  }

  return 'Message from n8n automation';
}

function extractSlackChannel(prompt: string, parameters: any): string {
  const fromParams = parameters?.channelId?.value ?? parameters?.channel;
  if (typeof fromParams === 'string' && fromParams.trim()) {
    const value = fromParams.trim();
    return value.startsWith('#') ? value : `#${value}`;
  }
  const match = /#([a-z0-9][a-z0-9_-]{1,})/i.exec(String(prompt ?? ''));
  if (match) return `#${match[1]}`;
  return '#general';
}

/**
 * Models sometimes answer a Slack request with an HTTP Request node pointing at
 * the literal placeholder "SLACK_WEBHOOK_URL". That URL can never work: the user
 * has a Slack app credential (bot token), not an incoming webhook. Rewrite such
 * nodes into a real Slack node so the connected credential is used instead.
 */
function normalizeSlackHttpRequest(node: N8nNode, prompt: string): void {
  const url = String((node.parameters as any)?.url ?? '');
  if (!/SLACK_WEBHOOK/i.test(url)) return;

  const text = extractSlackMessageText(node.parameters);
  const channel = extractSlackChannel(prompt, node.parameters);

  node.type = SLACK_NODE_TYPE;
  node.typeVersion = SLACK_NODE_VERSION;
  node.parameters = {
    resource: 'message',
    operation: 'post',
    select: 'channel',
    channelId: { __rl: true, mode: 'name', value: channel },
    messageType: 'text',
    text,
    otherOptions: {},
  };
  delete (node as any).credentials;
}

const GMAIL_NODE_TYPE = 'n8n-nodes-base.gmail';
const GMAIL_NODE_VERSION = 2.2;

function normalizeGmailNode(node: N8nNode): void {
  const p = (node.parameters ?? {}) as any;
  const resource = typeof p.resource === 'string' ? p.resource : 'message';
  const operation = typeof p.operation === 'string' ? p.operation : 'send';
  const out: any = { ...p, resource, operation };

  if (resource === 'message' && operation === 'send') {
    if (!out.sendTo) out.sendTo = out.to ?? out.toEmail ?? out.recipient ?? out.email;
    if (!out.subject) out.subject = out.title ?? 'Message from n8n';
    if (!out.message) out.message = out.text ?? out.body ?? out.content ?? out.html ?? out.emailBody;
    if (!out.options || typeof out.options !== 'object') out.options = {};
    if (!out.options.emailType) out.options.emailType = 'text';

    delete out.to;
    delete out.toEmail;
    delete out.recipient;
    delete out.email;
    delete out.title;
    delete out.text;
    delete out.body;
    delete out.content;
    delete out.html;
    delete out.emailBody;
  }

  node.parameters = out;
  if (typeof node.typeVersion !== 'number' || node.typeVersion < GMAIL_NODE_VERSION) {
    node.typeVersion = GMAIL_NODE_VERSION;
  }
}

const EMAIL_SEND_NODE_VERSION = 2.1;

function extractDiscordContent(parameters: any): string {
  const p = parameters ?? {};

  if (typeof p.jsonBody === 'string' && p.jsonBody.trim()) {
    try {
      const parsed = JSON.parse(p.jsonBody);
      if (parsed && typeof parsed === 'object' && typeof parsed.content === 'string' && parsed.content.trim()) {
        return parsed.content;
      }
    } catch {
      // not JSON — fall through to the other shapes
    }
  }

  const bodyParams = p.bodyParameters?.parameters;
  if (Array.isArray(bodyParams)) {
    const hit = bodyParams.find((x: any) => String(x?.name ?? '').toLowerCase() === 'content');
    if (hit && typeof hit.value === 'string' && hit.value.trim()) return hit.value;
  }

  for (const candidate of [p.body?.content, p.content, p.text, p.message]) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate;
  }

  return 'Message from n8n automation';
}

const DISCORD_NODE_TYPE = 'n8n-nodes-base.discord';

function normalizeDiscordNode(parameters: any, webhookUri?: string): { parameters: any; convertToHttp?: boolean; httpParameters?: any } | undefined {
  const p = parameters ?? {};
  const out = { ...p };

  // If webhookUri is available, convert to HTTP Request node for reliability
  if (webhookUri) {
    return {
      parameters: out,
      convertToHttp: true,
      httpParameters: {
        method: 'POST',
        url: webhookUri,
        sendBody: true,
        bodyParameters: {
          parameters: [{ name: 'content', value: out.content || out.text || out.message || 'Message from n8n automation' }],
        },
        options: {},
      },
    };
  }

  if (!out.operation) out.operation = 'message';
  if (!out.resource) out.resource = 'webhook';
  return { parameters: out };
}


const GOOGLE_SHEETS_NODE_TYPE = 'n8n-nodes-base.googleSheets';
const GOOGLE_SHEETS_NODE_VERSION = 4.5;

function extractSheetId(prompt: string): string | undefined {
  const url = /spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/.exec(prompt);
  if (url) return url[1];
  const labeled = /spreadsheet\s*id[^A-Za-z0-9_-]*([a-zA-Z0-9_-]{20,})/i.exec(prompt);
  return labeled?.[1];
}

function extractSheetGid(prompt: string): string | undefined {
  const m = /gid\s*[=:]?\s*[`'"]?(\d+)/i.exec(prompt);
  return m?.[1];
}

// Pulls "Label: value" lines (bulleted or not) out of the prompt.
// Markdown links like [a@b.com](mailto:a@b.com) become plain text.
function extractColumnValues(prompt: string): Record<string, string> {
  const out: Record<string, string> = {};
  const text = String(prompt ?? '').replace(/\[([^\]]+)\]\((?:mailto:|https?:)[^)]*\)/gi, '$1');
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(?:[*\-•]\s*)?\**([A-Za-z][A-Za-z0-9 _]{0,29}?)\**\s*:\s*(.+?)\s*$/.exec(line);
    if (!m) continue;
    const key = m[1].trim();
    const value = m[2].trim().replace(/^[`'"]|[`'"]$/g, '');
    if (!value || /^https?$/i.test(key) || key.split(/\s+/).length > 3) continue;
    out[key] = value;
  }
  return out;
}

/**
 * Builds a valid Google Sheets node. The spreadsheet ID, sheet GID and column
 * values are taken from the user's prompt first, so they never depend on what
 * the model happened to generate.
 */
function normalizeGoogleSheetsNode(node: N8nNode, prompt: string): void {
  const p = (node.parameters ?? {}) as any;
  const operation = ['append', 'appendOrUpdate', 'update'].includes(p.operation) ? p.operation : 'append';

  // Document: ID from the prompt, else whatever the model gave (string, URL or locator).
  const modelDoc = typeof p.documentId === 'string' ? p.documentId : p.documentId?.value;
  const modelDocStr = String(modelDoc ?? '');
  const modelDocId =
    /spreadsheets\/d\/([a-zA-Z0-9_-]+)/.exec(modelDocStr)?.[1] ??
    (/^[a-zA-Z0-9_-]{20,}$/.test(modelDocStr) ? modelDocStr : undefined);
  const docId = extractSheetId(prompt) ?? modelDocId;
  if (!docId) {
    throw new Error('Google Sheets node has no spreadsheet ID; include the sheet URL or ID in the prompt');
  }

  // Sheet: a GID only works in "id" mode, a tab title only in "name" mode.
  const modelSheet = typeof p.sheetName === 'string' ? p.sheetName : p.sheetName?.value;
  const modelSheetStr = String(modelSheet ?? '').trim();
  const promptGid = extractSheetGid(prompt);
  let sheetLocator: { __rl: true; mode: string; value: string };
  if (promptGid !== undefined) {
    sheetLocator = { __rl: true, mode: 'id', value: promptGid };
  } else if (/^(gid=)?\d+$/.test(modelSheetStr)) {
    sheetLocator = { __rl: true, mode: 'id', value: modelSheetStr.replace(/^gid=/, '') };
  } else if (modelSheetStr) {
    sheetLocator = { __rl: true, mode: 'name', value: modelSheetStr };
  } else {
    sheetLocator = { __rl: true, mode: 'id', value: '0' };
  }

  // Column values: exact values from the prompt override model-invented ones.
  const values: Record<string, unknown> =
    p.columns?.value && typeof p.columns.value === 'object' ? { ...p.columns.value } : {};
  for (const [k, v] of Object.entries(extractColumnValues(prompt))) {
    const existing = Object.keys(values).find((x) => x.toLowerCase() === k.toLowerCase());
    values[existing ?? k] = v;
  }
  for (const [k, v] of Object.entries(values)) {
    if (v === undefined || v === null || v === '' || /YOUR_|PLACEHOLDER/i.test(String(v))) delete values[k];
  }

  const columns: any =
    Object.keys(values).length > 0
      ? {
          mappingMode: 'defineBelow',
          value: values,
          matchingColumns: operation === 'append' ? [] : (p.columns?.matchingColumns ?? []),
          schema: Object.keys(values).map((id) => ({
            id,
            displayName: id,
            required: false,
            defaultMatch: false,
            display: true,
            canBeUsedToMatch: true,
            type: 'string',
            removed: false,
          })),
        }
      : { mappingMode: 'autoMapInputData', value: {}, matchingColumns: [], schema: [] };

  node.typeVersion = GOOGLE_SHEETS_NODE_VERSION;
  node.parameters = {
    resource: 'sheet',
    operation,
    documentId: { __rl: true, mode: 'id', value: docId },
    sheetName: sheetLocator,
    columns,
    options: p.options && typeof p.options === 'object' ? p.options : {},
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
    if (built.type === SLACK_NODE_TYPE) {
      const normalized = normalizeSlackNode(built.parameters);
      if (normalized) {
        built.parameters = normalized.parameters;
        built.typeVersion = normalized.version ?? built.typeVersion;
      }
    }
    if (built.type === DISCORD_NODE_TYPE) {
      const normalized = normalizeDiscordNode(built.parameters);
      if (normalized) {
        built.parameters = normalized.parameters;
      }
    }
    if (built.type === 'n8n-nodes-base.httpRequest') {
      normalizeSlackHttpRequest(built, prompt);
    }
    if (built.type === SMTP_NODE_TYPE) {
      const normalized = normalizeSmtpNode(built.parameters);
      if (normalized) {
        built.parameters = normalized.parameters;
      }
      if (typeof built.typeVersion !== 'number' || built.typeVersion < EMAIL_SEND_NODE_VERSION) {
        built.typeVersion = EMAIL_SEND_NODE_VERSION;
      }
    }
    if (built.type === GMAIL_NODE_TYPE) {
      normalizeGmailNode(built);
    }
    if (built.type === GOOGLE_SHEETS_NODE_TYPE) {
      normalizeGoogleSheetsNode(built, prompt);
    }
    // AI models invent credential ids (e.g. YOUR_CREDENTIAL_ID); real
    // credentials are injected later from the user's linked apps.
    delete (built as any).credentials;
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

export async function runPipeline(
  userId: number,
  prompt: string,
  options: { skipApps?: string[] } = {}
): Promise<PipelineResult> {
  const stages: StageReport[] = [];
  const overallStart = Date.now();

  const generateStart = Date.now();
  let clean: CleanWorkflow;
  try {
    const baseGenPrompt = `${prompt}\n\nIMPORTANT: the entry point must be a Webhook trigger node (type "n8n-nodes-base.webhook", typeVersion 2) so the workflow can be executed via its webhook URL. Keep the workflow small (2 to 5 nodes).`;
    let lastGenError: unknown;
    let generated: { clean: CleanWorkflow; res: AIResponse } | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      // A malformed reply is retried instead of failing the whole build.
      const strict = attempt > 0 ? '\nRespond with strictly valid JSON only: double quotes around every key and string, no trailing commas, no comments.' : '';
      try {
        const reply = await callGemini(SYSTEM_PROMPTS.generateWorkflow, baseGenPrompt + strict);
        generated = { clean: sanitizeWorkflow(extractJson(reply.text), prompt), res: reply };
        break;
      } catch (err) {
        lastGenError = err;
      }
    }
    if (!generated) throw lastGenError;
    clean = generated.clean;
    stages.push({
      stage: 'generate',
      ok: true,
      ms: Date.now() - generateStart,
      detail: { model: generated.res.model, name: clean.name, nodes: clean.nodes.length },
    });
  } catch (err) {
    stages.push({ stage: 'generate', ok: false, ms: Date.now() - generateStart, error: msg(err) });
    throw new PipelineError('generate', `Workflow generation failed: ${msg(err)}`, 502, stages);
  }

  const credentialsStart = Date.now();
  let definitionNodes: N8nNode[] = [];
  try {
    const required = detectRequiredCredentials(clean.nodes);
    const linked = await listUserCredentials(userId);
    const linkedMap = linkedCredentialsMap(linked);
    const skipped = new Set(options.skipApps ?? []);

    const usedSkipped = required.filter((spec) => skipped.has(spec.app));
    if (usedSkipped.length > 0) {
      const labels = usedSkipped.map((spec) => spec.label).join(', ');
      stages.push({
        stage: 'credentials',
        ok: false,
        ms: Date.now() - credentialsStart,
        error: `Workflow needs ${labels}, but the app was skipped`,
      });
      throw new PipelineError(
        'credentials',
        `This workflow needs ${labels}, which you chose to skip. Generate a workflow without ${labels}.`,
        422,
        stages,
        { skippedApps: usedSkipped.map((spec) => spec.app) }
      );
    }

    const missing = missingCredentials(required, linked);
    if (missing.length > 0) {
      const labels = missing.map((spec) => spec.label).join(', ');
      stages.push({
        stage: 'credentials',
        ok: false,
        ms: Date.now() - credentialsStart,
        error: `Credentials required: ${labels}`,
      });
      throw new PipelineError(
        'credentials',
        `Credentials required before this workflow can run: ${labels}. Add them via POST /api/credentials, link an existing n8n credential, or skip the app.`,
        409,
        stages,
        {
          needsCredentials: missing.map(toPublicSpec),
          workflowPreview: {
            name: clean.name,
            nodes: clean.nodes,
            connections: clean.connections,
          },
        }
      );
    }

    // Keep the stored definition free of injected credential ids.
    definitionNodes = JSON.parse(JSON.stringify(clean.nodes)) as N8nNode[];
    injectCredentials(clean.nodes, linkedMap);

    // Discord: convert discord nodes to HTTP Request using the webhook URL
    // stored in credential_name (set at credential-creation time).
    const discordCred = linked.find((c) => c.app === 'discord');
    if (discordCred) {
      const webhookUri = discordCred.credential_name;
      if (webhookUri && webhookUri.startsWith('https://discord.com/api/webhooks/')) {
        for (const node of clean.nodes) {
          if (node.type === DISCORD_NODE_TYPE) {
            const content = (node.parameters as any)?.content
              || (node.parameters as any)?.text
              || (node.parameters as any)?.message
              || (node.parameters as any)?.body?.content
              || 'Message from n8n automation';
            node.type = 'n8n-nodes-base.httpRequest';
            node.typeVersion = 4.2;
            node.parameters = {
              method: 'POST',
              url: webhookUri,
              sendHeaders: true,
              headerParameters: { parameters: [{ name: 'Content-Type', value: 'application/json' }] },
              sendBody: true,
              specifyBody: 'json',
              jsonBody: JSON.stringify({ content }),
              options: {},
            };
            delete (node as any).credentials;
          } else if (node.type === 'n8n-nodes-base.httpRequest') {
            // The generator is told to use the DISCORD_WEBHOOK_URL placeholder;
            // swap it for the real webhook stored with the Discord credential.
            const url = String((node.parameters as any)?.url ?? '');
            if (/DISCORD_WEBHOOK/i.test(url)) {
              const content = extractDiscordContent(node.parameters);
              node.typeVersion = 4.2;
              node.parameters = {
                method: 'POST',
                url: webhookUri,
                sendHeaders: true,
                headerParameters: { parameters: [{ name: 'Content-Type', value: 'application/json' }] },
                sendBody: true,
                specifyBody: 'json',
                jsonBody: JSON.stringify({ content }),
                options: {},
              };
              delete (node as any).credentials;
            }
          }
        }
      }
    }

    stages.push({
      stage: 'credentials',
      ok: true,
      ms: Date.now() - credentialsStart,
      detail: {
        required: required.map((spec) => spec.app),
        linked: required.map((spec) => spec.app),
      },
    });
  } catch (err) {
    if (err instanceof PipelineError) throw err;
    stages.push({ stage: 'credentials', ok: false, ms: Date.now() - credentialsStart, error: msg(err) });
    throw new PipelineError('credentials', `Credential setup failed: ${msg(err)}`, 500, stages);
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
    // activation succeeded → the workflow is published in n8n; keep the flag honest
    await pool.query(`UPDATE workflows SET is_active = 1 WHERE id = ?`, [workflowId]);
    const run = await n8n.executeViaWebhook(created, { payload: {} });

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
  is_active?: boolean | number;
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
  } else if (!workflow.is_active) {
    // the workflow is published in n8n but our flag drifted — sync it
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
