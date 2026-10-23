# Credentials Gate — Verification Guide (Step by Step)

**Branch:** `fix/credentials-gate`

Pehle backend user se app credentials **nahi** maangta tha — workflow deploy ho jata
tha aur credential ki kami sirf n8n execution mein error bankar samne aati thi. Ab
pipeline ka naya **`credentials` stage** deploy se pehle check karta hai: agar workflow
ko WhatsApp / Discord / Slack / Telegram / Email waghera ka credential chahiye aur
user ne link nahi kiya → **409 + `needsCredentials` + `workflowPreview`**, aur n8n par
kuch deploy nahi hota.

```
generate → credentials (naya gate) → validate → audit → deploy → execute
```

- **Fastest:** `npm run verify:credentials` (automated, 19 checks)
- `npm run verify:phase4` aur `npm run verify:phase5` bhi is gate ke saath update ho chuke hain
- **Manual:** neeche Check 1 se Check 8 tak — har check ka command + expected result

> **Migration zaroori:** `npm run db:migrate` (nayi table `user_credentials`)

---

## Commits (is branch pe)

| Commit | Message |
|--------|---------|
| `30bcd58` | feat(credentials): add per-user app credential management |
| `de04dc4` | feat(pipeline): require linked credentials before deploy |
| `887cc01` | test(verify): cover the credentials gate in phase 4 and 5 scripts |

## Kya kya change hua

**Naya:**

| File | Kya hai |
|------|---------|
| `migrations/003_user_credentials.sql` | `user_credentials` table |
| `src/services/credentials.ts` | Provider specs, detection, field validation, injection |
| `src/models/UserCredential.ts` | DB model |
| `src/routes/credentials.ts` | `/api/credentials` CRUD |
| `scripts/verify-credentials.ts` | Dedicated verification script (19 checks) |

**Modified:**

| File | Kya badla |
|------|-----------|
| `src/services/pipeline.ts` | Credentials stage, `skipApps`, clean stored definition, Slack node normalization |
| `src/routes/workflows.ts` | `skipApps` body field, needsCredentials payload, detail + execute gating |
| `src/services/gemini.ts` | AI ko mana kiya gaya ke credential IDs invent kare |
| `src/services/n8n.ts` | Credential CRUD client methods |
| `src/app.ts` | Credentials route mount |
| `scripts/verify-phase4.ts`, `scripts/verify-phase5.ts` | Gate ke hisaab se update |
| `package.json` | `verify:credentials` script |

**Behaviour contract:**

| Case | Response |
|------|----------|
| Credential missing | `409` + `stage: "credentials"` + `needsCredentials[]` + `workflowPreview` — **kuch deploy nahi hota** |
| App intentionally skip (`skipApps`) | `422` + `skippedApps[]` |
| Credential-free workflow (webhook → set) | Pehle ki tarah success — required list khali hoti hai |
| API responses | Secrets kabhi return nahi hote — sirf metadata |

Supported apps: **telegram, whatsapp, discord, slack, smtp** (API se create ho sakte
hain) + **gmail, googleSheets, instagram** (OAuth — n8n mein connect karke
`n8nCredentialId` se link karo).

---

## 0. Prerequisites — 3 services chalao

| # | Service | Command | Confirm |
|---|---------|---------|---------|
| 1 | MySQL | (Windows service — pehle se chalti hai) | `Get-Service MySQL80` → `Running` |
| 2 | **n8n** | Terminal 1: `n8n` | http://localhost:5678 khulta hai |
| 3 | **Backend** | Terminal 2: `npm run dev` | `Invoke-RestMethod http://localhost:3001/api/health` → `status: ok` |

> `.env` mein `GEMINI_API_KEY` aur `N8N_API_KEY` hona zaroori hai.
> ⚠️ **n8n API key ke scopes:** credential endpoints ke liye key mein credential
> scopes (`credential:create`, `credential:read`, `credential:update`,
> `credential:delete`) hone chahiye. Warna 502 aata hai:
> *"for credential endpoints the key needs credential scopes"*.
> Terminal 1 aur 2 **band nahi karni**. Saare checks Terminal 3 mein.

Migration chalao (agar pehle nahi chalayi):

```bash
npm run db:migrate
```

---

## Quick check (automated) — recommended

```bash
npm run verify:credentials
```

Expected: **`=== RESULT: 19 passed, 0 failed ===`**

Ye script cover karti hai: specs endpoint, detection/injection unit checks, create +
update + delete real n8n credential (fake token), metadata-only responses, live 409
gate, aur 422 jab app skip ho.

Phir dono phase scripts bhi chalao (gate ke saath updated hain):

```bash
npm run verify:phase4    # expected: sab checks PASS, 0 failed
npm run verify:phase5    # expected: sab checks PASS, 0 failed
```

