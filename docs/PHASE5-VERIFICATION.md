# Phase 5 — Verification Guide (Step by Step)

Phase 5 = **Workflow Management CRUD**. Ab apne (database mein saved) workflows ko
poora manage kar sakte ho — sab endpoints JWT token ke saath, aur sirf **apne**
workflows (dusre user ka workflow 404 deta hai).

```
list (pagination) → detail (JSON + execution history) → re-execute → activate/deactivate
                  → delete (n8n + database dono se)
```

- **Fastest:** `npm run verify:phase5` (automated, 21 checks)
- **Manual:** Check 1 se Check 10 tak neeche — har check ka command + expected result.

> Phase 5 ke liye **koi nayi migration nahi** chahiye — Phase 4 ke columns
> (`n8n_workflow_id`, `prompt`, `error_analysis` waghera) hi use hote hain.

---

## 0. Prerequisites — 3 services chalao

| # | Service | Command | Confirm |
|---|---------|---------|---------|
| 1 | MySQL | (Windows service — pehle se chalti hai) | `Get-Service MySQL80` → `Running` |
| 2 | **n8n** | Terminal 1: `n8n` | http://localhost:5678 khulta hai |
| 3 | **Backend** | Terminal 2: `npm run dev` | `Invoke-RestMethod http://localhost:3001/api/health` → `status: ok` |

> `.env` mein `GEMINI_API_KEY` aur `N8N_API_KEY` hona zaroori hai.
> Terminal 1 aur 2 **band nahi karni**. Saare checks Terminal 3 mein.

---

## Quick check (automated) — recommended

```bash
npm run verify:phase5
```

Expected: **`21 passed, 0 failed`** aur cleanup `cleaned 1/1 workflow(s)`

Ye script asli Gemini + n8n ke saath 2 workflows banati hai (ek success, ek failure
wala) aur phir poori management API test karti hai:

1. **List + pagination** — counters ke saath (execution_count, last_execution_status)
2. **Detail** — workflow ka JSON definition + live n8n JSON + execution history
3. **Ownership isolation** — dusra user 404 aur khali list dekhta hai
4. **Deactivate / Activate** — DB flag + n8n dono update
5. **Re-execute** — inactive workflow khud activate hokar chalta hai, nayi execution DB mein save
6. **Error path** — Telegram workflow ki re-execution fail hoti hai + AI error analysis save/return
7. **Delete** — n8n + DB dono se remove; dobara delete → 404

Script aakhir mein test workflows khud delete kar deti hai. Gemini free tier pacing ki
wajah se **3 se 5 minute** lag sakte hain — normal hai.

---

## API Endpoints (Phase 5)

| Method & Path | Feature |
|---------------|---------|
| `GET /api/workflows` | Paginated list (`?page=1&limit=10&status=active&search=...`) |
| `GET /api/workflows/:id` | Detail: definition JSON + n8n JSON + execution stats + history |
| `GET /api/workflows/:id/executions` | Paginated execution history (`?page=1&limit=10`) |
| `POST /api/workflows/:id/execute` | Re-execute (`{"payload":{...}}` optional) |
| `PATCH /api/workflows/:id/activate` | Activate in n8n + DB |
| `PATCH /api/workflows/:id/deactivate` | Deactivate in n8n + DB |
| `DELETE /api/workflows/:id` | Delete from n8n + database (executions bhi cascade delete) |

---

## Manual checks — ek ek karke (Terminal 3, PowerShell)

### Check 1 — Login token lo

```powershell
$body = @{ email = "phase5demo$((Get-Random))@test.com"; password = "123456" } | ConvertTo-Json
$reg  = Invoke-RestMethod -Uri http://localhost:3001/api/auth/register -Method Post -ContentType "application/json" -Body $body
$H = @{ Authorization = "Bearer $($reg.token)" }
Write-Host "Token OK"
```

Expected: `Token OK`

### Check 2 — Ek workflow deploy karo (Phase 4 pipeline se)

