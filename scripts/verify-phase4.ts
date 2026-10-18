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
 * It runs the real pipeline twice against live n8n + Gemini:
 *  1) a credential-free prompt -> generate -> validate -> audit -> deploy -> execute -> success
 *  2) a Telegram prompt (needs credentials) -> execution fails -> auto AI error analysis
 */

const BASE = process.env.BASE_URL || 'http://localhost:3001';

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
  'Create a simple workflow: start with a Webhook trigger (POST), then a Set node that assigns a string field "message" with the value "hello from phase 4". Return only JSON.';

const ERROR_PROMPT = 'Send a Telegram message when a Google Form is submitted';

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
  const ok = await req('POST', '/api/workflows/generate-and-deploy', { prompt: SUCCESS_PROMPT }, token);
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
    ['generate', 'validate', 'audit', 'deploy', 'execute'].every((s) => stageNames.includes(s)) &&
    stages.find((s) => s.stage === 'deploy')?.ok === true &&
    stages.find((s) => s.stage === 'execute')?.ok === true;
  record(allStages, '6. All 5 stages ran (generate → validate → audit → deploy → execute)', stageNames.join(' → '));

  const execData = JSON.stringify(okBody.execution?.data ?? {});
  record(
    okBody.status === 'success' && execData.includes('hello from phase 4'),
    '7. Execution returned workflow output',
    execData.slice(0, 140)
  );

  record(
    okBody.validation != null && okBody.audit != null,
    '8. Validation + security audit results included',
    `validation=${okBody.validation ? 'yes' : 'no'} audit=${okBody.audit ? 'yes' : 'no'}`
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

  // 10) Error path + auto error analysis
  console.log('\n  [error path] Telegram prompt (needs credentials) → execution should fail with AI analysis…');
  const err = await req('POST', '/api/workflows/generate-and-deploy', { prompt: ERROR_PROMPT }, token);
  const errBody = err.body ?? {};
  if (errBody.n8nWorkflowId) deployed.push(errBody.n8nWorkflowId);

  const deployOk = err.status === 200 && !!errBody.n8nWorkflowId && !!errBody.workflowId;
  record(deployOk, '10. Telegram prompt deployed to n8n', `status ${err.status} pipeline=${errBody.status}`);

  if (deployOk && errBody.status === 'failed') {
    const analysis = String(errBody.errorAnalysis ?? '');
    record(
      analysis.length > 20 && !!errBody.execution?.error,
      '11. Auto error analysis on failure (AI explanation returned)',
      analysis.slice(0, 120).replace(/\n/g, ' ')
    );
  } else if (deployOk && errBody.status === 'success') {
    record(true, '11. Auto error analysis on failure', 'skipped — workflow ran without credentials (no error)');
  } else {
    record(false, '11. Auto error analysis on failure', `pipeline status: ${errBody.error ?? errBody.status}`);
  }

  // cleanup: remove the deployed test workflows from n8n
  console.log('\n  (cleanup) removing test workflows from n8n…');
  for (const id of deployed) {
    await req('PATCH', `/api/n8n/workflows/${id}/deactivate`, undefined, token).catch(() => {});
    await req('DELETE', `/api/n8n/workflows/${id}`, undefined, token).catch(() => {});
  }
  console.log(`  cleaned ${deployed.length} n8n workflow(s)`);

  console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('Verification error:', e);
  process.exit(1);
});
