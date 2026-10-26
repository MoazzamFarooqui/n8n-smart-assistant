/**
 * Full Phase 2 verification.
 * Requires the API server to be running (npm run dev).
 * Usage: npm run verify:phase2
 *
 * It checks:
 *  1. Server + DB         (health)
 *  2. Auth                (register, login, protected /me)
 *  3. All 8 AI endpoints  (prints a snippet of each AI answer)
 *  4. Validation          (bad input must return 400)
 *  5. Auth guard          (no token must return 401)
 */

const BASE = process.env.BASE_URL || 'http://localhost:3001';

let passed = 0;
let failed = 0;

function record(ok: boolean, label: string, detail = '') {
  if (ok) passed++; else failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`);
}

async function post(path: string, body: unknown, token?: string) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  let json: any = null;
  try { json = await res.json(); } catch { /* ignore */ }
  return { status: res.status, body: json };
}

function snippet(s: string, n = 110) {
  const oneLine = s.replace(/\s+/g, ' ').trim();
  return oneLine.length > n ? oneLine.slice(0, n) + '…' : oneLine;
}

async function main() {
  console.log('\n=== PHASE 2 VERIFICATION ===\n');

  // 1) Health
  try {
    const r = await fetch(`${BASE}/api/health`).then((x) => x.json());
    record(r?.status === 'ok', '1. Health / DB connected', JSON.stringify(r));
  } catch {
    record(false, '1. Health / DB connected', 'server not reachable — run `npm run dev`');
    process.exit(1);
  }

  // 2) Auth
  const email = `verify_${Date.now()}@test.com`;
  const reg = await post('/api/auth/register', { email, password: '123456' });
  record(reg.status === 201 && !!reg.body?.token, '2a. Register returns token', `status ${reg.status}`);

  const login = await post('/api/auth/login', { email, password: '123456' });
  record(login.status === 200 && !!login.body?.token, '2b. Login returns token', `status ${login.status}`);

  const token = login.body?.token as string;
  const me = await fetch(`${BASE}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
  record(me.status === 200, '2c. Protected /me works with token', `status ${me.status}`);

  // 3) The 8 AI endpoints (print a snippet so you can eyeball the answer)
  console.log('\n--- AI features (answer preview) ---');
  const ai: [string, string, unknown][] = [
    ['3.1 Chat', '/api/ai/chat', { message: 'What is a webhook node in n8n?' }],
    ['3.2 Explain node', '/api/ai/explain-node', { nodeType: 'n8n-nodes-base.httpRequest' }],
    ['3.3 Explain workflow', '/api/ai/explain-workflow', { workflowJson: '{"nodes":[{"name":"Start","type":"n8n-nodes-base.start","position":[0,0],"parameters":{}}],"connections":{}}' }],
    ['3.4 Generate workflow', '/api/ai/generate-workflow', { description: 'Send a Slack message when a new Gmail email arrives' }],
    ['3.4.1 Validate workflow', '/api/ai/validate-workflow', { workflowJson: '{"nodes":[],"connections":{}}' }],
    ['3.5 Translate error', '/api/ai/translate-error', { error: "Cannot read properties of undefined (reading 'json')" }],
    ['3.6 Compatibility', '/api/ai/compatibility', { sourceNode: 'Gmail Trigger', targetNode: 'Slack' }],
    ['3.7 Security audit', '/api/ai/security-audit', { workflowJson: '{"nodes":[{"parameters":{"url":"http://api.example.com"}}]}' }],
  ];

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  for (const [label, path, body] of ai) {
    const t = Date.now();
    const r = await post(path, body, token);
    const text = typeof r.body?.response === 'string' ? r.body.response : '';
    const ok = r.status === 200 && text.length > 0;
    record(ok, label, `${r.status} ${Date.now() - t}ms`);
    if (text) console.log(`      → ${snippet(text)}`);
    // Free Gemini has a low requests-per-minute limit; pace the calls.
    await sleep(1500);
  }

  // 4) Validation (should be 400)
  console.log('\n--- Validation & security ---');
  const bad = await post('/api/ai/chat', { message: '' }, token);
  record(bad.status === 400, '4a. Empty message rejected (400)', `status ${bad.status}`);

  const bad2 = await post('/api/ai/explain-node', {}, token);
  record(bad2.status === 400, '4b. Missing nodeType rejected (400)', `status ${bad2.status}`);

  // 5) Auth guard (should be 401)
  const noToken = await post('/api/ai/chat', { message: 'hi' });
  record(noToken.status === 401, '5. No token blocked (401)', `status ${noToken.status}`);

  // Summary
  console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('Verification error:', e);
  process.exit(1);
});