```powershell
$p = @{ prompt = 'Create a simple workflow: start with a Webhook trigger (POST), then a Set node that assigns a string field "message" with the value "hello phase 5". Return only JSON.' } | ConvertTo-Json
$gen = Invoke-RestMethod -Uri http://localhost:3001/api/workflows/generate-and-deploy -Method Post -Headers $H -ContentType "application/json" -Body $p
$WFID = $gen.workflowId
Write-Host "status=$($gen.status) workflowId=$WFID n8nId=$($gen.n8nWorkflowId)"
```

Expected: `status=success workflowId=<number> n8nId=<id>` (1 minute tak lag sakta hai)

### Check 3 — List (pagination + counters)

```powershell
$list = Invoke-RestMethod -Uri "http://localhost:3001/api/workflows?page=1&limit=5" -Headers $H
$list.pagination | ConvertTo-Json -Compress
$list.data | Select-Object id, name, is_active, execution_count, last_execution_status | Format-Table
```

Expected:
```json
{"page":1,"limit":5,"total":1,"totalPages":1,"hasNext":false,"hasPrev":false}
```
Aur row mein `execution_count` = 1, `last_execution_status` = `completed`.

### Check 4 — Detail (JSON + execution history)

```powershell
$d = Invoke-RestMethod -Uri "http://localhost:3001/api/workflows/$WFID" -Headers $H
Write-Host "nodes: $($d.workflow.definition.nodes.Count)"
Write-Host "n8n available: $($d.n8n.available) active: $($d.n8n.active)"
$d.executionStats | ConvertTo-Json -Compress
$d.executions | Select-Object id, status, n8n_execution_id, created_at | Format-Table
```

Expected: `nodes: 2+`, `n8n available: True active: True`, stats mein `total >= 1`,
aur executions table mein `status = completed` row with `n8n_execution_id`.

### Check 5 — Ownership isolation (dusra user 404)

```powershell
$body2 = @{ email = "phase5other$((Get-Random))@test.com"; password = "123456" } | ConvertTo-Json
$reg2 = Invoke-RestMethod -Uri http://localhost:3001/api/auth/register -Method Post -ContentType "application/json" -Body $body2
$H2 = @{ Authorization = "Bearer $($reg2.token)" }
try { Invoke-RestMethod -Uri "http://localhost:3001/api/workflows/$WFID" -Headers $H2 } catch { Write-Host "status=$($_.Exception.Response.StatusCode.value__)" }
```

Expected: `status=404` — matlab dusra user tumhara workflow nahi dekh sakta.

### Check 6 — Deactivate + Activate

```powershell
$off = Invoke-RestMethod -Uri "http://localhost:3001/api/workflows/$WFID/deactivate" -Method Patch -Headers $H
Write-Host "deactivate → is_active=$($off.is_active)"
Start-Sleep -Seconds 2
$d2 = Invoke-RestMethod -Uri "http://localhost:3001/api/workflows/$WFID" -Headers $H
Write-Host "detail → db=$($d2.workflow.is_active) n8n=$($d2.n8n.active)"
$on = Invoke-RestMethod -Uri "http://localhost:3001/api/workflows/$WFID/activate" -Method Patch -Headers $H
Write-Host "activate → is_active=$($on.is_active)"
```

Expected:
```
deactivate → is_active=False
detail → db=False n8n=False
activate → is_active=True
```

Browser proof: http://localhost:5678 kholo → workflow **Active** toggle badalta dikhega.

### Check 7 — Re-execute (inactive se bhi chal jata hai)

```powershell
# pehle deactivate karo, phir re-execute — khud activate ho jayega
Invoke-RestMethod -Uri "http://localhost:3001/api/workflows/$WFID/deactivate" -Method Patch -Headers $H | Out-Null
$run = Invoke-RestMethod -Uri "http://localhost:3001/api/workflows/$WFID/execute" -Method Post -Headers $H -ContentType "application/json" -Body '{"payload":{"source":"manual"}}'
Write-Host "status=$($run.status) executionId=$($run.execution.id) output=$($run.execution.output | ConvertTo-Json -Compress)"
$d3 = Invoke-RestMethod -Uri "http://localhost:3001/api/workflows/$WFID" -Headers $H
Write-Host "ab active: $($d3.workflow.is_active) | total executions: $($d3.executionStats.total)"
```

