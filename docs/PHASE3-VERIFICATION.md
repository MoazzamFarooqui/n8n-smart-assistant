# Phase 3 — Verification Guide (Step by Step)

Phase 3 = **n8n REST API Integration**. Is document mein poora tareeqa hai: start se end
tak har feature ko haath se verify karna — commands + expected results + n8n browser proofs.

- **Fastest:** `npm run verify:phase3` (automated, 14 checks)
- **Manual:** Check 1 se Check 13 tak neeche — har check ka command, expected result, aur
  (jahan bane) n8n browser proof.

> n8n local dev account: `moazzam@aies.local` / `Moazzam123` — sirf tumhari machine
> (localhost:5678) ke liye. Shared/production setup mein password change karo.

---

## 0. Prerequisites — 3 services chalao

| # | Service | Command | Confirm |
|---|---------|---------|---------|
| 1 | MySQL | (Windows service — pehle se chalti hai) | `Get-Service MySQL80` → `Running` |
| 2 | **n8n** | Terminal 1: `n8n` | http://localhost:5678 khulta hai |
| 3 | **Backend** | Terminal 2: `npm run dev` | `Invoke-RestMethod http://localhost:3001/api/health` → `status: ok` |

Terminal 1 aur 2 **band nahi karni** — chalti rehni chahiye. Saare checks Terminal 3 mein.

### n8n zinda hai ya nahi? (do levels)

| Level | Check | Kya batata hai |
|-------|-------|----------------|
| 1 | Browser: http://localhost:5678 khule, ya `Invoke-RestMethod http://localhost:5678/healthz` → `{"status":"ok"}` | n8n process chal raha hai |
| 2 | Check 2 (`GET /api/n8n/status`) → `reachable: true` | n8n chal raha hai **aur** API key bhi sahi hai |

**Important:** Browser ka khulna sirf Level 1 hai. Agar API key ghalat ho to browser phir bhi
khulega lekin backend `502` dega. Isliye Level 2 (Check 2) sabse strong check hai.

---

## Quick check (automated) — recommended

```bash
npm run verify:phase3
```

Expected: **`14 passed, 0 failed`**

Ye script khud poora flow chalati hai: register → create → update → activate → execute →
execution view → deactivate → inactive refused → delete → 404. Sab pass = Phase 3 theek hai.
Detail mein khud dekhna ho to neeche manual checks karo.

---

## Manual checks — ek ek karke (Terminal 3, PowerShell)

### Check 1 — Login token lo (sab ke liye zaroori)

```powershell
$body = @{ email = "phase3demo$((Get-Random))@test.com"; password = "123456" } | ConvertTo-Json
$reg  = Invoke-RestMethod -Uri http://localhost:3001/api/auth/register -Method Post -ContentType "application/json" -Body $body
$H = @{ Authorization = "Bearer $($reg.token)" }
Write-Host "Token OK"
```

✅ Expected: `Token OK`

---

### Check 2 — n8n connected hai? (`GET /status`)

```powershell
Invoke-RestMethod -Uri http://localhost:3001/api/n8n/status -Headers $H | ConvertTo-Json
```

✅ Expected: `"configured": true` **aur** `"reachable": true`

❌ `reachable: false` → n8n band hai, Terminal 1 mein `n8n` chalao

---

### Check 3 — Security: bina login koi andar nahi (401)

```powershell
try { Invoke-RestMethod -Uri http://localhost:3001/api/n8n/workflows } catch { $_.Exception.Response.StatusCode.value__ }
```

✅ Expected: `401`

---

### Check 4 — CREATE: workflow banao

```powershell
$wfJson = @'
{
  "name": "My Phase3 Demo",
  "nodes": [
    { "name": "Webhook", "type": "n8n-nodes-base.webhook", "typeVersion": 2, "position": [0,0],
      "parameters": { "httpMethod": "POST", "path": "demo-p3-111", "responseMode": "lastNode", "options": {} } },
    { "name": "Set Data", "type": "n8n-nodes-base.set", "typeVersion": 3.4, "position": [220,0],
      "parameters": { "mode": "manual", "options": {},
        "assignments": { "assignments": [
          { "id": "a1", "name": "message", "value": "Hello from n8n", "type": "string" },
          { "id": "a2", "name": "yourEmail", "value": "={{ $json.body.email }}", "type": "string" }
        ] } } }
  ],
  "connections": { "Webhook": { "main": [[{ "node": "Set Data", "type": "main", "index": 0 }]] } }
}
'@
$wf = Invoke-RestMethod -Uri http://localhost:3001/api/n8n/workflows -Method Post -ContentType "application/json" -Headers $H -Body $wfJson
$wf.id
```

