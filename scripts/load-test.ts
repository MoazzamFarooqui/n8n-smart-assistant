/**
 * Concurrent load probe against health + auth.
 * Usage (server must be running):
 *   npm run load:test
 *   LOAD_REQUESTS=200 LOAD_CONCURRENCY=20 npm run load:test
 */

const BASE = process.env.BASE_URL || 'http://localhost:3001';
const TOTAL = Math.max(1, parseInt(process.env.LOAD_REQUESTS || '120', 10));
const CONCURRENCY = Math.max(1, parseInt(process.env.LOAD_CONCURRENCY || '20', 10));

type Sample = { ok: boolean; status: number; ms: number };

async function hit(path: string, init?: RequestInit): Promise<Sample> {
  const t = Date.now();
  try {
    const res = await fetch(`${BASE}${path}`, init);
    return { ok: res.ok || res.status === 429, status: res.status, ms: Date.now() - t };
  } catch {
    return { ok: false, status: 0, ms: Date.now() - t };
  }
}

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

async function runPool(count: number, worker: () => Promise<Sample>): Promise<Sample[]> {
  const results: Sample[] = [];
  let next = 0;
  async function run() {
    while (true) {
      const i = next++;
      if (i >= count) return;
      results[i] = await worker();
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, count) }, () => run()));
  return results;
}

function report(title: string, samples: Sample[]) {
  const times = samples.map((s) => s.ms);
  const ok = samples.filter((s) => s.ok).length;
  const limited = samples.filter((s) => s.status === 429).length;
  const failed = samples.length - ok;
  const elapsed = times.reduce((a, b) => a + b, 0);
  console.log(`\n=== ${title} ===`);
  console.log(`requests: ${samples.length}  ok: ${ok}  failed: ${failed}  429: ${limited}`);
  console.log(`p50: ${percentile(times, 50)}ms  p95: ${percentile(times, 95)}ms  p99: ${percentile(times, 99)}ms  max: ${Math.max(...times)}ms`);
  console.log(`approx avg latency: ${Math.round(elapsed / samples.length)}ms  concurrency: ${CONCURRENCY}`);
  return failed === 0;
}

async function main() {
  console.log(`Load test → ${BASE}  (${TOTAL} requests, concurrency ${CONCURRENCY})`);

  const healthOk = report(
    'GET /api/health',
    await runPool(TOTAL, () => hit('/api/health'))
  );

  const email = `load_${Date.now()}@test.com`;
  const register = await hit('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: '123456' }),
  });
  console.log(`\nseed register: ${register.status} in ${register.ms}ms`);

  const authSamples = await runPool(Math.min(40, TOTAL), () =>
    hit('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: '123456' }),
    })
  );
  const authOk = report('POST /api/auth/login (includes rate-limit 429 as ok)', authSamples);

  const passed = healthOk && register.ok && authOk;
  console.log(passed ? '\nLoad test passed\n' : '\nLoad test failed\n');
  process.exit(passed ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
