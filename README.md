# n8n Smart Assistant - Backend

Express + TypeScript + MySQL + JWT Auth + Google Gemini AI + n8n REST API

A backend that uses AI to explain, generate, validate, and fix n8n automation
workflows — and can deploy and run them in a real n8n instance. One prompt can
generate, audit, deploy, execute, and (if it fails) explain a workflow end-to-end.

## Quick Start

```bash
# 1. Install
npm install

# 2. Configure env
cp .env.example .env
# Edit .env with your MySQL credentials, GEMINI_API_KEY and N8N settings

# 3. Run migrations (5 tables + Phase 4 columns)
npm run db:migrate

# 4. Start server
npm run dev
```

## Phase 1 - Foundation (Auth + Database)

JWT authentication and MySQL storage (5 tables: `users`, `workflows`,
`chat_sessions`, `chat_messages`, `workflow_executions`).

| Method & Path | Feature |
|---------------|---------|
| `POST /api/auth/register` | Create account, returns JWT token |
| `POST /api/auth/login` | Login, returns JWT token |
| `GET /api/auth/me` | Current user profile (requires token) |
| `GET /api/health` | Server + DB health check |

```bash
# Example
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@team.com","password":"123456"}'
# → 201 {"user":{"id":1,"email":"test@team.com"},"token":"..."}
```

## Phase 2 - AI Core (Google Gemini)

8 AI features under `/api/ai` (all require a JWT token):

| Method & Path | Feature |
|---------------|---------|
| `POST /api/ai/chat` | AI Mentor Chatbot |
| `POST /api/ai/explain-node` | Explain This Node |
| `POST /api/ai/explain-workflow` | JSON Workflow Explainer |
| `POST /api/ai/generate-workflow` | AI Workflow Generator |
| `POST /api/ai/validate-workflow` | Workflow Validation |
| `POST /api/ai/translate-error` | Error Message Translator |
| `POST /api/ai/compatibility` | Integration Compatibility Advisor |
| `POST /api/ai/security-audit` | Workflow Security Auditor |

Includes model fallback and automatic retries for Gemini rate limits.

```bash
npm run dev           # terminal 1
npm run verify:phase2 # terminal 2 → 15/15 passed
```

## Phase 3 - n8n REST API Integration

Control a real n8n instance through our API (all require a JWT token):

| Method & Path | Feature |
|---------------|---------|
| `GET /api/n8n/status` | Check n8n config + reachability |
| `GET /api/n8n/workflows` | List workflows in n8n |
| `POST /api/n8n/workflows` | Create a workflow in n8n |
| `PUT /api/n8n/workflows/:id` | Update a workflow |
| `GET /api/n8n/workflows/:id` | Get one workflow |
| `PATCH /api/n8n/workflows/:id/activate` | Activate a workflow |
| `PATCH /api/n8n/workflows/:id/deactivate` | Deactivate a workflow |
| `POST /api/n8n/workflows/:id/execute` | Run via its Webhook trigger |
| `GET /api/n8n/executions` | List execution results |
| `GET /api/n8n/executions/:id` | View execution result / errors |
| `DELETE /api/n8n/workflows/:id` | Delete a workflow |

