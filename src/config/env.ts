import dotenv from 'dotenv';

dotenv.config();

function required(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3307', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD ?? 'root',
    database: process.env.DB_NAME || 'n8n_smart_assist',
  },
  jwt: {
    secret: required('JWT_SECRET'),
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite',
    fallbackModels: (process.env.GEMINI_FALLBACK_MODELS || 'gemini-flash-lite-latest,gemini-3.6-flash,gemini-3.5-flash')
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean),
    maxOutputTokens: parseInt(process.env.GEMINI_MAX_OUTPUT_TOKENS || '2048', 10),
    temperature: parseFloat(process.env.GEMINI_TEMPERATURE || '0.7'),
    timeoutMs: parseInt(process.env.GEMINI_TIMEOUT_MS || '10000', 10),
    maxRetries: parseInt(process.env.GEMINI_MAX_RETRIES || '1', 10),
  },
  n8n: {
    apiUrl: process.env.N8N_API_URL || 'http://localhost:5678/api/v1',
    apiKey: process.env.N8N_API_KEY || '',
  },
};
