import type { N8nNode } from './n8n.js';
import type { UserCredential } from '../models/UserCredential.js';

export type CredentialFieldType = 'text' | 'password' | 'number' | 'boolean';

export interface CredentialFieldSpec {
  key: string;
  label: string;
  type: CredentialFieldType;
  required: boolean;
  placeholder?: string;
}

export interface CredentialSpec {
  app: string;
  label: string;
  type: string;
  nodeTypes: string[];
  creatable: boolean;
  fields: CredentialFieldSpec[];
  hint?: string;
}

export interface PublicCredentialSpec {
  app: string;
  label: string;
  type: string;
  creatable: boolean;
  fields: CredentialFieldSpec[];
  hint?: string;
}

export const CREDENTIAL_SPECS: CredentialSpec[] = [
  {
    app: 'telegram',
    label: 'Telegram',
    type: 'telegramApi',
    nodeTypes: ['n8n-nodes-base.telegram', 'n8n-nodes-base.telegramTrigger'],
    creatable: true,
    fields: [
      {
        key: 'accessToken',
        label: 'Bot token',
        type: 'password',
        required: true,
        placeholder: '123456789:AAExampleTokenFromBotFather',
      },
    ],
  },
  {
    app: 'whatsapp',
    label: 'WhatsApp',
    type: 'whatsAppApi',
    nodeTypes: ['n8n-nodes-base.whatsApp', 'n8n-nodes-base.whatsAppTrigger'],
    creatable: true,
    fields: [
      { key: 'accessToken', label: 'Access token', type: 'password', required: true },
      {
        key: 'businessAccountId',
        label: 'Business account ID',
        type: 'text',
        required: true,
        placeholder: '123456789012345',
      },
    ],
  },
  {
    app: 'discord',
    label: 'Discord',
    type: 'discordBotApi',
    nodeTypes: ['n8n-nodes-base.discord'],
    creatable: true,
    fields: [{ key: 'botToken', label: 'Bot token', type: 'password', required: true }],
  },
  {
    app: 'slack',
    label: 'Slack',
    type: 'slackApi',
    nodeTypes: ['n8n-nodes-base.slack'],
    creatable: true,
    fields: [{ key: 'accessToken', label: 'Access token', type: 'password', required: true }],
  },
  {
    app: 'smtp',
    label: 'Email (SMTP)',
    type: 'smtp',
    nodeTypes: ['n8n-nodes-base.emailSend', 'n8n-nodes-base.emailReadImap'],
    creatable: true,
    fields: [
      { key: 'host', label: 'SMTP host', type: 'text', required: true, placeholder: 'smtp.gmail.com' },
      { key: 'port', label: 'Port', type: 'number', required: true, placeholder: '587' },
      { key: 'user', label: 'Username', type: 'text', required: true },
      { key: 'password', label: 'Password', type: 'password', required: true },
      { key: 'secure', label: 'Use SSL/TLS', type: 'boolean', required: false },
    ],
  },
  {
    app: 'gmail',
    label: 'Gmail',
    type: 'gmailOAuth2',
    nodeTypes: ['n8n-nodes-base.gmail', 'n8n-nodes-base.gmailTrigger'],
    creatable: false,
    fields: [],
    hint:
      'Gmail uses OAuth2, so it cannot be created from here. Connect it in n8n (Credentials -> New -> Gmail OAuth2), then link it with its n8n credential id, or skip this app.',
  },
  {
    app: 'googleSheets',
    label: 'Google Sheets',
    type: 'googleSheetsOAuth2Api',
    nodeTypes: ['n8n-nodes-base.googleSheets', 'n8n-nodes-base.googleSheetsTrigger'],
    creatable: false,
    fields: [],
    hint:
      'Google Sheets uses OAuth2, so it cannot be created from here. Connect it in n8n (Credentials -> New -> Google Sheets OAuth2), then link it with its n8n credential id, or skip this app.',
  },
  {
    app: 'instagram',
    label: 'Instagram',
    type: 'instagramOAuth2Api',
    nodeTypes: ['n8n-nodes-base.instagram'],
    creatable: false,
    fields: [],
    hint:
      'Instagram uses OAuth2, so it cannot be created from here. Connect it in n8n (Credentials -> New -> Instagram OAuth2), then link it with its n8n credential id, or skip this app.',
  },
];

export const CREDENTIAL_APPS = CREDENTIAL_SPECS.map((s) => s.app);

const SPEC_BY_APP = new Map(CREDENTIAL_SPECS.map((s) => [s.app, s]));
const SPEC_BY_TYPE = new Map(CREDENTIAL_SPECS.map((s) => [s.type, s]));
const SPEC_BY_NODE_TYPE = new Map<string, CredentialSpec>();
for (const spec of CREDENTIAL_SPECS) {
  for (const nodeType of spec.nodeTypes) SPEC_BY_NODE_TYPE.set(nodeType, spec);
}

