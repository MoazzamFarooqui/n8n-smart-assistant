# Phase 2 — AI Core Service (Gemini Integration)

This phase adds the "brain" of the app. We connect the backend to Google Gemini
so the system can answer n8n questions and help build/understand workflows.

---

## 1. What we built (in simple words)

A set of **8 AI features**. Each one is an API endpoint. The frontend will call
these endpoints and show the AI answer to the user.

Every AI endpoint follows the same simple flow:

```
Frontend → Express route → Gemini service → Google Gemini → answer back
                ↑
        (checks JWT login first)
```

- **All 8 endpoints require login** (a valid JWT token). This keeps the API safe.
- The "rules/instructions" for each feature live in `src/services/gemini.ts` (called **system prompts**).
- The endpoint itself only: 1) checks the input, 2) builds the prompt, 3) calls Gemini, 4) returns the answer.

---

## 2. The 8 endpoints

Base URL: `http://localhost:3001`

| # | Method & Path | Feature (proposal) | What the user does |
|---|---------------|--------------------|--------------------|
| 1 | `POST /api/ai/chat` | 3.1 AI Mentor Chatbot | Asks n8n questions, gets answers |
| 2 | `POST /api/ai/explain-node` | 3.2 Explain This Node | Gives a node type → gets explanation + example |
| 3 | `POST /api/ai/explain-workflow` | 3.3 JSON Workflow Explainer | Pastes workflow JSON → gets step-by-step breakdown |
| 4 | `POST /api/ai/generate-workflow` | 3.4 AI Workflow Generator | Describes automation → gets n8n JSON |
| 5 | `POST /api/ai/validate-workflow` | 3.4.1 Workflow Validation | Checks JSON validity, fields, connections |
| 6 | `POST /api/ai/translate-error` | 3.5 Error Message Translator | Pastes error → gets plain English + fix |
| 7 | `POST /api/ai/compatibility` | 3.6 Integration Compatibility Advisor | Picks 2 nodes → tells if/how they connect |
| 8 | `POST /api/ai/security-audit` | 3.7 AI Workflow Security Auditor | Analyzes workflow → risks + recommendations |

**Every response looks like this:**
```json
{
  "response": "the AI text answer",
  "usage": { "promptTokens": 120, "completionTokens": 240, "totalTokens": 360 }
}
```

---

## 3. Request examples

> All requests need the header `Authorization: Bearer <token>`.

### 1) Chat
```bash
POST /api/ai/chat
{ "message": "What is a webhook node in n8n?",
  "history": [ { "role": "user", "content": "hi" }, { "role": "assistant", "content": "hello" } ] }
```
`history` is optional — send it to keep conversation context.

### 2) Explain node
```bash
POST /api/ai/explain-node
{ "nodeType": "n8n-nodes-base.httpRequest", "nodeName": "Get Users" }
```

### 3) Explain workflow
```bash
POST /api/ai/explain-workflow
{ "workflowJson": "{\"nodes\":[],\"connections\":{}}" }
```

### 4) Generate workflow
```bash
POST /api/ai/generate-workflow
{ "description": "Send a Slack message when a new Gmail email arrives",
  "nodes": ["Gmail Trigger", "Slack"] }
```

### 5) Validate workflow
```bash
POST /api/ai/validate-workflow
{ "workflowJson": "{\"nodes\":[],\"connections\":{}}" }
```

### 6) Translate error
```bash
POST /api/ai/translate-error
{ "error": "Cannot read properties of undefined (reading 'json')",
  "context": "HTTP Request node" }
```

### 7) Compatibility
```bash
POST /api/ai/compatibility
{ "sourceNode": "Gmail Trigger", "targetNode": "Slack" }
```

### 8) Security audit
```bash
POST /api/ai/security-audit
{ "workflowJson": "{\"nodes\":[{\"parameters\":{\"url\":\"http://api.example.com\"}}]}" }
```

---

## 4. Which file does what

| File | Purpose |
|------|---------|
| `src/services/gemini.ts` | Talks to Google Gemini. Holds the 8 **system prompts** + fallback models |
| `src/routes/ai.ts` | The 8 endpoints. Validates input (Zod) and calls the service |
| `src/config/env.ts` | Reads `GEMINI_API_KEY` and model settings from `.env` |
| `src/app.ts` | Registers the routes under `/api/ai` |
| `scripts/smoke-test.ts` | Quick test that hits every endpoint |

