import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import * as n8n from '../services/n8n.js';
import { N8nError } from '../services/n8n.js';
import { config } from '../config/env.js';

const router = Router();

function sendError(res: Response, error: unknown) {
  if (error instanceof N8nError) {
    return res.status(error.status).json({ error: error.message, details: error.details });
  }
  console.error('n8n route error:', error);
  return res.status(500).json({
    error: 'n8n integration error',
    details: error instanceof Error ? error.message : 'Unknown error',
  });
}

const nodeSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  typeVersion: z.number().optional(),
  position: z.array(z.number()).optional(),
  parameters: z.record(z.any()).optional(),
  webhookId: z.string().optional(),
  disabled: z.boolean().optional(),
  credentials: z.record(z.any()).optional(),
  id: z.string().optional(),
});

const createWorkflowSchema = z.object({
  name: z.string().min(1).max(128),
  nodes: z.array(nodeSchema).min(1),
  connections: z.record(z.any()),
  settings: z.record(z.any()).optional(),
  description: z.string().max(255).optional(),
});

const updateWorkflowSchema = z
  .object({
    name: z.string().min(1).max(128).optional(),
    nodes: z.array(nodeSchema).min(1).optional(),
    connections: z.record(z.any()).optional(),
    settings: z.record(z.any()).optional(),
    description: z.string().max(255).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to update' });

const listQuerySchema = z.object({
  active: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().min(1).max(250).optional(),
  cursor: z.string().optional(),
  name: z.string().optional(),
});

const executionsQuerySchema = z.object({
  workflowId: z.string().optional(),
  status: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(250).optional(),
  includeData: z.enum(['true', 'false']).optional(),
});

const executeSchema = z.object({
  payload: z.any().optional(),
  nodeName: z.string().optional(),
});

router.get('/status', authenticate, async (_req: AuthRequest, res: Response) => {
  const configured = n8n.isN8nConfigured();
  const status: Record<string, unknown> = {
    configured,
    apiUrl: config.n8n.apiUrl,
    publicUrl: config.n8n.publicUrl,
    reachable: false,
  };

  if (!configured) {
    status.hint = 'Set N8N_API_URL and N8N_API_KEY in .env (see docs/PHASE3.md).';
    return res.json(status);
  }

  try {
    const wf = await n8n.listWorkflows({ limit: 1 });
    status.reachable = true;
    status.workflowCountSample = wf.data.length;
  } catch (error) {
    if (error instanceof N8nError) {
      status.error = error.message;
      status.n8nStatus = error.n8nStatus;
    } else {
      status.error = error instanceof Error ? error.message : 'Unknown error';
    }
  }
  res.json(status);
});

router.get('/workflows', authenticate, async (req: AuthRequest, res: Response) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() });

  try {
    const { active, limit, cursor, name } = parsed.data;
    const result = await n8n.listWorkflows({
      active: active === undefined ? undefined : active === 'true',
      limit,
      cursor,
      name,
    });
    res.json(result);
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/workflows', authenticate, async (req: AuthRequest, res: Response) => {
  const parsed = createWorkflowSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() });

  try {
    const workflow = await n8n.createWorkflow(parsed.data);
    res.status(201).json(workflow);
  } catch (error) {
    sendError(res, error);
  }
});

router.put('/workflows/:id', authenticate, async (req: AuthRequest, res: Response) => {
  const parsed = updateWorkflowSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() });

  try {
    const workflow = await n8n.updateWorkflow(req.params.id, parsed.data);
    res.json(workflow);
  } catch (error) {
    sendError(res, error);
  }
});

router.get('/workflows/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const workflow = await n8n.getWorkflow(req.params.id);
    res.json(workflow);
  } catch (error) {
    sendError(res, error);
  }
});

router.patch('/workflows/:id/activate', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const workflow = await n8n.activateWorkflow(req.params.id);
    res.json({ id: workflow.id, name: workflow.name, active: n8n.isWorkflowActive(workflow) });
  } catch (error) {
    sendError(res, error);
  }
});

router.patch('/workflows/:id/deactivate', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const workflow = await n8n.deactivateWorkflow(req.params.id);
    res.json({ id: workflow.id, name: workflow.name, active: n8n.isWorkflowActive(workflow) });
  } catch (error) {
    sendError(res, error);
  }
});

router.delete('/workflows/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const workflow = await n8n.deleteWorkflow(req.params.id);
    res.json({ id: workflow.id, name: workflow.name, deleted: true });
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/workflows/:id/execute', authenticate, async (req: AuthRequest, res: Response) => {
  const parsed = executeSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() });

  try {
    const workflow = await n8n.getWorkflow(req.params.id);
    if (!n8n.isWorkflowActive(workflow)) {
      return res.status(409).json({
        error:
          'Workflow is not active. Activate it first with PATCH /api/n8n/workflows/:id/activate.',
        workflowId: workflow.id,
      });
    }

    const result = await n8n.executeViaWebhook(workflow, parsed.data);
    res.json({
      workflowId: workflow.id,
      nodeName: result.nodeName,
      webhookUrl: result.webhookUrl,
      status: result.status,
      data: result.data,
    });
  } catch (error) {
    sendError(res, error);
  }
});

router.get('/executions', authenticate, async (req: AuthRequest, res: Response) => {
  const parsed = executionsQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() });

  try {
    const { workflowId, status, limit, includeData } = parsed.data;
    const result = await n8n.listExecutions({
      workflowId,
      status,
      limit,
      includeData: includeData === 'true',
    });
    res.json({
      data: result.data.map(n8n.summarizeExecution),
      nextCursor: result.nextCursor,
    });
  } catch (error) {
    sendError(res, error);
  }
});

router.get('/executions/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const execution = await n8n.getExecution(req.params.id, true);
    res.json({
      ...n8n.summarizeExecution(execution),
      data: execution.data,
    });
  } catch (error) {
    sendError(res, error);
  }
});

export default router;