export function getCredentialSpec(app: string): CredentialSpec | undefined {
  return SPEC_BY_APP.get(String(app ?? '').trim().toLowerCase());
}

export function getCredentialSpecByType(type: string): CredentialSpec | undefined {
  return SPEC_BY_TYPE.get(type);
}

export function getCredentialSpecForNodeType(nodeType: string): CredentialSpec | undefined {
  return SPEC_BY_NODE_TYPE.get(nodeType);
}

export function toPublicSpec(spec: CredentialSpec): PublicCredentialSpec {
  return {
    app: spec.app,
    label: spec.label,
    type: spec.type,
    creatable: spec.creatable,
    fields: spec.fields,
    ...(spec.hint ? { hint: spec.hint } : {}),
  };
}

export function listPublicSpecs(): PublicCredentialSpec[] {
  return CREDENTIAL_SPECS.map(toPublicSpec);
}

export function detectRequiredCredentials(nodes: N8nNode[]): CredentialSpec[] {
  const found = new Map<string, CredentialSpec>();
  for (const node of nodes) {
    const spec = SPEC_BY_NODE_TYPE.get(String(node?.type ?? ''));
    if (spec && !found.has(spec.app)) found.set(spec.app, spec);
  }
  return [...found.values()];
}

export function splitSkipApps(raw: unknown): { valid: string[]; unknown: string[] } {
  const values = Array.isArray(raw) ? raw : [];
  const valid: string[] = [];
  const unknown: string[] = [];
  for (const value of values) {
    const app = String(value ?? '').trim().toLowerCase();
    if (!app) continue;
    if (SPEC_BY_APP.has(app)) {
      if (!valid.includes(app)) valid.push(app);
    } else if (!unknown.includes(app)) {
      unknown.push(app);
    }
  }
  return { valid, unknown };
}

export function missingCredentials(
  required: CredentialSpec[],
  linked: UserCredential[]
): CredentialSpec[] {
  const linkedApps = new Set(linked.map((c) => c.app));
  return required.filter((spec) => !linkedApps.has(spec.app));
}

export function linkedCredentialsMap(linked: UserCredential[]): Map<string, UserCredential> {
  return new Map(linked.map((c) => [c.app, c]));
}

export function injectCredentials(nodes: N8nNode[], linked: Map<string, UserCredential>): N8nNode[] {
  for (const node of nodes) {
    const spec = SPEC_BY_NODE_TYPE.get(String(node?.type ?? ''));
    if (!spec) continue;
    const credential = linked.get(spec.app);
    if (!credential) {
      delete node.credentials;
      continue;
    }
    node.credentials = {
      [spec.type]: { id: credential.n8n_credential_id, name: credential.credential_name },
    };
  }
  return nodes;
}

export function toPublicCredential(credential: UserCredential) {
  const spec = getCredentialSpec(credential.app);
  return {
    app: credential.app,
    label: spec?.label ?? credential.app,
    type: credential.credential_type,
    credentialName: credential.credential_name,
    n8nCredentialId: credential.n8n_credential_id,
    managed: Boolean(credential.managed),
    created_at: credential.created_at,
    updated_at: credential.updated_at,
  };
}

export type ValidateFieldsResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: string; missing: string[] };

export function validateCredentialFields(
  spec: CredentialSpec,
  rawInput: unknown
): ValidateFieldsResult {
  const input = rawInput && typeof rawInput === 'object' && !Array.isArray(rawInput) ? (rawInput as Record<string, unknown>) : {};
  const data: Record<string, unknown> = {};
  const missing: string[] = [];

  for (const field of spec.fields) {
    const raw = input[field.key];
    const isEmpty = raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '');

    if (isEmpty) {
      if (field.required) missing.push(field.key);
      continue;
    }

    if (field.type === 'number') {
      const num = typeof raw === 'number' ? raw : Number(String(raw).trim());
      if (!Number.isFinite(num)) {
        return { ok: false, error: `"${field.label}" must be a number`, missing: [] };
      }
      data[field.key] = num;
    } else if (field.type === 'boolean') {
      data[field.key] =
        typeof raw === 'boolean' ? raw : ['true', '1', 'yes', 'on'].includes(String(raw).trim().toLowerCase());
    } else {
      data[field.key] = String(raw).trim();
    }
  }

  if (missing.length > 0) {
    const labels = missing.map((key) => spec.fields.find((f) => f.key === key)?.label ?? key);
    return { ok: false, error: `Missing required field(s): ${labels.join(', ')}`, missing };
  }
  return { ok: true, data };
}
