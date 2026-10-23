/**
 * Full Phase 5 verification (Workflow Management CRUD).
 * Requires:
 *  - the API server running (npm run dev)
 *  - a local n8n instance running (n8n)
 *  - GEMINI_API_KEY + N8N_API_KEY set in .env
 *  - migrations applied (npm run db:migrate)
 *
 * Usage: npm run verify:phase5
 *
 * It generates two real workflows through the Phase 4 pipeline (one succeeds,
 * one needs Telegram credentials: 409 → link fake credential → deploys and
 * fails), then exercises the Phase 5 management API: listing + pagination,
 * detail with execution history, ownership isolation, re-execution,
 * activate/deactivate and delete from n8n + database.
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
  'Create a simple workflow: start with a Webhook trigger (POST), then a Set node that assigns a string field "message" with the value "hello from phase 5". Connect the Webhook trigger to the Set node. Return only JSON.';

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
  console.log('\n=== PHASE 5 VERIFICATION (workflow management CRUD) ===\n');

  // 0) API server up
  try {
    const r = await fetch(`${BASE}/api/health`).then((x) => x.json());
    record(r?.status === 'ok', '0. API server + DB', JSON.stringify(r));
  } catch {
    record(false, '0. API server + DB', 'server not reachable — run `npm run dev`');
    process.exit(1);
  }

  // 1) Register user A
  const emailA = `verify5a_${Date.now()}@test.com`;
  const regA = await req('POST', '/api/auth/register', { email: emailA, password: '123456' });
  const token = regA.body?.token as string;
  record(regA.status === 201 && !!token, '1. Register returns token', `status ${regA.status}`);
  if (!token) process.exit(1);

  // 2) Auth guard
  const noToken = await req('GET', '/api/workflows');
  record(noToken.status === 401, '2. No token blocked (401)', `status ${noToken.status}`);

  // 3) Query validation
  const badQuery = await req('GET', '/api/workflows?page=0&limit=999', undefined, token);
  record(badQuery.status === 400, '3. Invalid pagination rejected (400)', `status ${badQuery.status}`);

  // 4) Fresh user has an empty page
  const empty = await req('GET', '/api/workflows', undefined, token);
  record(
    empty.status === 200 && Array.isArray(empty.body?.data) && empty.body?.pagination?.total === 0,
    '4. Fresh user has an empty page',
    `total=${empty.body?.pagination?.total}`
  );

  // 5) Deploy a workflow through the Phase 4 pipeline
  console.log('\n  [setup] generating + deploying a credential-free workflow… (can take up to a minute)');
  const gen = await generateWithRetry(token, SUCCESS_PROMPT);
  const genBody = gen.body ?? {};
  const wfId = genBody.workflowId as number;
  const n8nId = genBody.n8nWorkflowId as string;

  record(
    gen.status === 200 && genBody.status === 'success' && typeof wfId === 'number' && !!n8nId,
    '5. Pipeline deployed a runnable workflow',
    `status ${gen.status} workflowId=${wfId} n8nWorkflowId=${n8nId}`
  );
  if (!wfId || !n8nId) {
    console.log('\n  cannot continue without a deployed workflow.');
    console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===\n`);
    process.exit(1);
  }

  // 6) Listing with execution counters
  const list = await req('GET', '/api/workflows?page=1&limit=10', undefined, token);
  const listItem = (list.body?.data ?? []).find((w: any) => w.id === wfId);
  record(
    list.status === 200 &&
      list.body?.pagination?.total >= 1 &&
      !!listItem &&
      listItem.is_active === true &&
      !!listItem.n8nWorkflowUrl &&
      listItem.execution_count >= 1 &&
      !!listItem.last_execution_status,
    '6. List shows the workflow with execution counters',
    `total=${list.body?.pagination?.total} executionCount=${listItem?.execution_count} lastExecution=${listItem?.last_execution_status}`
  );

  // 7) Detail view: definition + live n8n JSON + execution stats
  const detail = await req('GET', `/api/workflows/${wfId}`, undefined, token);
  const dWf = detail.body?.workflow ?? {};
  const dStats = detail.body?.executionStats ?? {};
  const dExecs: any[] = detail.body?.executions ?? [];
  record(
    detail.status === 200 &&
      Array.isArray(dWf.definition?.nodes) &&
      dWf.definition.nodes.length >= 2 &&
      dWf.prompt === SUCCESS_PROMPT &&
      dStats.total >= 1 &&
      dExecs.length >= 1 &&
      dExecs[0]?.status === 'completed' &&
      detail.body?.n8n?.available === true &&
      detail.body?.n8n?.active === true,
    '7. Detail returns definition + n8n JSON + execution history',
    `nodes=${dWf.definition?.nodes?.length} executions=${dStats.total} n8nActive=${detail.body?.n8n?.active}`
  );

  // 8) Paginated execution history
  const hist = await req('GET', `/api/workflows/${wfId}/executions?page=1&limit=1`, undefined, token);
  record(
    hist.status === 200 &&
      Array.isArray(hist.body?.data) &&
      hist.body.data.length === 1 &&
      hist.body?.pagination?.total >= 1 &&
      hist.body?.pagination?.limit === 1,
    '8. Execution history is paginated',
    `total=${hist.body?.pagination?.total} pageSize=${hist.body?.data?.length}`
  );

  // 9) Ownership isolation
  const emailB = `verify5b_${Date.now()}@test.com`;
  const regB = await req('POST', '/api/auth/register', { email: emailB, password: '123456' });
  const tokenB = regB.body?.token as string;
  const foreign = await req('GET', `/api/workflows/${wfId}`, undefined, tokenB);
  const foreignList = await req('GET', '/api/workflows', undefined, tokenB);
  record(
    foreign.status === 404 && foreignList.body?.pagination?.total === 0,
    '9. Other users cannot see the workflow (404 + empty list)',
    `detailStatus=${foreign.status} otherUserTotal=${foreignList.body?.pagination?.total}`
  );

  // 10) Deactivate updates DB + n8n
  const deact = await req('PATCH', `/api/workflows/${wfId}/deactivate`, undefined, token);
  await sleep(1000);
  const afterDeact = await req('GET', `/api/workflows/${wfId}`, undefined, token);
  const inactiveList = await req('GET', '/api/workflows?status=inactive', undefined, token);
  record(
    deact.status === 200 &&
      deact.body?.is_active === false &&
      afterDeact.body?.workflow?.is_active === false &&
      afterDeact.body?.n8n?.active === false &&
      inactiveList.body?.pagination?.total >= 1,
    '10. Deactivate updates DB + n8n',
    `dbActive=${afterDeact.body?.workflow?.is_active} n8nActive=${afterDeact.body?.n8n?.active}`
  );

  // 11) Re-execute while inactive → auto-activates and succeeds
  console.log('\n  [re-execute] running the deployed workflow again…');
  const beforeHist = await req('GET', `/api/workflows/${wfId}/executions?limit=1`, undefined, token);
  const beforeTotal = beforeHist.body?.pagination?.total ?? 0;

  const rerun = await req('POST', `/api/workflows/${wfId}/execute`, { payload: { source: 'verify5' } }, token);
  const rerunOut = JSON.stringify(rerun.body?.execution?.output ?? {});
  record(
    rerun.status === 200 && rerun.body?.status === 'success' && rerunOut.includes('hello from phase 5'),
    '11. Re-execute auto-activates and returns output',
    `status ${rerun.body?.status} output=${rerunOut.slice(0, 100)}`
  );

  const afterRerun = await req('GET', `/api/workflows/${wfId}`, undefined, token);
  record(
    afterRerun.body?.workflow?.is_active === true && afterRerun.body?.n8n?.active === true,
    '12. Workflow is active again after re-execution',
    `dbActive=${afterRerun.body?.workflow?.is_active} n8nActive=${afterRerun.body?.n8n?.active}`
  );

  // 13) Re-execution recorded a new execution row
  const afterHist = await req('GET', `/api/workflows/${wfId}/executions?limit=1`, undefined, token);
  const afterTotal = afterHist.body?.pagination?.total ?? 0;
  record(
    afterTotal === beforeTotal + 1 && afterHist.body?.data?.[0]?.status === 'completed' && !!afterHist.body?.data?.[0]?.n8n_execution_id,
    '13. New execution recorded (count +1, n8n id linked)',
    `before=${beforeTotal} after=${afterTotal} n8nExecutionId=${afterHist.body?.data?.[0]?.n8n_execution_id}`
  );

  // 14) Activate endpoints toggles DB flag
  const deact2 = await req('PATCH', `/api/workflows/${wfId}/deactivate`, undefined, token);
  const act2 = await req('PATCH', `/api/workflows/${wfId}/activate`, undefined, token);
  record(
    deact2.status === 200 && deact2.body?.is_active === false && act2.status === 200 && act2.body?.is_active === true,
    '14. Activate/deactivate endpoints toggle the DB flag',
    `deactivate=${deact2.body?.is_active} activate=${act2.body?.is_active}`
  );

  // pacing for free-tier Gemini limits
  console.log('\n  [pacing] waiting 3s before the credentials test…');
  await sleep(3000);

  // 15) Missing credentials are blocked before deploy
  console.log('\n  [credentials gate] Telegram prompt without credentials → should be blocked (409)…');
  const blocked = await generateWithRetry(token, ERROR_PROMPT);
  const blockedNeeds: any[] = Array.isArray(blocked.body?.needsCredentials)
    ? blocked.body.needsCredentials
    : [];
  record(
    blocked.status === 409 &&
      blocked.body?.stage === 'credentials' &&
      blockedNeeds.some((n) => n.app === 'telegram'),
    '15. Missing credentials blocked with 409 + needsCredentials',
    `status=${blocked.status} apps=${blockedNeeds.map((n) => n.app).join(',') || 'none'}`
  );

  // 16) Link a fake Telegram credential
  const addCred = await req(
    'POST',
    '/api/credentials',
    { app: 'telegram', name: 'Phase 5 fake Telegram', data: { accessToken: FAKE_TELEGRAM_TOKEN } },
    token
  );
  record(
    addCred.status === 200 || addCred.status === 201,
    '16. Fake Telegram credential linked',
    `status=${addCred.status} n8nCredentialId=${addCred.body?.n8nCredentialId}`
  );

  // pacing for free-tier Gemini limits
  console.log('\n  [pacing] waiting 3s before the retry…');
  await sleep(3000);

  // 17) Retry with credentials → workflow deploys (execution fails with fake token)
  console.log('\n  [error path] retry with injected credentials → workflow deploys, execution fails…');
  const genErr = await generateWithRetry(token, ERROR_PROMPT);
  const errWfId = genErr.body?.workflowId as number;
  const errN8nId = genErr.body?.n8nWorkflowId as string;

  if (!errWfId || !errN8nId) {
    record(false, '17. Error workflow deployed for testing', `status ${genErr.status} pipeline=${genErr.body?.status}`);
    record(false, '18. Failing re-execution returns AI error analysis', 'skipped — no error workflow');
    record(false, '19. Error execution stored with analysis', 'skipped — no error workflow');
  } else {
    record(
      true,
      '17. Error workflow deployed for testing',
      `workflowId=${errWfId} pipeline=${genErr.body?.status}`
    );

    // pacing for free-tier Gemini limits (deploy failure already used one analysis call)
    await sleep(3000);

    const errRun = await req('POST', `/api/workflows/${errWfId}/execute`, {}, token);
    const errExec = errRun.body?.execution ?? {};
    const analysis = String(errExec.errorAnalysis ?? '');
    record(
      errRun.status === 200 && errRun.body?.status === 'failed' && analysis.length > 20 && !!errExec.error,
      '18. Failing re-execution returns AI error analysis',
      analysis.slice(0, 120).replace(/\n/g, ' ') || `status=${errRun.body?.status}`
    );

    const errHist = await req('GET', `/api/workflows/${errWfId}/executions?limit=1`, undefined, token);
    const latest = errHist.body?.data?.[0];
    record(
      errHist.status === 200 &&
        latest?.status === 'failed' &&
        typeof latest?.error_analysis === 'string' &&
        latest.error_analysis.length > 20,
      '19. Error execution stored with analysis',
      `status=${latest?.status} analysis=${String(latest?.error_analysis ?? '').slice(0, 80).replace(/\n/g, ' ')}`
    );
  }

  // 20) Pagination splits pages correctly
  const page1 = await req('GET', '/api/workflows?page=1&limit=1', undefined, token);
  const page2 = await req('GET', '/api/workflows?page=2&limit=1', undefined, token);
  const p1 = page1.body?.pagination ?? {};
  const idsDiffer = page1.body?.data?.[0]?.id !== page2.body?.data?.[0]?.id;
  record(
    p1.total >= 2 && page1.body?.data?.length === 1 && page2.body?.data?.length === 1 && idsDiffer && p1.hasNext === true,
    '20. Pagination splits pages correctly',
    `total=${p1.total} page1HasNext=${p1.hasNext} differentItems=${idsDiffer}`
  );

  // 21) Delete removes from n8n + DB
  const del = await req('DELETE', `/api/workflows/${wfId}`, undefined, token);
  const goneDb = await req('GET', `/api/workflows/${wfId}`, undefined, token);
  const goneN8n = await req('GET', `/api/n8n/workflows/${n8nId}`, undefined, token);
  record(
    del.status === 200 && del.body?.deleted === true && del.body?.n8nDeleted === true && goneDb.status === 404 && goneN8n.status === 404,
    '21. Delete removes the workflow from n8n + DB',
    `delete=${del.status} dbAfter=${goneDb.status} n8nAfter=${goneN8n.status}`
  );

  // 22) Deleting again → 404
  const delAgain = await req('DELETE', `/api/workflows/${wfId}`, undefined, token);
  record(delAgain.status === 404, '22. Second delete returns 404', `status ${delAgain.status}`);

  // cleanup: remove the error-path test workflow + credential (success one already deleted)
  console.log('\n  (cleanup) removing the remaining test workflow + credential…');
  const cleanupTargets: number[] = errWfId ? [errWfId] : [];
  let cleaned = 0;
  for (const id of cleanupTargets) {
    const d = await req('DELETE', `/api/workflows/${id}`, undefined, token).catch(() => ({ status: 0 }));
    if (d.status === 200) cleaned++;
    else console.log(`  WARN: could not delete workflow ${id} (status ${d.status}) — remove it manually`);
  }
  console.log(`  cleaned ${cleaned}/${cleanupTargets.length} workflow(s)`);

  const credDel = await req('DELETE', '/api/credentials/telegram', undefined, token);
  console.log(`  removed test credential: ${credDel.status === 200 ? 'yes' : `no (status ${credDel.status})`}`);

  console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('Verification error:', e);
  process.exit(1);
});
