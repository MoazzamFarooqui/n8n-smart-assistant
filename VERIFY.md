# n8n Smart Assistant — Final Verification Guide

Full stack verification checklist (Docker + MySQL + Backend + n8n + Gemini + Frontend).

- **Project path:** `C:\Users\USER\Desktop\n8n-docker-check`
- **Repo:** https://github.com/MoazzamFarooqui/n8n-smart-assistant
- **Branch:** `upload/complete-project`
- **Last verified:** 2026-10-27

---

## Ports / Services

| Service | Container | Host URL / Port | Notes |
|---|---|---|---|
| Frontend (Vite) | `n8n-frontend` | http://localhost:5173 | standalone container, not in compose |
| Backend (Express) | `n8n-backend` | http://localhost:3001 | `/api/health`, `/api/docs` |
| n8n | `n8n-app` | http://localhost:5678 | API: `/api/v1` |
| MySQL | `n8n-mysql` | `localhost:3308` | container internal `3306` |

> ⚠️ Host port **3308** is intentional. `3306` (local MySQL) and `3307` (other project) are already in use on this machine.

---

## Step 0 — Prerequisites

1. **Docker Desktop** open ho aur engine chal raha ho.
2. `.env` file project root mein mojood ho (`C:\Users\USER\Desktop\n8n-docker-check\.env`).
3. Terminal project root mein ho:

```powershell
cd C:\Users\USER\Desktop\n8n-docker-check
```

---

## Step 1 — Docker engine check

```powershell
docker --version
docker compose version
docker info --format "{{.ServerVersion}} | {{.OperatingSystem}}"
```

**Expected:** version numbers + `Docker Desktop`.

Agar error aaye → Docker Desktop start karein aur 1–2 minute wait karein.

---

## Step 2 — Compose config valid

```powershell
docker compose config --quiet
```

**Expected:** kuch print na ho.

> `the attribute version is obsolete` warning aati hai — **harmless** hai, ignore karein.

---

## Step 3 — Stack start

```powershell
docker compose up -d
```

Ye `mysql`, `n8n` aur `backend` start karta hai. Pehli baar 1–3 minute lag sakte hain.

---

## Step 4 — Containers ka status

```powershell
docker compose ps
```

**Expected:**

| NAME | STATUS |
|---|---|
| n8n-mysql | Up (healthy) |
| n8n-backend | Up (healthy) |
| n8n-app | Up |

Agar `n8n-backend` → `Exited (1)` ho (MySQL ready hone se pehle migrate chala jaye):

```powershell
docker compose up -d backend
docker compose logs --tail 40 backend
```

---

## Step 5 — Backend + DB health

```powershell
Invoke-RestMethod http://localhost:3001/api/health | ConvertTo-Json
```

**Expected:**

```json
{
  "status": "ok",
  "db": "ok",
  "timestamp": "2026-10-27T..."
}
```

---

## Step 6 — Database tables

```powershell
$pw = (Select-String -Path .env -Pattern '^DB_PASSWORD=(.*)$').Matches.Groups[1].Value
docker compose exec -T mysql mysql -u n8n_user -p"$pw" -e "SHOW TABLES;" n8n_smart_assist
```

**Expected:**

```
Tables_in_n8n_smart_assist
chat_messages
chat_sessions
user_credentials
users
workflow_executions
workflows
```

> `Using a password on the command line interface can be insecure` warning — harmless.

---

## Step 7 — n8n API key

```powershell
docker exec n8n-backend node -e "fetch('http://host.docker.internal:5678/api/v1/workflows',{headers:{'X-N8N-API-KEY':process.env.N8N_API_KEY}}).then(async r=>console.log('STATUS='+r.status))"
```

**Expected:** `STATUS=200`

| Result | Matlab |
|---|---|
| `STATUS=200` | ✅ key valid |
| `STATUS=401` | key is n8n instance ki nahi / delete ho chuki |
| `STATUS=403` | key ke scopes kam hain (workflow/credential scopes add karein) |

Agar 401 aaye → n8n UI: http://localhost:5678/settings/api → **Create an API key** (Select all scopes) → `.env` mein `N8N_API_KEY` update → `docker compose up -d --force-recreate backend`.

---

## Step 8 — Gemini key

```powershell
docker exec n8n-backend node -e "console.log('gemini_len='+(process.env.GEMINI_API_KEY||'').length)"
```

**Expected:** `gemini_len=53`

Live test (host se):

```powershell
$g = ((Select-String -Path .env -Pattern '^GEMINI_API_KEY=(.*)$').Matches.Groups[1].Value).Trim()
Invoke-RestMethod "https://generativelanguage.googleapis.com/v1beta/models?key=$g" -Method GET | Select-Object -ExpandProperty models | Select-Object -First 3 -ExpandProperty name
```

