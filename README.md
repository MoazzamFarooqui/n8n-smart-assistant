# n8n Smart Assistant - Backend

Express + TypeScript + MySQL + JWT Auth + Google Gemini AI

## Quick Start

```bash
# 1. Install
npm install

# 2. Configure env
cp .env.example .env
# Edit .env with your MySQL credentials and GEMINI_API_KEY

# 3. Run migration (creates 5 tables)
npm run db:migrate

# 4. Start server
npm run dev
```

## Phase 2 - AI Endpoints

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

Full details, request examples and file map: **[docs/PHASE2.md](docs/PHASE2.md)**

### Test everything

```bash
npm run dev         # terminal 1
npm run test:smoke  # terminal 2 → 11/11 passed
```

## Verify Phase 1

```bash
# Health check
curl http://localhost:3001/api/health
# → {"status":"ok","timestamp":"..."}

# Register
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@team.com","password":"123456"}'
# → 201 {"user":{"id":1,"email":"test@team.com"},"token":"..."}

# Login
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@team.com","password":"123456"}'
# → 200 {"user":{...},"token":"..."}

# Protected route
curl http://localhost:3001/api/auth/me \
  -H "Authorization: Bearer YOUR_TOKEN"
# → 200 {"user":{"id":1,"email":"test@team.com"}}
```

## Database Tables

- `users` - authentication
- `workflows` - saved workflows
- `chat_sessions` - chat history
- `chat_messages` - messages
- `workflow_executions` - execution logs

## Troubleshooting

| Issue | Fix |
|-------|-----|
| DB connection failed | Check MySQL running, `.env` credentials |
| Port 3001 in use | `lsof -ti:3001 \| xargs kill` (Mac/Linux) or `taskkill /PID <pid> /F` (Windows) |
| Register 500 | Migration not run → `npm run db:migrate` |

## Scripts

```bash
npm run dev           # Dev with hot reload
npm run build         # Compile to dist/
npm start             # Run production build
npm run db:migrate    # Run SQL migration
npm run test:smoke    # Quick check of all endpoints
npm run verify:phase2 # Full Phase 2 verification (15 checks)
```