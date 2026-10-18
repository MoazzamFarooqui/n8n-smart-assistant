# Phase 4 — Verification Guide (Step by Step)

Phase 4 = **Automated Workflow Pipeline**. Ek hi endpoint (`POST /api/workflows/generate-and-deploy`)
jo poora kaam khud karta hai:

```
prompt do → AI workflow banata hai → validate karta hai → security audit karta hai
         → n8n par deploy karta hai → activate karke webhook se chala kar dikhata hai
         → sab kuch database mein save karta hai
```

Agar workflow chalne mein fail ho (jaise credentials na hon) to AI khud error ki
 **simple English explanation** bhi bana kar wapas deta hai.

- **Fastest:** `npm run verify:phase4` (automated, 12 checks)
- **Manual:** Check 1 se Check 8 tak neeche — har check ka command + expected result.

> n8n local dev account: `moazzam@aies.local` / `Moazzam123` — sirf tumhari machine
> (localhost:5678) ke liye. Shared/production setup mein password change karo.

---

## 0. Prerequisites — 3 services chalao (aur migration)

| # | Service | Command | Confirm |
|---|---------|---------|---------|
| 1 | MySQL | (Windows service — pehle se chalti hai) | `Get-Service MySQL80` → `Running` |
| 2 | **n8n** | Terminal 1: `n8n` | http://localhost:5678 khulta hai |
| 3 | **Backend** | Terminal 2: `npm run dev` | `Invoke-RestMethod http://localhost:3001/api/health` → `status: ok` |

**Ek dafa migration chalao** (Phase 4 ke naye columns add karta hai — dobara chalana safe hai):

```bash
npm run db:migrate
```

Expected:

```
> 002_phase4_pipeline.sql (6 statements)
  ✅ done
All migrations applied successfully.
```

> `.env` mein `GEMINI_API_KEY` aur `N8N_API_KEY` hona zaroori hai — warna pipeline
> generate/deploy stage par error dega (jo response mein saaf likha hoga).

Terminal 1 aur 2 **band nahi karni**. Saare checks Terminal 3 mein.

---

## Quick check (automated) — recommended

```bash
npm run verify:phase4
```

Expected: **`12 passed, 0 failed`**

Ye script asli Gemini + asli n8n ke saath 2 poore pipelines chalati hai:

1. **Success path** — credential-free prompt → success + workflow output
2. **Error path** — Telegram prompt (credentials nahi hain) → failed + AI error analysis

Aakhir mein dono test workflows n8n se delete bhi kar deti hai. Script mein pacing
(3 sec wait) built-in hai kyunki Gemini free tier ki rate limit low hai — sab pass
hone mein **2 se 4 minute** lag sakte hain, ye normal hai.

---

## Manual checks — ek ek karke (Terminal 3, PowerShell)

### Check 1 — Login token lo

```powershell
$body = @{ email = "phase4demo$((Get-Random))@test.com"; password = "123456" } | ConvertTo-Json
$reg  = Invoke-RestMethod -Uri http://localhost:3001/api/auth/register -Method Post -ContentType "application/json" -Body $body
$H = @{ Authorization = "Bearer $($reg.token)" }
Write-Host "Token OK"
```

✅ Expected: `Token OK`

---

### Check 2 — Security: bina login koi andar nahi (401)

```powershell
try { Invoke-RestMethod -Uri http://localhost:3001/api/workflows/generate-and-deploy -Method Post -ContentType "application/json" -Body '{"prompt":"make something"}' } catch { $_.Exception.Response.StatusCode.value__ }
```

✅ Expected: `401`

---

### Check 3 — Validation: chhota prompt reject (400)

```powershell
try { Invoke-RestMethod -Uri http://localhost:3001/api/workflows/generate-and-deploy -Method Post -ContentType "application/json" -Headers $H -Body '{"prompt":"hi"}' } catch { $_.Exception.Response.StatusCode.value__ }
```

✅ Expected: `400` (prompt kam az kam 10 characters ka hona chahiye)

---