Gemini free-tier pacing ki wajah se har script mein **3 se 5 minute** lag sakte hain.

---

## API Endpoints

| Method & Path | Feature |
|---------------|---------|
| `GET /api/credentials/types` | Supported apps + required fields |
| `GET /api/credentials` | Linked credentials (metadata only, no secrets) |
| `GET /api/credentials/available?type=...` | Credentials jo n8n mein maujood hain (link karne ke liye) |
| `POST /api/credentials` | Create managed credential **ya** existing n8n credential link karo (`n8nCredentialId`) |
| `DELETE /api/credentials/:app` | Unlink (managed ho to n8n se bhi delete) |
| `POST /api/workflows/generate-and-deploy` | Optional body: `skipApps: ["telegram"]`; naye 409/422 responses |
| `GET /api/workflows/:id` | + `credentials: { required, missing }` |
| `POST /api/workflows/:id/execute` | Missing credentials par `409` gate |

---

## Manual checks — ek ek karke (Terminal 3, PowerShell)

### Check 1 — Login token lo

```powershell
$body = @{ email = "credgate$((Get-Random))@test.com"; password = "123456" } | ConvertTo-Json
$reg  = Invoke-RestMethod -Uri http://localhost:3001/api/auth/register -Method Post -ContentType "application/json" -Body $body
$H    = @{ Authorization = "Bearer $($reg.token)" }
Write-Host "Token OK"
```

Expected: `Token OK`

### Check 2 — Supported apps + fields dekho

```powershell
$types = Invoke-RestMethod -Uri http://localhost:3001/api/credentials/types -Headers $H
$types.apps
$types.data | Where-Object app -in whatsapp,discord,slack | Select-Object app,label,creatable | Format-Table
($types.data | Where-Object app -eq "whatsapp").fields | Select-Object key,label,required | Format-Table
```

Expected:
```
telegram, whatsapp, discord, slack, smtp, gmail, googleSheets, instagram
```
Aur WhatsApp ke fields: `accessToken` (required) + `businessAccountId` (required) —
Discord: `botToken`, Slack: `accessToken`.

### Check 3 — MAIN FIX: bina credentials deploy block ho

```powershell
$p = @{ prompt = 'Send a WhatsApp message with the text "hello" to 923001234567 when a webhook receives a request' } | ConvertTo-Json
try {
  Invoke-RestMethod -Uri http://localhost:3001/api/workflows/generate-and-deploy -Method Post -Headers $H -ContentType "application/json" -Body $p
} catch {
  $r = $_.ErrorDetails.Message | ConvertFrom-Json
  Write-Host "status=$($_.Exception.Response.StatusCode.value__) stage=$($r.stage)"
  Write-Host "needs: $($r.needsCredentials.app -join ', ')"
  Write-Host "preview nodes: $($r.workflowPreview.nodes.Count)"
}
```

Expected:
```
status=409 stage=credentials
needs: whatsapp
preview nodes: 2+
```

**Aur yeh bhi confirm karo:** http://localhost:5678 kholo → **Workflows** — koi naya
workflow create **nahi** hua hona chahiye. Matlab gate ne deploy hone se pehle rok diya. ✅

### Check 4 — WhatsApp credential link karo (fake values)

```powershell
$cred = @{
  app  = "whatsapp"
  name = "Verify WhatsApp"
  data = @{ accessToken = "EAAGfakeTokenForVerification"; businessAccountId = "123456789012345" }
} | ConvertTo-Json -Depth 5
$c = Invoke-RestMethod -Uri http://localhost:3001/api/credentials -Method Post -Headers $H -ContentType "application/json" -Body $cred
Write-Host "app=$($c.app) managed=$($c.managed) n8nId=$($c.n8nCredentialId)"
```

Expected: `app=whatsapp managed=True n8nId=<id>`

Confirm ooper wali line mein **token kabhi nazar nahi aata** (secret leak nahi hota).
n8n mein bhi check karo: http://localhost:5678 → **Credentials** → "Verify WhatsApp" maujood hai.

### Check 5 — Dobara generate karo → ab deploy ho (credential inject)

```powershell
Start-Sleep -Seconds 2
$run = Invoke-RestMethod -Uri http://localhost:3001/api/workflows/generate-and-deploy -Method Post -Headers $H -ContentType "application/json" -Body $p
Write-Host "pipeline=$($run.status) workflowId=$($run.workflowId) n8nId=$($run.n8nWorkflowId)"
$run.stages | Select-Object stage,ok | Format-Table
```

Expected:

```
pipeline=failed workflowId=<number> n8nId=<id>
stage      ok
generate   True
credentials True
validate   True
audit      True
deploy     True
execute    False
```

