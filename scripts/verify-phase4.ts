/**
 * Full Phase 4 verification (Automated Workflow Pipeline).
 * Requires:
 *  - the API server running (npm run dev)
 *  - a local n8n instance running (n8n)
 *  - GEMINI_API_KEY + N8N_API_KEY set in .env
 *  - migration 002 applied (npm run db:migrate)
 *
 * Usage: npm run verify:phase4
 *
 * It runs the real pipeline against live n8n + Gemini:
 *  1) a credential-free prompt -> generate -> credentials -> validate -> audit -> deploy -> execute -> success
 *  2) a Telegram prompt without credentials -> 409 + needsCredentials
 *  3) after linking a fake Telegram credential -> deploy + real execution error + AI analysis
 */

const BASE = process.env.BASE_URL || 'http://localhost:3001';

const FAKE_TELEGRAM_TOKEN = '123456789:AAFakeTokenForVerificationOnly';

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

const SUCCESS_PROMPT =
  'Create a simple workflow: start with a Webhook trigger (POST), then a Set node that assigns a string field "message" with the value "hello from phase 4". Connect the Webhook trigger to the Set node. Return only JSON.';

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

const ERROR_PROMPT =
  'Send a Telegram message with the text "hello" to chat 12345 when a webhook receives a request';

async function main() {
  console.log('\n=== PHASE 4 VERIFICATION (automated workflow pipeline) ===\n');

  // 0) API server up
  try {
    const r = await fetch(`${BASE}/api/health`).then((x) => x.json());
    record(r?.status === 'ok', '0. API server + DB', JSON.stringify(r));
  } catch {
    record(false, '0. API server + DB', 'server not reachable — run `npm run dev`');
    process.exit(1);
  }

  // 1) Auth
  const email = `verify4_${Date.now()}@test.com`;
  const reg = await req('POST', '/api/auth/register', { email, password: '123456' });
  record(reg.status === 201 && !!reg.body?.token, '1. Register returns token', `status ${reg.status}`);
  const token = reg.body?.token as string;
  if (!token) process.exit(1);

  // 2) Auth guard
  const noToken = await req('POST', '/api/workflows/generate-and-deploy', { prompt: SUCCESS_PROMPT });
  record(noToken.status === 401, '2. No token blocked (401)', `status ${noToken.status}`);

  // 3) Validation
  const badInput = await req('POST', '/api/workflows/generate-and-deploy', { prompt: 'hi' }, token);
  record(badInput.status === 400, '3. Too-short prompt rejected (400)', `status ${badInput.status}`);

  const deployed: string[] = [];

  // 4) Success path
  console.log('\n  [success path] generating + deploying a credential-free workflow… (can take up to a minute)');
  const ok = await generateWithRetry(token, SUCCESS_PROMPT);
  const okBody = ok.body ?? {};
  const stages: any[] = Array.isArray(okBody.stages) ? okBody.stages : [];
  const stageNames = stages.map((s) => s.stage);

  record(
    ok.status === 200 && okBody.status === 'success',
    '4. Pipeline returns success',
    `status ${ok.status} pipeline=${okBody.status}${okBody.error ? ' error=' + okBody.error : ''}`
  );
  if (okBody.n8nWorkflowId) deployed.push(okBody.n8nWorkflowId);

  record(
    typeof okBody.workflowId === 'number' && okBody.workflowId > 0 && !!okBody.n8nWorkflowId,
    '5. DB persistence (workflowId + n8nWorkflowId)',
    `workflowId=${okBody.workflowId} n8nWorkflowId=${okBody.n8nWorkflowId}`
  );

  const allStages =
    ['generate', 'credentials', 'validate', 'audit', 'deploy', 'execute'].every((s) => stageNames.includes(s)) &&
    stages.find((s) => s.stage === 'credentials')?.ok === true &&
    stages.find((s) => s.stage === 'deploy')?.ok === true &&
    stages.find((s) => s.stage === 'execute')?.ok === true;
  record(
    allStages,
    '6. All 6 stages ran (generate → credentials → validate → audit → deploy → execute)',
    stageNames.join(' → ')
  );

  const execData = JSON.stringify(okBody.execution?.data ?? {});
  record(
    okBody.status === 'success' && execData.includes('hello from phase 4'),
    '7. Execution returned workflow output',
    execData.slice(0, 140)
  );

  const validateStage = stages.find((s) => s.stage === 'validate');
  const auditStage = stages.find((s) => s.stage === 'audit');
  const validateReported =
    okBody.validation != null || /unavailable/i.test(String(validateStage?.error ?? ''));
  const auditReported = okBody.audit != null || /unavailable/i.test(String(auditStage?.error ?? ''));
  record(
    validateReported && auditReported,
    '8. Validation + security audit stages reported (advisory results when available)',
    `validation=${okBody.validation ? 'yes' : 'advisory'} audit=${okBody.audit ? 'yes' : 'advisory'}`
  );

  // 9) The workflow really exists in n8n and is active
  if (okBody.n8nWorkflowId) {
    const inN8n = await req('GET', `/api/n8n/workflows/${okBody.n8nWorkflowId}`, undefined, token);
    record(
      inN8n.status === 200 && inN8n.body?.active === true,
      '9. Workflow exists in n8n and is active',
      `status ${inN8n.status} active=${inN8n.body?.active}`
    );
  } else {
    record(false, '9. Workflow exists in n8n and is active', 'no n8nWorkflowId to check');
  }

  // pacing for free-tier Gemini limits
  console.log('\n  [pacing] waiting 3s before the error-path test…');
  await sleep(3000);

  // 10) Missing credentials are blocked before deploy
  console.log('\n  [credentials gate] Telegram prompt without credentials → should be blocked (409)…');
  const blocked = await generateWithRetry(token, ERROR_PROMPT);
  const blockedBody = blocked.body ?? {};
  const needs: any[] = Array.isArray(blockedBody.needsCredentials) ? blockedBody.needsCredentials : [];
  record(
    blocked.status === 409 &&
      blockedBody.stage === 'credentials' &&
      needs.some((n) => n.app === 'telegram') &&
      Array.isArray(blockedBody.workflowPreview?.nodes) &&
      blockedBody.workflowPreview.nodes.length > 0,
    '10. Missing credentials blocked with 409 + needsCredentials + preview',
    `status=${blocked.status} apps=${needs.map((n) => n.app).join(',') || 'none'}`
  );

  // 11) Link a fake Telegram credential
  const addCred = await req(
    'POST',
    '/api/credentials',
    { app: 'telegram', name: 'Phase 4 fake Telegram', data: { accessToken: FAKE_TELEGRAM_TOKEN } },
    token
  );
  record(
    (addCred.status === 200 || addCred.status === 201) && !!addCred.body?.n8nCredentialId,
    '11. Fake Telegram credential linked',
    `status=${addCred.status} n8nCredentialId=${addCred.body?.n8nCredentialId}`
  );

  // pacing for free-tier Gemini limits
  console.log('\n  [pacing] waiting 3s before the retry…');
  await sleep(3000);

  // 12) Retry: credentials are injected and the real execution error is analyzed
  console.log('\n  [error path] retry with injected credentials → execution should fail with AI analysis…');
  const err = await generateWithRetry(token, ERROR_PROMPT);
  const errBody = err.body ?? {};
  if (errBody.n8nWorkflowId) deployed.push(errBody.n8nWorkflowId);

  const deployOk = err.status === 200 && !!errBody.n8nWorkflowId && !!errBody.workflowId;
  const analysis = String(errBody.errorAnalysis ?? '');
  const execError = String(errBody.execution?.error ?? '');
  record(
    deployOk &&
      errBody.status === 'failed' &&
      analysis.length > 20 &&
      execError.length > 0 &&
      !/does not exist for type/i.test(execError),
    '12. Injected credential → real execution error + AI analysis',
    deployOk
      ? `pipeline=${errBody.status} analysis=${analysis.slice(0, 90).replace(/\n/g, ' ')}`
      : `status=${err.status} pipeline=${errBody.status} error=${errBody.error ?? ''}`
  );

  // cleanup: remove the deployed test workflows from n8n + the test credential
  console.log('\n  (cleanup) removing test workflows + credential…');
  let cleaned = 0;
  for (const id of deployed) {
    await req('PATCH', `/api/n8n/workflows/${id}/deactivate`, undefined, token).catch(() => {});
    const del = await req('DELETE', `/api/n8n/workflows/${id}`, undefined, token).catch(
      () => ({ status: 0 })
    );
    if (del.status === 200) cleaned++;
    else console.log(`  WARN: could not delete ${id} (status ${del.status}) — remove it manually in n8n`);
  }
  console.log(`  cleaned ${cleaned}/${deployed.length} n8n workflow(s)`);

  const credDel = await req('DELETE', '/api/credentials/telegram', undefined, token);
  console.log(`  removed test credential: ${credDel.status === 200 ? 'yes' : `no (status ${credDel.status})`}`);

  console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('Verification error:', e);
  process.exit(1);
});
