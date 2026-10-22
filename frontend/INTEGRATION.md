# Frontend <-> Backend integration

Set up
1. `cp .env.example .env`  (VITE_API_URL=http://localhost:3001/api)
2. `npm install`, then `npm run dev`  -> http://localhost:5173
3. Backend, MySQL and (for deploy/run) n8n must be running.

What was added (learning pages are unchanged)
- `src/services/api.js`          all backend calls, JWT header, timeouts, friendly errors, 401 handling
- `src/context/AppContext.jsx`   login state + toast messages
- `src/pages/Landing.jsx`        home page with Log in / Sign up (shown first)
- `src/pages/Generator.jsx`      Build with AI -> POST /workflows/generate-and-deploy
- `src/pages/MyWorkflows.jsx`    list, run, activate/deactivate, delete, execution history, AI error analysis
- `src/pages/AITools.jsx`        explainer, validator, security auditor, error translator, compatibility checker
- `src/pages/Account.jsx`        user info, connection check, log out
- `src/components/Sheet.jsx`     bottom sheet, safe markdown renderer, AI action sheet
- `src/components/ErrorBoundary.jsx`  no blank screen on unexpected errors
- Updated: App.jsx (auth gate + nav), AIAssistant.jsx (now uses /api/ai/chat, no Groq key), Nodes.jsx (Explain this node),
  Workflows.jsx (AI security check), Dashboard.jsx (entry tiles), main.jsx, index.html