> `pipeline=failed` yahan **normal** hai — fake token hai, is liye n8n ki real WhatsApp
> call fail hoti hai. Ahem baat: `workflowId` + `n8nId` maujood hone ka matlab
> credential **inject hokar deploy** ho gaya. ✅

### Check 6 — List: metadata only, no secret leak

```powershell
$list = Invoke-RestMethod -Uri http://localhost:3001/api/credentials -Headers $H
$list.data | Select-Object app,credentialName,n8nCredentialId,managed | Format-Table
if (($list | ConvertTo-Json -Depth 5) -match "EAAGfakeToken") { Write-Host "LEAK!" } else { Write-Host "no secret in response" }
```

Expected: `no secret in response`

### Check 7 — Workflow detail mein required/missing credentials

```powershell
$d = Invoke-RestMethod -Uri "http://localhost:3001/api/workflows/$($run.workflowId)" -Headers $H
$d.credentials | ConvertTo-Json -Depth 5 -Compress
```

Expected: `required` mein WhatsApp spec (fields ke saath), `missing: []` (linked hai).

**DB definition clean hai?** (credential IDs database mein save nahi honi chahiye):

```sql
SELECT id, JSON_EXTRACT(definition, '$.nodes[*].credentials') AS creds
FROM workflows WHERE id = <workflowId>;
```

Expected: `creds` **NULL** — real credential id sirf n8n ke deployed workflow mein hota hai.

### Check 8 — Delete credential → execute par 409 gate

```powershell
$del = Invoke-RestMethod -Uri http://localhost:3001/api/credentials/whatsapp -Method Delete -Headers $H
Write-Host "deleted=$($del.deleted) n8nDeleted=$($del.n8nDeleted)"

try {
  Invoke-RestMethod -Uri "http://localhost:3001/api/workflows/$($run.workflowId)/execute" -Method Post -Headers $H -ContentType "application/json" -Body '{}'
} catch {
  $r = $_.ErrorDetails.Message | ConvertFrom-Json
  Write-Host "execute status=$($_.Exception.Response.StatusCode.value__) needs=$($r.needsCredentials.app -join ', ')"
}
```

Expected:
```
deleted=True n8nDeleted=True
execute status=409 needs=whatsapp
```

---

## Verifier checklist

| # | Check | Expected |
|---|-------|----------|
| 1 | Bina credentials generate-and-deploy | `409` + needsCredentials + preview; n8n mein kuch deploy nahi |
| 2 | `skipApps: ["<app>"]` | `422` + `skippedApps[]` |
| 3 | Credential-free workflow | Success; stages mein `credentials: ok` |
| 4 | Secret leak | Kisi bhi API response mein token/password nahi |
| 5 | Injection | DB definition mein credential ids nahi; n8n deployed workflow mein real id |
| 6 | Detail endpoint | `credentials.required` sahi, `missing` linking ke hisaab se |
| 7 | Execute gate | Credential delete ke baad execute → `409` |
| 8 | Delete | Managed credential n8n + DB dono se remove |
| 9 | OAuth apps | gmail/googleSheets/instagram create nahi hote — hint + `n8nCredentialId` se link |

---

## Troubleshooting

| Issue | Matlab / Fix |
|-------|--------------|
| `502 ... credential scopes` | n8n API key mein credential permissions add karo (n8n → Settings → n8n API) |
| `400 Unknown app` | `GET /api/credentials/types` se valid `app` names dekho |
| `400 Missing required field(s)` | `needsCredentials[].fields` ya `/types` follow karo |
| `400 Credential type mismatch` | `n8nCredentialId` ka n8n type app ke expected type se match nahi karta |
| Baar baar `409` | Credential link karo, ya jaan boojh kar `skipApps` bhejo |
| `422 skipped app` | Prompt se woh app hata kar dobara generate karo |
| `verify-credentials` fail on "exists in n8n" | n8n chalu hai? API key ke scopes theek hain? |
| Execution fake token se fail | **Expected** — fake token se real API call fail hona normal hai |
| `verify:phase4/5` mein 502/504 | Gemini transient error — script khud retry karti hai (20s gap) |

---

## Notes

- **Existing behaviour preserved:** credential-free workflows (webhook → set → respond)
  pehle ki tarah deploy + execute hote hain — gate sirf tab lagta hai jab workflow mein
  kisi supported app ka node ho.
- **Slack normalization:** AI-generated Slack message nodes ab deploy se pehle normalize
  hote hain (resource locator format + node version), taake validation fail na ho.
- **Manual OAuth apps:** gmail, googleSheets, instagram n8n mein pehle connect karo,
  phir `POST /api/credentials` with `{ "app": "<app>", "n8nCredentialId": "<id>" }`.
