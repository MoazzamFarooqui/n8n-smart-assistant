/**
 * Credential management verification.
 * Requires:
 *  - the API server running (npm run dev)
 *  - a local n8n instance running (n8n)
 *  - GEMINI_API_KEY + N8N_API_KEY set in .env
 *  - migration 003 applied (npm run db:migrate)
 *
 * Usage: npm run verify:credentials
 *
 * Covers: specs endpoint, unit checks for detection/injection/skip, create +
 * update + delete of a real n8n credential (fake token), metadata-only
 * responses, live 409 gate for a missing app, and 422 when the app is skipped.
 */

import {
  detectRequiredCredentials,
  injectCredentials,
  missingCredentials,
  splitSkipApps,
} from '../src/services/credentials.js';

const BASE = process.env.BASE_URL || 'http://localhost:3001';

const FAKE_TELEGRAM_TOKEN = '123456789:AAFakeTokenForVerificationOnly';
const FAKE_TELEGRAM_TOKEN_2 = '987654321:AAFakeTokenUpdatedForVerification';

const CRED_PROMPT =
  'Send a Telegram message with the text "hello" to chat 12345 when a webhook receives a request';

async function generateWithRetry(
  token: string,
  prompt: string,
  extra: Record<string, unknown> = {},
  attempts = 3
) {
  let res = await req('POST', '/api/workflows/generate-and-deploy', { prompt, ...extra }, token);
  for (let i = 1; i < attempts && (res.status === 502 || res.status === 504); i++) {
    console.log(`  (transient ${res.status} from Gemini — retry ${i}/${attempts - 1} in 20s)…`);
    await sleep(20000);
    res = await req('POST', '/api/workflows/generate-and-deploy', { prompt, ...extra }, token);
  }
  return res;
}

let passed = 0;
let failed = 0;