### Check 4 — SUCCESS PATH: ek hi call mein poora pipeline

```powershell
$p1 = @{ prompt = "Create a simple workflow: start with a Webhook trigger (POST), then a Set node that adds a string field 'message' with value 'hello from phase 4'. Return only JSON." } | ConvertTo-Json
$r1 = Invoke-RestMethod -Uri http://localhost:3001/api/workflows/generate-and-deploy -Method Post -ContentType "application/json" -Headers $H -Body $p1
$r1 | ConvertTo-Json -Depth 6
```

> Ye call **10 se 60 second** le sakti hai (3 AI calls + n8n deploy + execute). Sabar karo.

✅ Expected (important fields):

```json
{
  "workflowId": 7,
  "n8nWorkflowId": "fwmWwpPcuUwrkPtb",
  "status": "success",
  "stages": [
    { "stage": "generate", "ok": true },
    { "stage": "validate", "ok": true },
    { "stage": "audit",    "ok": true },
    { "stage": "deploy",   "ok": true },
    { "stage": "execute",  "ok": true }
  ],
  "execution": { "status": "success", "data": [ { "message": "hello from phase 4" } ] }
}
```

Confirm karo:

```powershell
$r1.status                 # success
($r1.stages | ForEach-Object { $_.stage }) -join " → "   # generate → validate → audit → deploy → execute
$r1.execution.data.message # hello from phase 4
```

#### Browser proof — n8n mein workflow bani, active hui, chali?

1. Browser mein http://localhost:5678 kholo (login: `moazzam@aies.local` / `Moazzam123`)
2. Left sidebar → **Overview** → list mein AI wali workflow (naam `$r1.name`) dikhegi
3. Workflow ke aage status **Active** (green) hona chahiye
4. Workflow kholo → nodes: `[ Webhook Trigger ] ──→ [ ...AI ne banaye nodes... ]`
5. **Executions** tab → ek run **green ✓ (success)** dikhega — click karke input/output data dekho

---

### Check 5 — Database mein save hua? (proof)

```powershell
node -e "const mysql=require('mysql2/promise');(async()=>{const c=await mysql.createConnection({host:'127.0.0.1',port:3306,user:'root',password:'moazzam123',database:'n8n_smart_assist'});const [w]=await c.query('SELECT id,name,n8n_workflow_id,is_active,LEFT(prompt,60) prompt FROM workflows ORDER BY id DESC LIMIT 1');const [e]=await c.query('SELECT id,workflow_id,status,LEFT(error_analysis,80) analysis FROM workflow_executions ORDER BY id DESC LIMIT 1');console.log('workflow:',w[0]);console.log('execution:',e[0]);await c.end();})()"
```

✅ Expected: workflow row mein `n8n_workflow_id` bara hua, `is_active: 1`, `prompt` saved.
Aur `workflow_executions` mein `status: completed` wali nayi row.

---

### Check 6 — ERROR PATH: aisi workflow jo credentials ke baghair fail ho

```powershell
$p2 = @{ prompt = "Send a Telegram message when a Google Form is submitted" } | ConvertTo-Json
$r2 = Invoke-RestMethod -Uri http://localhost:3001/api/workflows/generate-and-deploy -Method Post -ContentType "application/json" -Headers $H -Body $p2
$r2.status
$r2.execution.error
$r2.errorAnalysis
```

✅ Expected:

- `$r2.status` → `failed` (HTTP phir bhi **200** — pipeline deploy ho gaya tha, sirf run fail hua)
- `$r2.execution.error` → asli n8n error (jaise `Credential ... does not exist for type "telegramApi"`)
- `$r2.errorAnalysis` → AI ki simple English explanation (`### 1) What happened... How to fix...`)

Iska matlab: **error message translator khud-ba-khud (automatically) chal gaya** — yehi Phase 4 ka key feature hai.

> Agar AI ne is dafa Telegram node ke bajaye koi credential-free workflow bana diya ho
> to `status: success` aa sakta hai (AI har run par thoda different banta hai). Us case
> mein chalane ke liye `verify:phase4` script best hai — wo deterministic checks karti hai.