Expected: `status=success`, output `{"message":"hello phase 5"}`, aur `total executions`
pehle se **1 zyada** (har re-execution DB mein save hoti hai).

### Check 8 — Error path (AI explanation)

```powershell
$pe = @{ prompt = 'Send a Telegram message when a Google Form is submitted' } | ConvertTo-Json
$ge = Invoke-RestMethod -Uri http://localhost:3001/api/workflows/generate-and-deploy -Method Post -Headers $H -ContentType "application/json" -Body $pe
$EWFID = $ge.workflowId
Start-Sleep -Seconds 2
$er = Invoke-RestMethod -Uri "http://localhost:3001/api/workflows/$EWFID/execute" -Method Post -Headers $H -ContentType "application/json" -Body '{}'
Write-Host "status=$($er.status)"
Write-Host $er.execution.errorAnalysis
```

Expected: `status=failed` aur neeche AI ki **simple English explanation** (Telegram
credentials missing hone ki wajah se). Ye explanation DB mein bhi save hoti hai.

```powershell
$hist = Invoke-RestMethod -Uri "http://localhost:3001/api/workflows/$EWFID/executions?limit=1" -Headers $H
Write-Host "error_analysis saved: $([bool]$hist.data[0].error_analysis)"
```

Expected: `error_analysis saved: True`

### Check 9 — Delete (n8n + DB dono se)

```powershell
$n8nId = $d.n8n.id   # Check 4 se
$del = Invoke-RestMethod -Uri "http://localhost:3001/api/workflows/$WFID" -Method Delete -Headers $H
Write-Host "deleted=$($del.deleted) n8nDeleted=$($del.n8nDeleted)"
try { Invoke-RestMethod -Uri "http://localhost:3001/api/workflows/$WFID" -Headers $H } catch { Write-Host "db ab: $($_.Exception.Response.StatusCode.value__)" }
try { Invoke-RestMethod -Uri "http://localhost:3001/api/n8n/workflows/$n8nId" -Headers $H } catch { Write-Host "n8n ab: $($_.Exception.Response.StatusCode.value__)" }
```

Expected:
```
deleted=True n8nDeleted=True
db ab: 404
n8n ab: 404
```

> Active workflow bhi seedha delete ho jata hai — API khud pehle unpublish karta hai
> (n8n async unpublish ke liye retry built-in hai).

### Check 10 — Cleanup (error workflow bhi delete karo)

```powershell
$del2 = Invoke-RestMethod -Uri "http://localhost:3001/api/workflows/$EWFID" -Method Delete -Headers $H
Write-Host "error workflow deleted=$($del2.deleted)"
```

Expected: `error workflow deleted=True`

---

## Troubleshooting

| Issue | Matlab / Fix |
|-------|--------------|
| List 400 | `page` >= 1 aur `limit` 1-50 hona chahiye |
| Detail 404 | Workflow tumhara nahi ya exist nahi karta (ownership check) |
| Re-execute 404 | Ye workflow n8n se manually delete ho chuka hai — dobara deploy karo |
| Execute 409 | Workflow n8n par deploy hi nahi hua (`n8n_workflow_id` NULL) |
| Delete 502 | n8n down hai — `n8n` chalao, phir dobara try karo |
| `execution_count` 0 | Workflow deploy hua lekin kabhi execute nahi hua — re-execute karo |
| Re-execute "failed" + credential error | Bug nahi — `errorAnalysis` padho ya n8n mein credentials add karo |

## After Phase 5 (aage kya)

- **Phase 6** — Frontend integration (workflow dashboard: list, detail, run, delete)
- **Phase 7** — Polish + deployment
