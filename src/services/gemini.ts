import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { config } from '../config/env.js';

let genAI: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI {
  if (!genAI) {
    if (!config.gemini.apiKey) {
      throw new Error('GEMINI_API_KEY not configured');
    }
    genAI = new GoogleGenerativeAI(config.gemini.apiKey);
  }
  return genAI;
}

export interface AIResponse {
  text: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

const RETRYABLE_STATUS = new Set([429, 500, 503, 504]);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isRetryable(err: any): boolean {
  const status = err?.status;
  if (typeof status === 'number') {
    return RETRYABLE_STATUS.has(status);
  }
  // No HTTP status => likely a timeout / network / abort error. Retry these too.
  return true;
}

async function generateWithModel(
  modelName: string,
  fullPrompt: string,
  thinking: boolean
): Promise<AIResponse> {
  const generationConfig: any = {
    maxOutputTokens: config.gemini.maxOutputTokens,
    temperature: config.gemini.temperature,
  };
  if (thinking) {
    generationConfig.thinkingConfig = { thinkingBudget: 0 };
  }
  const model = getClient().getGenerativeModel(
    {
      model: modelName,
      generationConfig,
    },
    { timeout: config.gemini.timeoutMs }
  );
  const result = await model.generateContent(fullPrompt);
  const response = result.response;
  const usage = response.usageMetadata
    ? {
        promptTokens: response.usageMetadata.promptTokenCount,
        completionTokens: response.usageMetadata.candidatesTokenCount,
        totalTokens: response.usageMetadata.totalTokenCount,
      }
    : undefined;
  return { text: response.text(), model: modelName, usage };
}

async function generateWithRetry(
  modelName: string,
  fullPrompt: string,
  attempts: number,
  thinking: boolean
): Promise<AIResponse> {
  let lastError: any;
  for (let i = 0; i < attempts; i++) {
    try {
      return await generateWithModel(modelName, fullPrompt, thinking);
    } catch (err: any) {
      lastError = err;
      if (!isRetryable(err) || i === attempts - 1) {
        throw err;
      }
      await sleep(300 * (i + 1));
    }
  }
  throw lastError;
}

export async function callGemini(
  systemPrompt: string,
  userPrompt: string
): Promise<AIResponse> {
  const fullPrompt = `${systemPrompt}\n\nUser: ${userPrompt}`;
  const models = [config.gemini.model, ...config.gemini.fallbackModels];

  let lastError: any;
  for (const modelName of models) {
    for (const thinking of [true, false]) {
      try {
        return await generateWithRetry(modelName, fullPrompt, config.gemini.maxRetries, thinking);
      } catch (err: any) {
        lastError = err;
        if (thinking && err?.status === 400) {
          console.warn(`Model ${modelName} rejected thinkingConfig (400) — retrying without thinking...`);
          continue;
        }
        if (err?.status === 400 || isRetryable(err)) {
          console.warn(`Model ${modelName} unavailable (${err?.status ?? err?.message ?? 'error'}), trying next fallback...`);
          break;
        }
        throw err;
      }
    }
  }
  throw lastError;
}

export const SYSTEM_PROMPTS = {
  chat: `You are an n8n expert assistant. Help users with n8n workflows, nodes, expressions, and best practices. 
Be concise, practical, and provide working examples. Focus on n8n-specific solutions.`,

  explainNode: `You are an n8n expert. Explain the given node in simple terms.
Provide: 1) What it does, 2) Key parameters, 3) Common use cases, 4) Simple example.
Keep it beginner-friendly and practical.`,

  explainWorkflow: `You are an n8n expert. Analyze the provided workflow JSON and explain it step by step.
Provide: 1) Overall purpose, 2) Node-by-node breakdown, 3) Data flow, 4) Potential issues.
Be clear and structured.`,

  generateWorkflow: `You are an n8n workflow generator. Create a valid n8n workflow JSON from the user's description.
Requirements:
- Valid n8n workflow structure (nodes, connections)
- Use appropriate node types
- Include necessary parameters
- Add helpful comments in node names
- Never add a "credentials" field to any node and never invent credential ids; the platform injects real credentials after the user provides them
- Always use responseMode "lastNode" on any Webhook node — never use "responseNode"
- Do NOT include a "Respond to Webhook" node (n8n-nodes-base.respondToWebhook)
- Do NOT include Error Trigger nodes
- For sending Discord messages via webhook, use node type "n8n-nodes-base.httpRequest" with method POST, url set to the Discord webhook URL placeholder "DISCORD_WEBHOOK_URL", and JSON body {"content": "<message text>"}. Do NOT use n8n-nodes-base.discord node type.
- For Gmail, use node type "n8n-nodes-base.gmail" with typeVersion 2.2 and parameters: resource "message", operation "send", sendTo "<recipient email>", subject "<subject>", message "<body>", options {"emailType": "text"}. Do NOT use httpRequest for Gmail.
- For Google Calendar, use node type "n8n-nodes-base.googleCalendar" with typeVersion 1.3 and set "calendar" to "primary" (or the calendar email if the user gives one). To create an event use resource "event", operation "create", start "={{ $now.plus({ days: 1 }).set({ hour: 10, minute: 0, second: 0 }).toISO() }}" (or the exact ISO date-time the user gave), end the same way one hour later, and additionalFields {"summary": "<title>", "description": "<details>"}. To list events use resource "event", operation "getAll", returnAll false, limit 20, timeMin "={{ $now.startOf('day').toISO() }}" and timeMax "={{ $now.endOf('day').toISO() }}" (timeMin and timeMax are top-level parameters, NOT inside options). To check if a time slot is free use resource "calendar", operation "availability", timeMin and timeMax as ISO date-times. Do NOT use httpRequest for Google Calendar.
- For Google Drive, use node type "n8n-nodes-base.googleDrive" with typeVersion 3. To create a text file use resource "file", operation "createFromText", name "<file name with extension, e.g. notes.txt>", content "<text>" (add options {"convertToGoogleDocument": true} to make a Google Doc instead). To create a folder use resource "folder", operation "create", name "<folder name>". To find files use resource "fileFolder", operation "search", searchMethod "name", queryString "<name>", returnAll false, limit 20. Only set folderId when the user gives a real folder ID. Do NOT use httpRequest for Google Drive.
- For Google Docs, use node type "n8n-nodes-base.googleDocs" with typeVersion 2. To create a document use operation "create" with title "<title>". To create a document that already contains text, use a Docs "create" node followed by a Docs "update" node whose documentURL is "={{ $json.id }}". To append text to an existing document use operation "update", documentURL "<document URL or ID>", actionsUi {"actionFields": [{"object": "text", "action": "insert", "text": "<text>"}]}. To read a document use operation "get" with documentURL "<document URL or ID>". Do NOT use httpRequest for Google Docs.
- For sending email over SMTP, use node type "n8n-nodes-base.emailSend" with typeVersion 2.1 and parameters: fromEmail "<sender>", toEmail "<recipient>", subject "<subject>", text "<body>".
- Google Sheets nodes (n8n-nodes-base.googleSheets) MUST include a complete "columns" parameter. Never omit it. Use this exact shape:
  "columns": {
    "mappingMode": "defineBelow",
    "value": { "<ColumnHeader>": "<value for that column>", ... },
    "matchingColumns": [],
    "schema": [
      { "id": "<ColumnHeader>", "displayName": "<ColumnHeader>", "required": false, "defaultMatch": false, "canBeUsedToMatch": true, "type": "string", "removed": false }
    ]
  }
  Rules for that parameter:
  * "value" must have one key per column header the user asked for, spelled exactly as the user wrote it (case-sensitive, no extra spaces).
  * "schema" must contain one entry per key in "value", with "id" and "displayName" equal to that key.
  * When the user gives literal values (e.g. Name: Ali), put the literal string in "value". When the user references incoming webhook fields, use the n8n expression form "={{ $json.<field> }}".
  * Set "sheetName" to {"__rl": true, "value": "<gid or tab name>", "mode": "id"} when a numeric gid is given, otherwise mode "name".
  * Set "documentId" to {"__rl": true, "value": "<spreadsheet id>", "mode": "id"}.
Return ONLY the JSON, no markdown, no explanation.`,

  validateWorkflow: `You are an n8n workflow validator. Check the provided workflow JSON for:
1. Valid n8n structure
2. Required fields present
3. Valid connections
4. Node parameter validity
5. Common issues (invalid expressions, wrong node types)
IMPORTANT — do NOT flag any of the following as issues:
- Credential IDs present on nodes — credentials are injected by the platform at runtime and are always valid; never flag credential references or unverified credential IDs
- Missing error handling nodes or Error Trigger nodes — the platform has its own error handling layer
- Webhook node using responseMode "lastNode" or "responseNode" — both are valid
- Missing "Respond to Webhook" node — intentionally omitted; platform handles responses
- Sender email addresses like "no-reply@..." or placeholder addresses — these are valid
Return: { valid: boolean, issues: string[], suggestions: string[] }`,

  translateError: `You are an n8n error translator. Convert technical n8n errors into plain English.
Provide: 1) What happened (simple), 2) Likely cause, 3) How to fix (steps).
Be practical and actionable.`,

  compatibility: `You are an n8n integration expert. Given two node types, explain:
1) Can they connect directly?
2) What data format each expects/outputs
3) How to connect them (transformations needed)
4) Common patterns
Be specific about data types and transformations.`,

  securityAudit: `You are an n8n security auditor. Analyze the workflow for:
1) Hardcoded credentials/secrets (API keys, tokens, passwords written in plain text)
2) Unsafe HTTP requests (sending data to untrusted or unexpected hosts)
3) Data exposure risks (sensitive data leaving to third parties)
4) Injection vulnerabilities (expressions, SQL, command injection)
5) Missing error handling

IMPORTANT — do NOT report any of the following. They are intentional platform behaviour, not risks:
- Public/unauthenticated Webhook Trigger nodes — this platform exposes demo webhooks on purpose and handles auth at its own gateway
- Static or sample values inside nodes (names, messages, test data) — these are demo inputs, not leaked secrets
- Placeholder emails such as test@example.com, no-reply@..., or sample domains
- Missing error handling, Error Trigger nodes, or "Continue On Fail" settings — the platform has its own error handling layer
- Credential references or injected credential IDs on nodes — credentials are injected at runtime and are always valid
- HTTP Request nodes that post to Discord/Slack webhook URLs supplied by the platform
- Webhook nodes using responseMode "lastNode" or "responseNode"
- Missing "Respond to Webhook" node — intentionally omitted

Only report genuine risks such as real API keys/tokens/passwords in plain text, injection flaws, or sensitive data being sent to an untrusted third-party host. If nothing genuine exists, return an empty risks array.
Return: { risks: Array<{severity: 'high'|'medium'|'low', issue: string, fix: string}> }`,
} as const;