---

### Check 7 — Deployed workflows list (n8n + DB dono mein)

```powershell
(Invoke-RestMethod -Uri http://localhost:3001/api/n8n/workflows -Headers $H).data | Select-Object id, name, active | ConvertTo-Json -Depth 3
```

✅ Expected: Check 4/6 mein bani workflows is list mein nazar aayen

---

### Check 8 — Cleanup: test workflows delete karo

```powershell
Invoke-RestMethod -Uri "http://localhost:3001/api/n8n/workflows/$($r1.n8nWorkflowId)/deactivate" -Method Patch -Headers $H -ErrorAction SilentlyContinue | Out-Null
Invoke-RestMethod -Uri "http://localhost:3001/api/n8n/workflows/$($r1.n8nWorkflowId)" -Method Delete -Headers $H
if ($r2.n8nWorkflowId) {
  Invoke-RestMethod -Uri "http://localhost:3001/api/n8n/workflows/$($r2.n8nWorkflowId)/deactivate" -Method Patch -Headers $H -ErrorAction SilentlyContinue | Out-Null
  Invoke-RestMethod -Uri "http://localhost:3001/api/n8n/workflows/$($r2.n8nWorkflowId)" -Method Delete -Headers $H
}
```

✅ Expected: `"deleted": true` (workflows n8n se hat gayen; DB mein record reh jaata hai — wo history hai)

---

## Summary — 12 checks ka expected result

| # | Check | Pass matlab |
|---|-------|-------------|
| 0 | API server + DB | `status: ok` |
| 1 | Register | token mila |
| 2 | No token blocked | `401` |
| 3 | Too-short prompt rejected | `400` |
| 4 | Pipeline returns success | `status: "success"` |
| 5 | DB persistence | `workflowId` + `n8nWorkflowId` wapas aaye |
| 6 | All 5 stages ran | generate → validate → audit → deploy → execute |
| 7 | Execution returned output | response mein workflow ka data |
| 8 | Validation + audit results | dono mojood |
| 9 | Workflow in n8n active | n8n mein exists + `active: true` |
| 10 | Error prompt deployed | `failed` status (deploy phir bhi hui) |
| 11 | Auto error analysis | AI explanation text aaya |

Automated script yehi 12 checks chalati hai: `npm run verify:phase4`

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `server not reachable` (verify script) | backend band hai — Terminal 2 mein `npm run dev` chalao |
| `402/502` "Workflow generation failed" + `429` | Gemini rate limit — thora ruk ke dobara chalao (fallback models automatic try hote hain) |
| `502` "Deploy to n8n failed: Cannot reach n8n" | n8n band hai — Terminal 1 mein `n8n` chalao |
| `502` "Connect ECONNREFUSED" | wahi — n8n band/restart ho raha hai, dobara try karo |
| `status: "failed"` + credential error | ye **bug nahi, feature hai** — `errorAnalysis` padho, ya n8n mein credentials add karo |
| Execution `pending` / output khali | AI ne `responseMode` ghalat banaya ho sakta hai (rare) — dobara chalao; hamara sanitiser `lastNode` force karta hai |
| Webhook `404` execute stage mein | n8n action publish async hai — script khud 1-2 sec retry karti hai; phir bhi ho to workflow manual deactivate/activate karo |
| Delete par `409` "still being unpublished" | n8n unpublish bhi async hai — backend khud 2-9 sec tak retry karta hai; phir bhi aaye to 2-3 sec ruk ke dobara delete karo |
| DB error `Unknown column 'n8n_workflow_id'` | migration nahi chali — `npm run db:migrate` chalao |

---

## Cleanup

`verify:phase4` script khud donon test workflows n8n se delete kar deti hai.
Manual checks ke baad bhi workflow reh jaye to Check 8 chalao. DB mein `workflows`
aur `workflow_executions` rows history ke liye reh jaati hain (jo Phase 5 ki management
API se manage hongi).