---

## 5. How to test it

1. Make sure MySQL is running and the server is started:
   ```bash
   npm run dev
   ```
2. In another terminal, run the **full verification**:
   ```bash
   npm run verify:phase2
   ```
   It checks health, auth, all 8 AI features (and prints a preview of each AI
   answer), validation, and security. Expect `15 passed, 0 failed`.

   Or the shorter check:
   ```bash
   npm run test:smoke       # → 11/11 passed
   ```

3. Or test one endpoint by hand with curl (Windows PowerShell):
   ```powershell
   # 1. Register and copy the token
   curl.exe -X POST http://localhost:3001/api/auth/register `
     -H "Content-Type: application/json" `
     -d "{\"email\":\"a@a.com\",\"password\":\"123456\"}"

   # 2. Use the token
   curl.exe -X POST http://localhost:3001/api/ai/chat `
     -H "Content-Type: application/json" `
     -H "Authorization: Bearer PASTE_TOKEN_HERE" `
     -d "{\"message\":\"What is n8n?\"}"
   ```

---

## 6. Configuration (`.env`)

```env
GEMINI_API_KEY=your_key_from_https://aistudio.google.com/apikey
GEMINI_MODEL=gemini-3.1-flash-lite
GEMINI_FALLBACK_MODELS=gemini-flash-lite-latest,gemini-3.5-flash
GEMINI_MAX_OUTPUT_TOKENS=2048
GEMINI_TEMPERATURE=0.7
GEMINI_TIMEOUT_MS=10000
GEMINI_MAX_RETRIES=1
```

- **Why fallback models?** Free Gemini sometimes returns `503 (busy)` or times out.
  If the main model fails, the code automatically tries the next one so users still
  get an answer. This is why a request may occasionally take longer.
- **Timeout & retries:** each attempt is capped at `GEMINI_TIMEOUT_MS` (10s). A
  timeout/network error is treated as retryable and moves to the next model.
- Older `gemini-1.5-flash` is retired, so we use current models.

---

## 7. Errors you may see

| Status | Meaning | Fix |
|--------|---------|-----|
| `400` | Bad input (missing/wrong field) | Send the fields shown in section 3 |
| `401` | No/invalid token | Login first, use the returned token |
| `500` | AI failed (usually Gemini busy/rate-limited) | Wait a few seconds and retry |

**Note on Gemini free tier:** it has a low requests-per-minute limit. Firing many
requests in a burst (like a test script) can trigger a `500`. Normal app usage is
fine. The test scripts add a short pause between calls for this reason.

---

## 8. Status

### Done ✅
- Gemini service wrapper with retry/fallback
- 8 system prompts
- 8 working REST endpoints
- Input validation (Zod) on every endpoint
- Error handling with clear messages
- JWT protection on all AI endpoints
- Smoke test (`npm run test:smoke`) — 11/11 passing

### Remaining / next
- Response time: typically **1–4s** (well within our **5–6s** acceptable limit).
  If Google is busy it can be a bit higher; billing or caching fixes that.
- Optional: save AI chat history to the `chat_sessions` / `chat_messages` tables
  (tables already exist from Phase 1) so users can revisit old chats.
- Optional: stream responses token-by-token for faster perceived speed.

---

## 9. Proposal mapping

| Proposal feature | Endpoint | Status |
|------------------|----------|--------|
| 3.1 AI Mentor Chatbot | `/api/ai/chat` | ✅ |
| 3.2 Explain This Node | `/api/ai/explain-node` | ✅ |
| 3.3 JSON Workflow Explainer | `/api/ai/explain-workflow` | ✅ |
| 3.4 AI Workflow Generator | `/api/ai/generate-workflow` | ✅ |
| 3.4.1 Workflow Validation | `/api/ai/validate-workflow` | ✅ |
| 3.5 Error Message Translator | `/api/ai/translate-error` | ✅ |
| 3.6 Integration Compatibility Advisor | `/api/ai/compatibility` | ✅ |
| 3.7 AI Workflow Security Auditor | `/api/ai/security-audit` | ✅ |