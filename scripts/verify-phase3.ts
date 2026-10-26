/**
 * Full Phase 3 verification (n8n REST API integration).
 * Requires:
 *  - the API server running (npm run dev)
 *  - a local n8n instance running (npx n8n)
 *  - N8N_API_URL + N8N_API_KEY set in .env (see docs/PHASE3.md)
 *
 * Usage: npm run verify:phase3
 *
 * It runs a real end-to-end flow against n8n:
 *  create -> update -> activate -> execute (webhook) -> view execution -> deactivate -> delete
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

function buildTestWorkflow() {
  const suffix = Date.now();
  return {
    name: `AIES Phase 3 Test ${suffix}`,
    nodes: [
      {
        parameters: {
          httpMethod: 'POST',
          path: `aies-phase3-${suffix}`,
          responseMode: 'lastNode',
          options: {},
        },
        id: 'aies-webhook-1',
        name: 'Webhook',
        type: 'n8n-nodes-base.webhook',
        typeVersion: 2,
        position: [0, 0],
      },
      {
        parameters: {
          mode: 'manual',
          assignments: {
            assignments: [
              { id: 'a1', name: 'message', value: 'AIES Phase 3 test ok', type: 'string' },
              { id: 'a2', name: 'receivedEmail', value: '={{ $json.body.email }}', type: 'string' },
            ],
          },
          options: {},
        },
        id: 'aies-set-1',
        name: 'Set Data',
        type: 'n8n-nodes-base.set',
        typeVersion: 3.4,
        position: [220, 0],
      },
    ],
    connections: {
      Webhook: { main: [[{ node: 'Set Data', type: 'main', index: 0 }]] },
    },
  };
}

async function main() {
  console.log('\n=== PHASE 3 VERIFICATION (n8n integration) ===\n');

  // 0) API server up
  try {
    const r = await fetch(`${BASE}/api/health`).then((x) => x.json());
    record(r?.status === 'ok', '0. API server + DB', JSON.stringify(r));
  } catch {
    record(false, '0. API server + DB', 'server not reachable — run `npm run dev`');
    process.exit(1);
  }

  // 1) Auth
  const email = `verify3_${Date.now()}@test.com`;
  const reg = await req('POST', '/api/auth/register', { email, password: '123456' });
  record(reg.status === 201 && !!reg.body?.token, '1. Register returns token', `status ${reg.status}`);
  const token = reg.body?.token as string;

  // 2) Auth guard
  const noToken = await req('GET', '/api/n8n/workflows');
  record(noToken.status === 401, '2. No token blocked (401)', `status ${noToken.status}`);

  // 3) n8n configured + reachable
  const status = await req('GET', '/api/n8n/status', undefined, token);
  const configured = status.body?.configured === true;
  const reachable = status.body?.reachable === true;
  record(configured && reachable, '3. n8n configured & reachable', JSON.stringify(status.body));
  if (!configured || !reachable) {
    console.log('\n' + (configured
      ? '  n8n is configured but NOT reachable. Start n8n (npx n8n) and make sure N8N_API_URL is correct.'
      : '  n8n is NOT configured. Set N8N_API_URL + N8N_API_KEY in .env — see docs/PHASE3.md.'));
    console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===\n`);
    process.exit(1);
  }

  // 4-6) Create -> activate -> execute
  let workflowId: string | undefined;
  let executionId: string | undefined;
  try {
    const created = await req('POST', '/api/n8n/workflows', buildTestWorkflow(), token);
    workflowId = created.body?.id;
    record(
      created.status === 201 && !!workflowId,
      '4. Create workflow in n8n',
      `${created.status} id=${workflowId}`
    );
    if (!workflowId) throw new Error('no workflow id, cannot continue');

    // 4b) Update (CRUD: U) — rename the workflow
    const updated = await req(
      'PUT',
      `/api/n8n/workflows/${workflowId}`,
      { name: `AIES Phase 3 Test ${Date.now()} (updated)` },
      token
    );
    record(
      updated.status === 200 && String(updated.body?.name ?? '').includes('(updated)'),
      '4b. Update workflow (rename)',
      `status ${updated.status} name=${updated.body?.name}`
    );

    const activated = await req('PATCH', `/api/n8n/workflows/${workflowId}/activate`, undefined, token);
    record(
      activated.status === 200 && activated.body?.active === true,
      '5. Activate workflow',
      `status ${activated.status}`
    );

    const executed = await req(
      'POST',
      `/api/n8n/workflows/${workflowId}/execute`,
      { payload: { email: 'verify@aies.dev' } },
      token
    );
    const out = JSON.stringify(executed.body?.data ?? {});
    const ranOk =
      executed.status === 200 &&
      out.includes('AIES Phase 3 test ok') &&
      out.includes('verify@aies.dev');
    record(ranOk, '6. Execute workflow (webhook)', `status ${executed.status}`);
    if (executed.status === 200) console.log(`      → data: ${out.slice(0, 160)}`);

    // 7) Execution appears in n8n history
    for (let i = 0; i < 10 && !executionId; i++) {
      await sleep(1000);
      const list = await req('GET', `/api/n8n/executions?workflowId=${workflowId}&limit=5`, undefined, token);
      if (list.status === 200 && Array.isArray(list.body?.data) && list.body.data.length > 0) {
        executionId = list.body.data[0].id;
      }
    }
    record(!!executionId, '7. Execution listed for the workflow', executionId ? `id=${executionId}` : 'not found');

    // 8) View execution result
    if (executionId) {
      const exec = await req('GET', `/api/n8n/executions/${executionId}`, undefined, token);
      record(
        exec.status === 200 && exec.body?.status === 'success',
        '8. View execution result (success)',
        `status ${exec.body?.status}`
      );
    }

    // 9) Deactivate
    const deactivated = await req('PATCH', `/api/n8n/workflows/${workflowId}/deactivate`, undefined, token);
    record(
      deactivated.status === 200 && deactivated.body?.active === false,
      '9. Deactivate workflow',
      `status ${deactivated.status}`
    );

    // 10) Execute while inactive must be refused
    const inactive = await req(
      'POST',
      `/api/n8n/workflows/${workflowId}/execute`,
      { payload: {} },
      token
    );
    record(inactive.status === 409, '10. Execute inactive workflow refused (409)', `status ${inactive.status}`);

    // 11) Delete
    const deleted = await req('DELETE', `/api/n8n/workflows/${workflowId}`, undefined, token);
    record(deleted.status === 200 && deleted.body?.deleted === true, '11. Delete workflow', `status ${deleted.status}`);

    // 12) Deleted workflow is gone
    const gone = await req('GET', `/api/n8n/workflows/${workflowId}`, undefined, token);
    record(gone.status === 404, '12. Deleted workflow returns 404', `status ${gone.status}`);
    workflowId = undefined;
  } finally {
    if (workflowId) {
      console.log('  (cleanup) removing leftover test workflow…');
      await req('PATCH', `/api/n8n/workflows/${workflowId}/deactivate`, undefined, token).catch(() => {});
      await req('DELETE', `/api/n8n/workflows/${workflowId}`, undefined, token).catch(() => {});
    }
  }

  console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('Verification error:', e);
  process.exit(1);
});