✅ Expected: id print ho (jaise `66YTeFD...`) = n8n mein workflow ban gayi

> **Note:** Check 4 dobara chalao to `path` value badal do (jaise `demo-p3-112`) —
> warna "webhook path already taken" error aa sakta hai. Ya pehle purani workflow delete karo.

#### Browser proof — n8n mein workflow bani? dekhne ka tareeqa

1. Browser mein http://localhost:5678 kholo (login: `moazzam@aies.local` / `Moazzam123`)
2. Left sidebar → **Overview** (workflows list)
3. List mein **"My Phase3 Demo"** nazar aayegi — na dikhe to **F5** (refresh)
4. Workflow par **click** karo → editor khulega:

   ```
   [ Webhook ] ────→ [ Set Data ]
   ```

   2 nodes, beech mein connecting line (arrow) = properly bani hai
5. **Webhook** node par click → right panel mein:
   - HTTP Method: **POST**
   - Webhook URL (production): `http://localhost:5678/webhook/demo-p3-111`

Agar PowerShell list mein hai lekin browser mein nahi: F5 karo, ya ghalat folder/project
mein ho. Dobara check: `(Invoke-RestMethod -Uri http://localhost:3001/api/n8n/workflows -Headers $H).data | Select-Object id, name`

---

### Check 5 — UPDATE: workflow update karo

```powershell
$upd = Invoke-RestMethod -Uri "http://localhost:3001/api/n8n/workflows/$($wf.id)" -Method Put -ContentType "application/json" -Headers $H -Body (@{ name = "My Phase3 Demo (renamed)" } | ConvertTo-Json)
$upd.name
```

✅ Expected: `My Phase3 Demo (renamed)`

**Browser:** n8n mein **F5** karo → naya naam "My Phase3 Demo (renamed)" dikhega

---

### Check 6 — Activate karo

```powershell
Invoke-RestMethod -Uri "http://localhost:3001/api/n8n/workflows/$($wf.id)/activate" -Method Patch -Headers $H | ConvertTo-Json
```

✅ Expected: `"active": true`

**Browser:** workflow ke aage status **Inactive → Active** (green), editor mein toggle ON

---

### Check 7 — EXECUTE: workflow chalao

```powershell
$run = Invoke-RestMethod -Uri "http://localhost:3001/api/n8n/workflows/$($wf.id)/execute" -Method Post -ContentType "application/json" -Headers $H -Body (@{ payload = @{ email = "me@demo.com" } } | ConvertTo-Json)
$run.data | ConvertTo-Json
```

✅ Expected:
```json
{ "message": "Hello from n8n", "yourEmail": "me@demo.com" }
```

Iska matlab: hamare API ne n8n ke webhook ko call kiya, workflow chali, aur n8n ne result wapas bheja.

---

### Check 8 — Execution results / history

```powershell
$exec = Invoke-RestMethod -Uri "http://localhost:3001/api/n8n/executions?workflowId=$($wf.id)" -Headers $H
$exec.data | ConvertTo-Json
$exec.data[0].id
```

✅ Expected: `"status": "success"` + ek execution `id`

Detail mein dekho:

```powershell
Invoke-RestMethod -Uri "http://localhost:3001/api/n8n/executions/$($exec.data[0].id)" -Headers $H | ConvertTo-Json -Depth 5
```

✅ Expected: poora result (input + output data)

**Browser:** workflow kholo → **Executions** tab → naya run **green ✓** (status: success).
Run kholo → input/output data dikhega.

---

### Check 9 — List workflows

```powershell
(Invoke-RestMethod -Uri http://localhost:3001/api/n8n/workflows -Headers $H).data | ConvertTo-Json -Depth 3
```

✅ Expected: tumhari workflow list mein nazar aaye

---

### Check 10 — Deactivate karo

```powershell
Invoke-RestMethod -Uri "http://localhost:3001/api/n8n/workflows/$($wf.id)/deactivate" -Method Patch -Headers $H | ConvertTo-Json
```

