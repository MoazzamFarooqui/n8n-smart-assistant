export const openapiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'n8n Smart Assistant API',
    version: '1.0.0',
    description:
      'Auth, Gemini AI tools, n8n deployment, workflow pipeline, saved workflows, and chat history.',
  },
  servers: [{ url: '/api', description: 'Current server' }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    '/health': {
      get: {
        security: [],
        summary: 'Health check (server + MySQL)',
        responses: { 200: { description: 'OK' }, 503: { description: 'Database down' } },
      },
    },
    '/auth/register': {
      post: {
        security: [],
        summary: 'Register',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['email', 'password'], properties: { email: { type: 'string' }, password: { type: 'string' }, name: { type: 'string' } } } } },
        },
        responses: { 201: { description: 'Created' }, 409: { description: 'Email taken' } },
      },
    },
    '/auth/login': {
      post: {
        security: [],
        summary: 'Login',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['email', 'password'], properties: { email: { type: 'string' }, password: { type: 'string' } } } } },
        },
        responses: { 200: { description: 'OK' }, 401: { description: 'Invalid credentials' } },
      },
    },
    '/auth/me': {
      get: { summary: 'Current user', responses: { 200: { description: 'OK' } } },
    },
    '/ai/chat': {
      post: {
        summary: 'AI Mentor chatbot (persists chat history)',
        requestBody: {
          content: { 'application/json': { schema: { type: 'object', required: ['message'], properties: { message: { type: 'string' }, history: { type: 'array' }, sessionId: { type: 'integer' } } } } },
        },
        responses: { 200: { description: 'OK' } },
      },
    },
    '/ai/explain-node': { post: { summary: 'Explain an n8n node', responses: { 200: { description: 'OK' } } } },
    '/ai/explain-workflow': { post: { summary: 'Explain workflow JSON', responses: { 200: { description: 'OK' } } } },
    '/ai/generate-workflow': { post: { summary: 'Generate workflow JSON from a description', responses: { 200: { description: 'OK' } } } },
    '/ai/validate-workflow': { post: { summary: 'Validate workflow JSON', responses: { 200: { description: 'OK' } } } },
    '/ai/translate-error': { post: { summary: 'Translate an n8n error', responses: { 200: { description: 'OK' } } } },
    '/ai/compatibility': { post: { summary: 'Check if two nodes can connect', responses: { 200: { description: 'OK' } } } },
    '/ai/security-audit': { post: { summary: 'Security audit a workflow', responses: { 200: { description: 'OK' } } } },
    '/n8n/status': { get: { summary: 'n8n reachability', responses: { 200: { description: 'OK' } } } },
    '/n8n/workflows': {
      get: { summary: 'List n8n workflows', responses: { 200: { description: 'OK' } } },
      post: { summary: 'Create workflow in n8n', responses: { 201: { description: 'Created' } } },
    },
    '/n8n/workflows/{id}': {
      get: { summary: 'Get n8n workflow', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'OK' } } },
      put: { summary: 'Update n8n workflow', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'OK' } } },
      delete: { summary: 'Delete n8n workflow', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'OK' } } },
    },
    '/n8n/workflows/{id}/activate': {
      patch: { summary: 'Activate n8n workflow', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'OK' } } },
    },
    '/n8n/workflows/{id}/deactivate': {
      patch: { summary: 'Deactivate n8n workflow', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'OK' } } },
    },
    '/n8n/workflows/{id}/execute': {
      post: { summary: 'Execute via webhook trigger', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'OK' } } },
    },
    '/n8n/executions': { get: { summary: 'List n8n executions', responses: { 200: { description: 'OK' } } } },
    '/n8n/executions/{id}': {
      get: { summary: 'Get n8n execution', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'OK' } } },
    },
    '/workflows/generate-and-deploy': {
      post: {
        summary: 'Generate, audit, deploy, and execute a workflow',
        requestBody: {
          content: { 'application/json': { schema: { type: 'object', required: ['prompt'], properties: { prompt: { type: 'string' } } } } },
        },
        responses: { 200: { description: 'OK' } },
      },
    },
    '/workflows': { get: { summary: 'List saved workflows', responses: { 200: { description: 'OK' } } } },
    '/workflows/{id}': {
      get: { summary: 'Workflow detail', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'OK' } } },
      delete: { summary: 'Delete workflow from n8n and DB', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'OK' } } },
    },
    '/workflows/{id}/executions': {
      get: { summary: 'Execution history', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'OK' } } },
    },
    '/workflows/{id}/execute': {
      post: { summary: 'Re-execute a saved workflow', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'OK' } } },
    },
    '/workflows/{id}/activate': {
      patch: { summary: 'Activate saved workflow', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'OK' } } },
    },
    '/workflows/{id}/deactivate': {
      patch: { summary: 'Deactivate saved workflow', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'OK' } } },
    },
    '/chat': {
      get: { summary: 'List chat sessions', responses: { 200: { description: 'OK' } } },
      post: { summary: 'Create a chat session', responses: { 201: { description: 'Created' } } },
    },
    '/chat/{id}': {
      delete: { summary: 'Delete a chat session', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'OK' } } },
    },
    '/chat/{id}/messages': {
      get: { summary: 'List messages in a session', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'OK' } } },
    },
  },
} as const;
