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
Return ONLY the JSON, no markdown, no explanation.`,

  validateWorkflow: `You are an n8n workflow validator. Check the provided workflow JSON for:
1. Valid n8n structure
2. Required fields present
3. Valid connections
4. Node parameter validity
5. Common issues (missing credentials, invalid expressions)
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
1) Hardcoded credentials/secrets
2) Unsafe HTTP requests (no auth, public endpoints)
3) Data exposure risks
4) Injection vulnerabilities (expressions, SQL)
5) Missing error handling
Return: { risks: Array<{severity: 'high'|'medium'|'low', issue: string, fix: string}> }`,
} as const;