Model list aaye = key valid. `401` aaye = key invalid → https://aistudio.google.com/apikey se nayi banayein.

---

## Step 9 — Frontend

```powershell
docker ps --filter name=n8n-frontend --format "{{.Names}} {{.Status}}"
```

**Expected:** `n8n-frontend Up ...`

Agar `Up` na ho:

```powershell
docker start n8n-frontend
```

Agar container exist hi na kare:

```powershell
cd C:\Users\USER\Desktop\n8n-docker-check\frontend
docker build -t n8n-frontend .
docker run -d --name n8n-frontend -p 5173:5173 n8n-frontend
```

---

## Step 10 — Browser checks (manual)

| URL | Kya check karein |
|---|---|
| http://localhost:5173 | Frontend khule, register/login chale |
| http://localhost:5173 → Generator | Sirf **2 example chips** dikhein:<br>1. Slack `#new-channel` message<br>2. Gmail webhook email |
| http://localhost:3001/api/health | `status: ok` |
| http://localhost:3001/api/docs | Swagger UI khule |
| http://localhost:5678 | n8n dashboard, owner account bana hua |
| http://localhost:5678/settings/api | API key list mein `smart-assistant` mojood |

**n8n connection banner:** frontend par "Not connected" nahi aana chahiye.

---

## Step 11 — Git clean

```powershell
git status -sb
```

**Expected:**

```
## upload/complete-project...origin/upload/complete-project
```

Koi modified/untracked file list nahi honi chahiye.

---

## All-in-one quick check

```powershell
cd C:\Users\USER\Desktop\n8n-docker-check
docker compose up -d
docker compose ps
Invoke-RestMethod http://localhost:3001/api/health | ConvertTo-Json -Compress
docker exec n8n-backend node -e "fetch('http://host.docker.internal:5678/api/v1/workflows',{headers:{'X-N8N-API-KEY':process.env.N8N_API_KEY}}).then(async r=>console.log('n8n='+r.status))"
docker exec n8n-backend node -e "console.log('gemini_len='+(process.env.GEMINI_API_KEY||'').length)"
docker ps --filter name=n8n-frontend --format "{{.Names}} {{.Status}}"
git status -sb
```

---

## After PC restart

Frontend container ka restart policy set nahi hai, is liye restart ke baad manually chalana hoga:

```powershell
cd C:\Users\USER\Desktop\n8n-docker-check
docker compose up -d
docker start n8n-frontend
```

Optional (permanent, container setting only — koi file change nahi):

```powershell
docker update --restart unless-stopped n8n-frontend
docker update --restart unless-stopped n8n-backend
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `port is already allocated` | `.env` mein `DB_PORT=3308` rakhein (3306/3307 busy hain) |
| Backend `Exited (1)` | `docker compose up -d backend` (MySQL ready hone ke baad) |
| `n8n=401` | n8n UI se nayi API key banayein, `.env` update, backend recreate |
| `n8n=403` | API key ke scopes kam hain — Select all scopes |
| `gemini_len=0` ya 401 | https://aistudio.google.com/apikey se nayi key, `.env` update, backend recreate |
| `.env` change ke baad asar nahi | `docker compose up -d --force-recreate backend` (restart se env reload nahi hota) |
| Frontend purana code dikha raha hai | `docker rm -f n8n-frontend` phir `docker run ...` (image rebuild ke baad) |
| `docker compose` warning: `version is obsolete` | Ignore — harmless |
| Frontend 5173 not opening | `docker start n8n-frontend` |

---

## Final checklist

| Component | Check | Status |
|---|---|---|
| Docker engine | `docker info` | ✅ |
| Compose config | `docker compose config --quiet` | ✅ |
| MySQL (3308) | `Up (healthy)` | ✅ |
| Backend (3001) | `Up (healthy)`, `db: ok` | ✅ |
| DB tables | 6 tables present | ✅ |
| n8n (5678) | API `STATUS=200` | ✅ |
| Gemini AI | key length 53, models list 200 | ✅ |
| Frontend (5173) | container `Up`, page loads | ✅ |
| Generator examples | 2 new chips | ✅ |
| Git | clean, pushed to `upload/complete-project` | ✅ |

---

## Notes

- `.env` git-ignored hai — secrets commit nahi hote.
- API keys chat/screenshots mein share na karein; leak ho jaye to n8n/Gemini console se rotate karein.
- n8n API key ki expiry: **2026-11-26** (us ke baad nayi banani hogi).