Requires n8n running locally (`n8n`, http://localhost:5678) and `N8N_API_KEY`
in `.env`. Note: n8n's public API has no direct "run workflow" endpoint, so
execution goes through the workflow's Webhook trigger — the workflow must be
**active** to run.

```bash
npm run dev            # terminal 1 (our server)
n8n                    # terminal 2 (n8n instance)
npm run verify:phase3  # terminal 3 → 14/14 passed
```

How to verify every Phase 3 feature step by step (with commands, expected
results, and n8n browser proofs): **[docs/PHASE3-VERIFICATION.md](docs/PHASE3-VERIFICATION.md)**

## Phase 4 - Automated Workflow Pipeline

One prompt → fully working workflow, in a single API call (requires a JWT token):

| Method & Path | Feature |
|---------------|---------|
| `POST /api/workflows/generate-and-deploy` | The whole pipeline: generate → validate → security audit → deploy to n8n → activate → execute → save to DB |

Pipeline stages:

1. **generate** — Gemini creates the workflow JSON (a Webhook entry point is guaranteed)
2. **validate** — AI validator checks structure (advisory, does not block)
3. **audit** — AI security audit (advisory, does not block)
4. **deploy** — workflow created in n8n + row saved in `workflows` (`n8n_workflow_id`, `prompt`)
5. **execute** — activated and triggered via its webhook

On execution success it returns the workflow's output. On failure it automatically
runs the **Error Message Translator** on the real n8n error and returns a plain-English
`errorAnalysis` — so a user who is missing credentials still gets a helpful explanation.
Workflows are also sanitized (Set-node formats normalized, unique webhook paths, stable
response mode) so AI-generated JSON actually runs.

```bash
npm run dev            # terminal 1 (our server)
n8n                    # terminal 2 (n8n instance)
npm run verify:phase4  # terminal 3 → 12/12 passed (runs 2 real pipelines, ~2-4 min)
```

How to verify every Phase 4 feature step by step (success path, error path, DB proof,
n8n browser proofs): **[docs/PHASE4-VERIFICATION.md](docs/PHASE4-VERIFICATION.md)**

## Phase 5 - Workflow Management CRUD

Manage your saved workflows end to end (all require a JWT token; every endpoint is
owner-scoped — other users get 404):

| Method & Path | Feature |
|---------------|---------|
| `GET /api/workflows` | Paginated list (`?page`, `?limit`, `?status=active\|inactive`, `?search=`) with execution counters |
| `GET /api/workflows/:id` | Detail: definition JSON + live n8n JSON + execution stats + recent executions |
| `GET /api/workflows/:id/executions` | Paginated execution history |
| `POST /api/workflows/:id/execute` | Re-execute (auto-activates; records the run; AI error analysis on failure) |
| `PATCH /api/workflows/:id/activate` | Activate in n8n + DB |
| `PATCH /api/workflows/:id/deactivate` | Deactivate in n8n + DB |
| `DELETE /api/workflows/:id` | Delete from n8n + DB (unpublishes first; executions cascade) |

Re-execution runs the deployed workflow through its webhook, saves every run in
`workflow_executions` (with the n8n execution id) and, when a run fails, stores an
AI-generated `error_analysis` — so failures come back as plain-English explanations.

```bash
npm run dev            # terminal 1 (our server)
n8n                    # terminal 2 (n8n instance)
npm run verify:phase5  # terminal 3 → 21/21 passed (runs 2 real workflows, ~3-5 min)
```

How to verify every Phase 5 feature step by step (list, detail, re-run, error
analysis, delete, ownership isolation): **[docs/PHASE5-VERIFICATION.md](docs/PHASE5-VERIFICATION.md)**

## Verification

| Command | What it checks | Expected |
|---------|----------------|----------|
| `npm run test:smoke` | All endpoints respond | 11/11 passed |
| `npm run verify:phase2` | All 8 AI skills + auth + validation | 15/15 passed |
| `npm run verify:phase3` | Full n8n lifecycle (create → update → activate → execute → results → delete) | 14/14 passed |
| `npm run verify:phase4` | Full pipeline against live Gemini + n8n (success path + failure analysis) | 12/12 passed |
| `npm run verify:phase5` | Full management CRUD against live Gemini + n8n (list → detail → re-run → toggle → delete) | 21/21 passed |

Step-by-step manual verification: **[docs/PHASE5-VERIFICATION.md](docs/PHASE5-VERIFICATION.md)** (Phase 5) · **[docs/PHASE4-VERIFICATION.md](docs/PHASE4-VERIFICATION.md)** (Phase 4) · **[docs/PHASE3-VERIFICATION.md](docs/PHASE3-VERIFICATION.md)** (Phase 3)

## Database Tables

- `users` - authentication
- `workflows` - saved workflows (+ `n8n_workflow_id`, `prompt` from Phase 4)
- `chat_sessions` - chat history
- `chat_messages` - messages
- `workflow_executions` - execution logs (+ `n8n_execution_id`, `error_analysis` from Phase 4)

## Scripts

```bash
npm run dev           # Dev with hot reload
npm run build         # Compile to dist/
npm start             # Run production build
npm run db:migrate    # Run all SQL migrations (idempotent)
npm run test:smoke    # Quick check of all endpoints
npm run verify:phase2 # Full Phase 2 verification (15 checks)
npm run verify:phase3 # Full Phase 3 verification against n8n (14 checks)
npm run verify:phase4 # Full Phase 4 pipeline verification (12 checks)
npm run verify:phase5 # Full Phase 5 management CRUD verification (21 checks)
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| DB connection failed | Check MySQL running, `.env` credentials |
| Port 3001 in use | `lsof -ti:3001 \| xargs kill` (Mac/Linux) or `taskkill /PID <pid> /F` (Windows) |
| Register 500 | Migration not run → `npm run db:migrate` |
| n8n endpoints return 502/503 | Start n8n (`n8n`), check `N8N_API_KEY` in `.env`, restart server |
| Execute returns 409 | Workflow is not active → activate it first |
| Pipeline 502 at "generate" + 429 | Gemini rate limit (free tier) — wait and retry; fallback models are automatic |
| `Unknown column 'n8n_workflow_id'` | New migrations not applied → `npm run db:migrate` |
| Pipeline `status: "failed"` + credential error | Not a bug — read `errorAnalysis` or add credentials in n8n |
| Re-execute returns 404 | The workflow was deleted from n8n manually — generate/deploy it again |