function record(ok: boolean, label: string, detail = '') {
  if (ok) passed++; else failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`);
}

async function req(method: string, path: string, body?: unknown, token?: string) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  let json: any = null;
  try { json = await res.json(); } catch { /* ignore */ }
  return { status: res.status, body: json };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log('\n=== CREDENTIAL MANAGEMENT VERIFICATION ===\n');

  // 0) API server up
  try {
    const r = await fetch(`${BASE}/api/health`).then((x) => x.json());
    record(r?.status === 'ok', '0. API server + DB', JSON.stringify(r));
  } catch {
    record(false, '0. API server + DB', 'server not reachable — run `npm run dev`');
    process.exit(1);
  }

  // 1) Register user
  const email = `verifycred_${Date.now()}@test.com`;
  const reg = await req('POST', '/api/auth/register', { email, password: '123456' });
  const token = reg.body?.token as string;
  record(reg.status === 201 && !!token, '1. Register returns token', `status ${reg.status}`);
  if (!token) process.exit(1);

  // 2) Auth guard
  const noToken = await req('GET', '/api/credentials');
  record(noToken.status === 401, '2. No token blocked (401)', `status ${noToken.status}`);

  // 3) Specs endpoint
  const types = await req('GET', '/api/credentials/types', undefined, token);
  const specs: any[] = types.body?.data ?? [];
  const telegramSpec = specs.find((s) => s.app === 'telegram');
  const instagramSpec = specs.find((s) => s.app === 'instagram');
  record(
    types.status === 200 &&
      !!telegramSpec &&
      telegramSpec.fields.some((f: any) => f.key === 'accessToken') &&
      instagramSpec?.creatable === false &&
      typeof instagramSpec?.hint === 'string',
    '3. Specs expose fields + manual OAuth apps',
    `apps=${specs.map((s) => s.app).join(',')}`
  );

  // 4) Unit: detection maps node types to unique apps
  const sampleNodes: any[] = [
    { name: 'Telegram', type: 'n8n-nodes-base.telegram' },
    { name: 'Set', type: 'n8n-nodes-base.set' },
    { name: 'Telegram 2', type: 'n8n-nodes-base.telegram' },
  ];
  const required = detectRequiredCredentials(sampleNodes);
  record(
    required.length === 1 && required[0].app === 'telegram',
    '4. Detection maps node types → unique apps',
    `apps=${required.map((s) => s.app).join(',')}`
  );

  // 5) Unit: injection replaces AI placeholders with the linked credential
  const injectNodes: any[] = [
    {
      name: 'Telegram',
      type: 'n8n-nodes-base.telegram',
      credentials: { telegramApi: { id: 'YOUR_CREDENTIAL_ID', name: 'placeholder' } },
    },
    { name: 'Set', type: 'n8n-nodes-base.set' },
  ];
  const linkedMap = new Map<string, any>([
    ['telegram', { app: 'telegram', n8n_credential_id: 'cred-123', credential_name: 'My Telegram' }],
  ]);
  injectCredentials(injectNodes, linkedMap);
  record(
    injectNodes[0].credentials?.telegramApi?.id === 'cred-123' &&
      injectNodes[0].credentials?.telegramApi?.name === 'My Telegram' &&
      !injectNodes[1].credentials,
    '5. Injection swaps placeholders for real credential ids',
    `injected=${injectNodes[0].credentials?.telegramApi?.id}`
  );

  // 6) Unit: skipApps parsing + missing detection
  const skip = splitSkipApps(['telegram', ' MyApp ', 'telegram']);
  const missing = missingCredentials(required, []);
  record(
    skip.valid.length === 1 &&
      skip.valid[0] === 'telegram' &&
      skip.unknown.length === 1 &&
      skip.unknown[0] === 'myapp' &&
      missing.some((s) => s.app === 'telegram'),
    '6. skipApps parsing + missing detection',
    `valid=${skip.valid.join(',')} unknown=${skip.unknown.join(',')}`
  );

  // 7) Fresh user has no credentials
  const empty = await req('GET', '/api/credentials', undefined, token);
  record(
    empty.status === 200 && Array.isArray(empty.body?.data) && empty.body.data.length === 0,
    '7. Fresh user has no linked credentials',
    `count=${empty.body?.data?.length}`
  );

  // 8) Validation: required field missing
  const bad = await req('POST', '/api/credentials', { app: 'telegram' }, token);
  record(
    bad.status === 400 && /Missing required/i.test(String(bad.body?.error)),
    '8. Missing token rejected (400)',
    `status=${bad.status} error=${bad.body?.error ?? ''}`
  );

  // 9) Manual OAuth app cannot be created from here
  const manual = await req('POST', '/api/credentials', { app: 'instagram' }, token);
  record(
    manual.status === 400 && manual.body?.manual === true && typeof manual.body?.hint === 'string',
    '9. Manual OAuth app rejected with hint',
    `status=${manual.status}`
  );

  // 10) Create a real n8n credential with a fake token
  const created = await req(
    'POST',
    '/api/credentials',
    { app: 'telegram', name: 'Verify Telegram', data: { accessToken: FAKE_TELEGRAM_TOKEN } },
    token
  );
  const createdId = created.body?.n8nCredentialId as string;
  record(
    created.status === 201 &&
      !!createdId &&
      created.body?.managed === true &&
      !JSON.stringify(created.body).includes(FAKE_TELEGRAM_TOKEN),
    '10. Create stores link, response never leaks the secret',
    `status=${created.status} n8nCredentialId=${createdId}`
  );

  // 11) List returns safe metadata only
  const list = await req('GET', '/api/credentials', undefined, token);
  const listItem = list.body?.data?.[0];
  record(
    list.status === 200 &&
      list.body?.data?.length === 1 &&
      listItem?.app === 'telegram' &&
      listItem?.n8nCredentialId === createdId &&
      !JSON.stringify(list.body).includes(FAKE_TELEGRAM_TOKEN),
    '11. List returns metadata only',
    `count=${list.body?.data?.length} app=${listItem?.app}`
  );

  // 12) The credential really exists in n8n
  const available = await req('GET', '/api/credentials/available?type=telegramApi', undefined, token);
  record(
    available.status === 200 &&
      Array.isArray(available.body?.data) &&
      available.body.data.some((c: any) => c.id === createdId),
    '12. Credential exists in n8n (available list)',
    `status=${available.status} found=${(available.body?.data ?? []).some((c: any) => c.id === createdId)}`
  );

  // 13) Re-POST updates the same n8n credential in place
  const updated = await req(
    'POST',
    '/api/credentials',
    { app: 'telegram', name: 'Verify Telegram v2', data: { accessToken: FAKE_TELEGRAM_TOKEN_2 } },
    token
  );
  record(
    updated.status === 200 &&
      updated.body?.n8nCredentialId === createdId &&
      updated.body?.credentialName === 'Verify Telegram v2',
    '13. Re-POST updates the same n8n credential in place',
    `status=${updated.status} sameId=${updated.body?.n8nCredentialId === createdId}`
  );

  // 14) Live gate: a user without credentials cannot deploy an app workflow
  const emailB = `verifycred_b_${Date.now()}@test.com`;
  const regB = await req('POST', '/api/auth/register', { email: emailB, password: '123456' });
  const tokenB = regB.body?.token as string;
  console.log('\n  [gate] generating a Telegram workflow for a user without credentials… (can take up to a minute)');
  const gate = await generateWithRetry(tokenB, CRED_PROMPT);
  const needs: any[] = Array.isArray(gate.body?.needsCredentials) ? gate.body.needsCredentials : [];
  record(
    gate.status === 409 &&
      gate.body?.stage === 'credentials' &&
      needs.some((n) => n.app === 'telegram') &&
      Array.isArray(gate.body?.workflowPreview?.nodes) &&
      gate.body.workflowPreview.nodes.length > 0,
    '14. Pipeline blocks an app without credentials (409 + preview)',
    `status=${gate.status} apps=${needs.map((n) => n.app).join(',') || 'none'}`
  );

  // pacing for free-tier Gemini limits
  console.log('\n  [pacing] waiting 3s before the skip test…');
  await sleep(3000);

  // 15) Skipping the required app blocks deployment too
  const skipped = await generateWithRetry(tokenB, CRED_PROMPT, { skipApps: ['telegram'] });
  record(
    skipped.status === 422 &&
      Array.isArray(skipped.body?.skippedApps) &&
      skipped.body.skippedApps.includes('telegram'),
    '15. Skipped app is not run (422 SKIPPED_APP_USED)',
    `status=${skipped.status} skipped=${(skipped.body?.skippedApps ?? []).join(',')}`
  );

  // 16) Delete removes both the link and the n8n credential
  const del = await req('DELETE', '/api/credentials/telegram', undefined, token);
  record(
    del.status === 200 && del.body?.deleted === true && del.body?.n8nDeleted === true,
    '16. DELETE removes DB link + n8n credential',
    `status=${del.status} n8nDeleted=${del.body?.n8nDeleted}`
  );

  // 17) Gone from both stores
  const listAfter = await req('GET', '/api/credentials', undefined, token);
  const availableAfter = await req('GET', '/api/credentials/available', undefined, token);
  const stillThere = (availableAfter.body?.data ?? []).some((c: any) => c.id === createdId);
  record(
    listAfter.status === 200 && listAfter.body?.data?.length === 0 && !stillThere,
    '17. Credential is gone from both stores',
    `dbCount=${listAfter.body?.data?.length} n8nFound=${stillThere}`
  );

  // 18) Deleting again → 404
  const delAgain = await req('DELETE', '/api/credentials/telegram', undefined, token);
  record(delAgain.status === 404, '18. Second delete returns 404', `status ${delAgain.status}`);

  console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('Verification error:', e);
  process.exit(1);
});
