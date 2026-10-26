/**
 * Phase 2 smoke test.
 * Requires the API server to be running (npm run dev).
 * Usage: npm run test:smoke   (optionally set BASE_URL)
 */

const BASE = process.env.BASE_URL || 'http://localhost:3001';

type Result = { name: string; status: number; ok: boolean; ms: number; note?: string };

async function post(path: string, body: unknown, token?: string) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json };
}

async function main() {
  const results: Result[] = [];
  const email = `smoke_${Date.now()}@test.com`;

  // Health
  {
    const t = Date.now();
    const r = await fetch(`${BASE}/api/health`).then((x) => x.json()).catch(() => null);
    results.push({ name: 'GET  /api/health', status: r ? 200 : 0, ok: r?.status === 'ok', ms: Date.now() - t });
  }

  // Register
  let token = '';
  {
    const t = Date.now();
    const r = await post('/api/auth/register', { email, password: '123456' });
    token = (r.body as any)?.token || '';
    results.push({ name: 'POST /api/auth/register', status: r.status, ok: r.status === 201 && !!token, ms: Date.now() - t });
  }

  // Login
  {
    const t = Date.now();
    const r = await post('/api/auth/login', { email, password: '123456' });
    results.push({ name: 'POST /api/auth/login', status: r.status, ok: r.status === 200, ms: Date.now() - t });
  }

  // Chat history
  {
    const t = Date.now();
    const created = await post('/api/chat', { title: 'Smoke chat' }, token);
    const sessionId = (created.body as any)?.session?.id;
    const listed = await fetch(`${BASE}/api/chat`, { headers: { Authorization: `Bearer ${token}` } }).then((x) => x.json());
    results.push({
      name: 'CHAT /api/chat',
      status: created.status,
      ok: created.status === 201 && !!sessionId && Array.isArray(listed?.sessions),
      ms: Date.now() - t,
    });
  }

  // AI endpoints
  const ai: [string, unknown][] = [
    ['/api/ai/chat', { message: 'What is a webhook node in n8n?' }],
    ['/api/ai/explain-node', { nodeType: 'n8n-nodes-base.httpRequest' }],
    ['/api/ai/explain-workflow', { workflowJson: '{"nodes":[],"connections":{}}' }],
    ['/api/ai/generate-workflow', { description: 'Send a Slack message when a new Gmail email arrives' }],
    ['/api/ai/validate-workflow', { workflowJson: '{"nodes":[],"connections":{}}' }],
    ['/api/ai/translate-error', { error: "Cannot read properties of undefined (reading 'json')" }],
    ['/api/ai/compatibility', { sourceNode: 'Gmail Trigger', targetNode: 'Slack' }],
    ['/api/ai/security-audit', { workflowJson: '{"nodes":[{"parameters":{"url":"http://api.example.com"}}]}' }],
  ];

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  for (const [path, body] of ai) {
    const t = Date.now();
    const r = await post(path, body, token);
    const ok = r.status === 200 && !!(r.body as any)?.response;
    results.push({
      name: `POST ${path}`,
      status: r.status,
      ok,
      ms: Date.now() - t,
      note: ok ? undefined : JSON.stringify(r.body).slice(0, 120),
    });
    // Free Gemini has a low requests-per-minute limit; pace the calls.
    await sleep(1500);
  }

  // Report
  console.log('\n=== Phase 2 Smoke Test ===\n');
  let passed = 0;
  for (const r of results) {
    const mark = r.ok ? 'PASS' : 'FAIL';
    if (r.ok) passed++;
    console.log(`${mark}  ${r.name.padEnd(38)} ${r.status}  ${r.ms}ms ${r.note ? '\n      ' + r.note : ''}`);
  }
  console.log(`\n${passed}/${results.length} passed\n`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((e) => {
  console.error('Smoke test error:', e);
  process.exit(1);
});