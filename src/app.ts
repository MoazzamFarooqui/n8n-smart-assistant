import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import { config } from './config/env.js';
import { testConnection } from './config/db.js';
import { openapiSpec } from './docs/openapi.js';
import { aiLimiter, authLimiter, generalLimiter } from './middleware/rateLimit.js';
import { errorHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/auth.js';
import healthRoutes from './routes/health.js';
import aiRoutes from './routes/ai.js';
import n8nRoutes from './routes/n8n.js';
import workflowRoutes from './routes/workflows.js';
import credentialRoutes from './routes/credentials.js';
import chatRoutes from './routes/chat.js';

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

const app = express();

app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: config.frontendUrl, credentials: true }));
app.use(morgan('dev'));
app.use(express.json({ limit: '1mb' }));

app.get('/api/docs.json', (_req, res) => res.json(openapiSpec));
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openapiSpec, { customSiteTitle: 'n8n Smart Assistant API' }));

app.use('/api', healthRoutes);
app.use(generalLimiter);
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/ai', aiLimiter, aiRoutes);
app.use('/api/n8n', n8nRoutes);
app.use('/api/workflows', workflowRoutes);
app.use('/api/credentials', credentialRoutes);
app.use('/api/chat', chatRoutes);

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

app.use(errorHandler);

export async function startServer() {
  await testConnection();
  const server = app.listen(config.port, () => {
    console.log(`🚀 Server running on http://localhost:${config.port}`);
    console.log(`📡 API: http://localhost:${config.port}/api`);
    console.log(`📘 Docs: http://localhost:${config.port}/api/docs`);
  });
  return server;
}

startServer().catch(console.error);
