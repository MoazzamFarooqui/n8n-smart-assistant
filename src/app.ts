import express from 'express';
import chatRoutes from './routes/chat.js';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config/env.js';
import { testConnection } from './config/db.js';
import authRoutes from './routes/auth.js';
import healthRoutes from './routes/health.js';
import aiRoutes from './routes/ai.js';
import n8nRoutes from './routes/n8n.js';
import workflowRoutes from './routes/workflows.js';
import credentialRoutes from './routes/credentials.js';
import { errorHandler } from './middleware/errorHandler.js';

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

const app = express();

app.use(helmet());
app.use(cors({ origin: config.frontendUrl, credentials: true }));
app.use(morgan('dev'));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api', healthRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/n8n', n8nRoutes);
app.use('/api/workflows', workflowRoutes);
app.use('/api/credentials', credentialRoutes);

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

app.use(errorHandler);

export async function startServer() {
  await testConnection();
  const server = app.listen(config.port, () => {
    console.log(`🚀 Server running on http://localhost:${config.port}`);
    console.log(`📡 API: http://localhost:${config.port}/api`);
  });
  return server;
}

startServer().catch(console.error);