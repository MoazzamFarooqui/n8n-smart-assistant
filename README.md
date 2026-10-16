# n8n Smart Assistant - Backend

Express + TypeScript + MySQL + JWT Auth + Google Gemini AI + n8n REST API

A backend that uses AI to explain, generate, validate, and fix n8n automation
workflows — and can deploy and run them in a real n8n instance.

## Quick Start

```bash
# 1. Install
npm install

# 2. Configure env
cp .env.example .env
# Edit .env with your MySQL credentials, GEMINI_API_KEY and N8N settings

# 3. Run migration (creates 5 tables)
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

## Verification

| Command | What it checks | Expected |
|---------|----------------|----------|
| `npm run test:smoke` | All endpoints respond | 11/11 passed |
| `npm run verify:phase2` | All 8 AI skills + auth + validation | 15/15 passed |
| `npm run verify:phase3` | Full n8n lifecycle (create → update → activate → execute → results → delete) | 14/14 passed |

Step-by-step manual verification for Phase 3: **[docs/PHASE3-VERIFICATION.md](docs/PHASE3-VERIFICATION.md)** (start services → check each feature one by one → n8n browser proofs → troubleshooting)

## Database Tables

- `users` - authentication
- `workflows` - saved workflows
- `chat_sessions` - chat history
- `chat_messages` - messages
- `workflow_executions` - execution logs

## Scripts

```bash
npm run dev           # Dev with hot reload
npm run build         # Compile to dist/
npm start             # Run production build
npm run db:migrate    # Run SQL migration
npm run test:smoke    # Quick check of all endpoints
npm run verify:phase2 # Full Phase 2 verification (15 checks)
npm run verify:phase3 # Full Phase 3 verification against n8n (14 checks)
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| DB connection failed | Check MySQL running, `.env` credentials |
| Port 3001 in use | `lsof -ti:3001 \| xargs kill` (Mac/Linux) or `taskkill /PID <pid> /F` (Windows) |
| Register 500 | Migration not run → `npm run db:migrate` |
| n8n endpoints return 502/503 | Start n8n (`n8n`), check `N8N_API_KEY` in `.env`, restart server |
| Execute returns 409 | Workflow is not active → activate it first |
