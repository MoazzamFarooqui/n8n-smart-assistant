# Frontend Integration Guide — Credentials Gate

**Branch:** `fix/credentials-gate`

Ye guide frontend team ke liye hai — credentials gate ke saath integrate karte waqt
kya dehan rakhna hai. Backend ab workflow deploy karne se **pehle** user se app
credentials maangta hai; is liye frontend ko `409` ko ek normal UX state samajhna
hai, error nahi.

---

## 1. Flow — sab se pehle yeh samajh lo

```
User prompt likhta hai
        ↓
POST /api/workflows/generate-and-deploy
        ↓
   ┌────────────┴────────────┐
 200 OK                    409 (credentials missing)
   ↓                          ↓
Success screen          Preview + Credential form dikhao
   ↓                          ↓
                       User credentials bhare
                              ↓
                    POST /api/credentials
                              ↓
                    Wohi prompt dobara bhejo
```

> **Sab se important baat:** credential add karne ke baad user ko **same prompt
> dobara** bhejna hoga. Pehla workflow preview sirf dikhane ke liye hai —
> automatically deploy nahi hota.

---

## 2. Naye endpoints (credentials ke liye)

| Endpoint | Kaam | Response |
|----------|------|----------|
| `GET /api/credentials/types` | Kaunse apps supported hain + unke fields | `{ data: [spec...], apps: ["telegram","whatsapp",...] }` |
| `GET /api/credentials` | User ke linked credentials (secrets ke baghair) | `{ data: [{app, label, credentialName, n8nCredentialId, managed}] }` |
| `GET /api/credentials/available?type=whatsAppApi` | n8n mein jo credentials pehle se hain (link karne ke liye) | `{ data: [{id, name, type, app}] }` |
| `POST /api/credentials` | Naya credential banao **ya** existing link karo | `201` (naya) / `200` (update) |
| `DELETE /api/credentials/:app` | Unlink karo | `{ deleted: true, n8nDeleted: true/false }` |

**Naya credential banane ka body:**

```json
{
  "app": "whatsapp",
  "name": "My WhatsApp",
  "data": { "accessToken": "...", "businessAccountId": "123456789012345" }
}
```

**Existing n8n credential link karne ka body:**

```json
{ "app": "gmail", "n8nCredentialId": "abc123" }
```

---

## 3. Sab se ahem response: 409 (naya behaviour)

Jab workflow ko credential chahiye aur user ke paas nahi hai, to backend `409`
deta hai. **Yeh error nahi, ek UX state hai** — isko aise handle karo:

```json
{
  "error": "Credentials required before this workflow can run: WhatsApp...",
  "stage": "credentials",
  "needsCredentials": [
    {
      "app": "whatsapp",
      "label": "WhatsApp",
      "creatable": true,
      "fields": [
        { "key": "accessToken", "label": "Access token", "type": "password", "required": true },
        { "key": "businessAccountId", "label": "Business account ID", "type": "text", "required": true, "placeholder": "123456789012345" }
      ]
    }
  ],
  "workflowPreview": { "name": "...", "nodes": ["..."], "connections": {} }
}
```

**Frontend ko kya karna hai:**

1. Ek **modal/screen** kholo: "Is workflow ke liye credentials chahiye"
2. `workflowPreview` se workflow ka naam/nodes dikha do (user ko lage ke kaam ho
   gaya hai, bas credential baqi hai)
3. `needsCredentials[]` se **dynamic form** banao — har field ka `type` dekho:
   - `password` → password input
   - `text` → normal text input
   - `number` → numeric input
   - `boolean` → checkbox
   - `required: true` → validation lagao, `placeholder` dikhao
4. Form submit → `POST /api/credentials` (har app ke liye alag call)
5. User ko button do: **"Try Again"** → wohi prompt dobara bhejo

---

## 4. 422 response (skip wala case)

Agar request mein `skipApps` bheja gaya aur workflow phir bhi us app ko maangta hai:

```json
{
  "error": "This workflow needs Telegram, which you chose to skip...",
  "stage": "credentials",
  "skippedApps": ["telegram"]
}
```

Frontend: user ko bolo *"Aapne Telegram skip kiya tha, is liye ye workflow nahi ban
sakta — prompt change karo ya skip hatado."*

`skipApps` bhejna **optional** hai — sirf tab bhejo jab UI mein "skip this app" ka
option do.

---

## 5. Purane endpoints mein kya badla

**Workflow detail** — `GET /api/workflows/:id` ab yeh bhi deta hai:

```json
"credentials": {
  "required": [ { "app": "whatsapp", "label": "WhatsApp", "fields": ["..."] } ],
  "missing": ["whatsapp"]
}
```

→ Detail page pe badge dikhao: linked / missing

**Execute button** — `POST /api/workflows/:id/execute` bhi ab `409` de sakta hai:

```json
{ "error": "Credentials required...", "workflowId": 12, "needsCredentials": ["..."] }
```

→ Same credential modal kholo, add karo, phir user **dobara Execute** dabaye.

---

## 6. Dehan rakhne wali baatein (checklist)

| # | Baat |
|---|------|
| 1 | **Secrets kabhi wapas mat maango** — list mein sirf `credentialName` + `n8nCredentialId` aata hai, token nahi. Form hamesha khali rakho. |
| 2 | **OAuth apps** (`creatable: false`) — gmail, googleSheets, instagram. Inka form **mat** dikhao; `hint` dikhao (*"n8n mein connect karo"*) + `GET /available` se list laa kar `n8nCredentialId` se link karne ka option do. |
| 3 | **409 ko crash mat samjho** — ye normal flow ka hissa hai. Alag "credentials needed" UI state rakho. |
| 4 | **Delete ka warning** — `n8nDeleted: true` matlab n8n se bhi delete ho gaya. UI mein confirm dialog: *"Ye n8n se bhi delete hoga"*. |
| 5 | **Auth** — sab endpoints (`/api/credentials/*` bhi) par `Authorization: Bearer <token>` zaroori hai. |
| 6 | **Retry zaroori** — credential add karne ke baad wohi prompt dobara bhejna hai; preview khud deploy nahi hota. |
| 7 | **Loading time** — generate-and-deploy mein AI call hoti hai, **1 minute tak** lag sakta hai. Spinner + "AI workflow bana raha hai..." dikhao. |
| 8 | **Credential-free workflows** — agar workflow ko koi app credential nahi chahiye (sirf webhook → set), to 409 nahi aayega, seedha success milega. |
| 9 | **`POST /api/credentials` response** — 201 = naya bana, 200 = pehle wala update hua. Dono ko success treat karo. |
| 10 | **Delete path mein app name** — `/api/credentials/whatsapp` (app slug, ID nahi — list se `app` field uthao). |

---

## 7. Error statuses — ek nazar mein

| Status | Matlab | UI kya kare |
|--------|--------|-------------|
| `200` | Sab theek | Success screen |
| `201` | Credential create hua | Modal band, retry button |
| `400` | Galat app / missing field / invalid body | Form ke saath error dikhao (response ka `error`) |
| `409` | Credentials chahiye | Credential modal kholo |
| `422` | Skipped app chahiye | "Prompt change karo" message |
| `502/504` | AI/n8n ka masla | *"Try again"* button (transient ho sakta hai) |

---

## Reference

- Backend verification steps: `docs/CREDENTIALS-VERIFICATION.md`
- Supported apps + required fields hamesha `GET /api/credentials/types` se lo —
  frontend mein hardcode mat karo.
