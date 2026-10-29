import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import * as n8n from './n8n.js';
import { getUserCredential, upsertUserCredential } from '../models/UserCredential.js';
import { getCredentialSpec } from './credentials.js';

const SCOPE_CALENDAR = 'https://www.googleapis.com/auth/calendar';
const SCOPE_DRIVE = 'https://www.googleapis.com/auth/drive';
const SCOPE_DOCS = 'https://www.googleapis.com/auth/documents';

// Calendar, Drive and Docs share ONE consent screen: a single "Connect Google"
// click grants all three scopes and links all three apps (see connectGoogleAccount).
export const GOOGLE_WORKSPACE_APPS = ['googleCalendar', 'googleDrive', 'googleDocs'];
const WORKSPACE_SCOPE = [SCOPE_CALENDAR, SCOPE_DRIVE, SCOPE_DOCS].join(' ');

export const GOOGLE_OAUTH_SCOPE: Record<string, string> = {
  googleSheets: 'https://www.googleapis.com/auth/spreadsheets',
  gmail: 'https://www.googleapis.com/auth/gmail.send',
  googleCalendar: WORKSPACE_SCOPE,
  googleDrive: WORKSPACE_SCOPE,
  googleDocs: WORKSPACE_SCOPE,
};

export const GOOGLE_OAUTH_CALLBACK_PATH = '/api/credentials/oauth/google/callback';

export class OAuthError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'OAuthError';
    this.status = status;
  }
}

export function isGoogleOAuthApp(app: string): boolean {
  return Object.prototype.hasOwnProperty.call(GOOGLE_OAUTH_SCOPE, app);
}

export function isGoogleOAuthConfigured(): boolean {
  return Boolean(config.google.clientId && config.google.clientSecret);
}

export function buildGoogleConsentUrl(opts: { userId: number; app: string; origin: string }): string {
  const state = jwt.sign({ uid: opts.userId, app: opts.app }, config.jwt.secret, {
    expiresIn: '10m',
  });
  const params = new URLSearchParams({
    client_id: config.google.clientId,
    redirect_uri: `${opts.origin}${GOOGLE_OAUTH_CALLBACK_PATH}`,
    response_type: 'code',
    scope: GOOGLE_OAUTH_SCOPE[opts.app],
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export function verifyOAuthState(state: string): { uid: number; app: string } {
  try {
    const decoded = jwt.verify(state, config.jwt.secret) as { uid?: number; app?: string };
    if (!decoded || typeof decoded.uid !== 'number' || typeof decoded.app !== 'string') {
      throw new Error('bad state');
    }
    return { uid: decoded.uid, app: decoded.app };
  } catch {
    throw new OAuthError('This connect link expired. Please go back to the app and try again.', 400);
  }
}

interface GoogleTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  error?: string;
  error_description?: string;
}

async function exchangeCodeForTokens(code: string, redirectUri: string): Promise<GoogleTokenResponse> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      code,
      client_id: config.google.clientId,
      client_secret: config.google.clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  const data = (await res.json().catch(() => ({}))) as GoogleTokenResponse;
  if (!res.ok || !data.access_token) {
    throw new OAuthError(
      `Google did not grant access (${data.error || `HTTP ${res.status}`}): ${data.error_description || 'please try connecting again.'}`,
      502
    );
  }
  return data;
}

export async function connectGoogleAccount(opts: {
  userId: number;
  app: string;
  code: string;
  origin: string;
}) {
  const spec = getCredentialSpec(opts.app);
  if (!spec || !isGoogleOAuthApp(opts.app)) {
    throw new OAuthError(`"${opts.app}" does not support Google connect.`, 400);
  }

  const tokens = await exchangeCodeForTokens(opts.code, `${opts.origin}${GOOGLE_OAUTH_CALLBACK_PATH}`);

  const oauthTokenData: Record<string, unknown> = {
    token_type: tokens.token_type ?? 'Bearer',
    access_token: tokens.access_token,
  };
  if (tokens.refresh_token) oauthTokenData.refresh_token = tokens.refresh_token;
  if (tokens.expires_in) oauthTokenData.expires_in = Date.now() + Number(tokens.expires_in) * 1000;

  const data = {
    clientId: config.google.clientId,
    clientSecret: config.google.clientSecret,
    oauthTokenData,
  };

  // Workspace apps are linked together from the same tokens. The requested app
  // is linked LAST so the frontend status poll only reports "connected" once
  // every sibling credential already exists.
  const appsToLink = GOOGLE_WORKSPACE_APPS.includes(opts.app)
    ? [...GOOGLE_WORKSPACE_APPS.filter((a) => a !== opts.app), opts.app]
    : [opts.app];

  let requested: Awaited<ReturnType<typeof upsertUserCredential>> | undefined;
  for (const appName of appsToLink) {
    const appSpec = getCredentialSpec(appName);
    if (!appSpec) continue;
    const saved = await linkGoogleApp(opts.userId, appSpec, data);
    if (appName === opts.app) requested = saved;
  }
  return requested!;
}

async function linkGoogleApp(
  userId: number,
  spec: NonNullable<ReturnType<typeof getCredentialSpec>>,
  data: Record<string, unknown>
) {
  const credentialName = `AIES ${spec.label}`;
  const existing = await getUserCredential(userId, spec.app);
  let n8nCredentialId: string;
  if (existing && Boolean(existing.managed)) {
    try {
      await n8n.updateCredential(existing.n8n_credential_id, { name: credentialName, data });
      n8nCredentialId = existing.n8n_credential_id;
    } catch (error) {
      if (!(error instanceof n8n.N8nError && error.n8nStatus === 404)) throw error;
      const created = await n8n.createCredential({ name: credentialName, type: spec.type, data });
      n8nCredentialId = created.id;
    }
  } else {
    const created = await n8n.createCredential({ name: credentialName, type: spec.type, data });
    n8nCredentialId = created.id;
  }

  const saved = await upsertUserCredential({
    user_id: userId,
    app: spec.app,
    credential_type: spec.type,
    credential_name: credentialName,
    n8n_credential_id: n8nCredentialId,
    managed: true,
  });

  if (existing && Boolean(existing.managed) && existing.n8n_credential_id !== saved.n8n_credential_id) {
    await n8n.deleteCredential(existing.n8n_credential_id).catch(() => undefined);
  }

  return saved;
}
