# n8n Smart Assistant - Backend (Phase 1)

Express + TypeScript + MySQL + JWT Auth

## Quick Start

```bash
# 1. Install
npm install

# 2. Configure env
cp .env.example .env
# Edit .env with your MySQL credentials

# 3. Run migration (creates 5 tables)
npm run db:migrate

# 4. Start server
npm run dev
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

## Deliverables

| Feature | Status |
|---------|--------|
| Express + TS server | ✅ |
| MySQL + migrations (5 tables) | ✅ |
| JWT Auth (register, login, me) | ✅ |
| Protected middleware | ✅ |
| Env config | ✅ |
| Health check | ✅ |
| CORS for frontend | ✅ |

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
npm run dev      # Dev with hot reload
npm run build    # Compile to dist/
npm start        # Run production build
npm run db:migrate  # Run SQL migration
```