✅ Expected: `"active": false`

---

### Check 11 — Inactive workflow chalane se mana (409)

```powershell
try { Invoke-RestMethod -Uri "http://localhost:3001/api/n8n/workflows/$($wf.id)/execute" -Method Post -ContentType "application/json" -Headers $H -Body '{"payload":{}}' } catch { $_.Exception.Response.StatusCode.value__ }
```

✅ Expected: `409` (= workflow off hai, pehle activate karo)

---

### Check 12 — Delete karo

```powershell
Invoke-RestMethod -Uri "http://localhost:3001/api/n8n/workflows/$($wf.id)" -Method Delete -Headers $H | ConvertTo-Json
```

✅ Expected: `"deleted": true`

---

### Check 13 — Delete ke baad waqai gayab? (404)

```powershell
try { Invoke-RestMethod -Uri "http://localhost:3001/api/n8n/workflows/$($wf.id)" -Headers $H } catch { $_.Exception.Response.StatusCode.value__ }
```

✅ Expected: `404`

**Browser:** n8n list refresh karo → workflow gayab ho gayi

---

## Bonus — n8n UI mein manual webhook test (Test URL)

Workflow editor mein **Webhook** node par double-click karo → n8n "**Waiting for you to
call the Test URL**" mode mein aata hai. Ab ye chalao:

```powershell
Invoke-RestMethod -Uri http://localhost:5678/webhook-test/demo-p3-111 -Method Post -ContentType "application/json" -Body '{"email":"me@demo.com"}' | ConvertTo-Json
```

✅ Browser mein turant: Webhook node **green**, "1 item" data visible — workflow sach mein chal rahi hai.

Phir **"Stop Listening"** (orange button) dabao.

> **Yaad rakho:** `/webhook-test/...` sirf tab chalta hai jab listening ON ho (manual test).
> `/webhook/...` (production URL, jo hamara backend use karta hai) sirf tab chalta hai jab
> workflow **Active** ho.

---

## Summary — 14 checks ka expected result

| # | Check | Pass matlab |
|---|-------|-------------|
| 1 | Login / register | token mila |
| 2 | No token blocked | `401` |
| 3 | n8n configured + reachable | `configured: true`, `reachable: true` |
| 4 | Create workflow | `201` + id |
| 5 | Update workflow (rename) | naya naam wapas aaya |
| 6 | Activate | `active: true` |
| 7 | Execute (webhook) | result data aaya |
| 8 | Execution listed | id mili |
| 9 | View execution result | `status: success` |
| 10 | Deactivate | `active: false` |
| 11 | Execute inactive refused | `409` |
| 12 | Delete | `deleted: true` |
| 13 | Deleted returns 404 | `404` |
| 14 | API server + DB | `status: ok` |

Automated script yehi 14 checks chalati hai: `npm run verify:phase3`

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `status` in `reachable: false` | n8n band hai — Terminal 1 mein `n8n` chalao |
| `server not reachable` (verify script) | backend band hai — Terminal 2 mein `npm run dev` chalao |
| `401` token ke saath | token expire — Check 1 dobara chalao |
| Create par `400` | JSON kharab hai ya `nodes`/`connections` missing |
| Webhook `404` execute par | workflow activate nahi — Check 6 pehle chalao (activate ke baad 1-2 sec lag sakte hain) |
| Execute par `409` | workflow off hai — pehle activate karo |
| `502` | n8n issue — browser mein n8n khul raha hai check karo, `N8N_API_KEY` sahi hai dekho |
| `503` | `.env` mein `N8N_API_KEY` nahi — set karo aur backend restart karo |
| Webhook path taken error | `path` value badal do (`demo-p3-112`) ya purani workflow delete karo |

---

## Cleanup

Agar beech mein manual checks rok do to test workflow n8n mein reh jayegi. Delete karne ke liye:

```powershell
Invoke-RestMethod -Uri "http://localhost:3001/api/n8n/workflows/$($wf.id)/deactivate" -Method Patch -Headers $H -ErrorAction SilentlyContinue | Out-Null
Invoke-RestMethod -Uri "http://localhost:3001/api/n8n/workflows/$($wf.id)" -Method Delete -Headers $H
```

Ya n8n browser mein workflow kholo → **...** menu → Delete.
