import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { runPipeline, rerunWorkflow, PipelineError } from '../services/pipeline.js';
import * as n8n from '../services/n8n.js';
import { N8nError } from '../services/n8n.js';
import { config } from '../config/env.js';
import {
  getWorkflowById,
  getWorkflowsByUserIdPaginated,
  updateWorkflow,
  deleteWorkflow as deleteWorkflowRow,
  type Workflow,
} from '../models/Workflow.js';
import {
  getWorkflowExecutionsByWorkflowIdPaginated,
  getExecutionStatsByWorkflowId,
} from '../models/WorkflowExecution.js';
import {
  CREDENTIAL_APPS,
  detectRequiredCredentials,
  missingCredentials,
  splitSkipApps,
  toPublicSpec,
} from '../services/credentials.js';
import { listUserCredentials } from '../models/UserCredential.js';

const router = Router();

function sendError(res: Response, error: unknown) {
  if (error instanceof N8nError) {
    return res.status(error.status).json({ error: error.message, details: error.details });
  }
  console.error('workflow route error:', error);
  return res.status(500).json({
    error: 'Workflow management error',
    details: error instanceof Error ? error.message : 'Unknown error',
  });
}

function paginationMeta(page: number, limit: number, total: number) {
  const totalPages = Math.ceil(total / limit);
  return { page, limit, total, totalPages, hasNext: page < totalPages, hasPrev: page > 1 };
}

function n8nWorkflowUrl(n8nWorkflowId: string | null): string | null {
  return n8nWorkflowId ? `${config.n8n.publicUrl}/workflow/${n8nWorkflowId}` : null;
}

async function findOwnedWorkflow(req: AuthRequest, res: Response): Promise<Workflow | null> {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid workflow id' });
    return null;
  }

  const workflow = await getWorkflowById(id);
  if (!workflow || workflow.user_id !== req.user!.id) {
    res.status(404).json({ error: 'Workflow not found' });
    return null;
  }
  return workflow;
}

const generateAndDeploySchema = z.object({
  prompt: z.string().trim().min(10, 'prompt must be at least 10 characters').max(2000, 'prompt is too long'),
  skipApps: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  status: z.enum(['active', 'inactive']).optional(),
  search: z.string().trim().min(1).max(100).optional(),
});

const executionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

const executeSchema = z.object({
  payload: z.any().optional(),
});

router.post('/generate-and-deploy', authenticate, async (req: AuthRequest, res: Response) => {
  const parsed = generateAndDeploySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() });

  const { valid: skipApps, unknown } = splitSkipApps(parsed.data.skipApps);
  if (unknown.length > 0) {
    return res.status(400).json({
      error: `Unknown app(s) in skipApps: ${unknown.join(', ')}`,
      availableApps: CREDENTIAL_APPS,
    });
  }

  try {
    const result = await runPipeline(req.user!.id, parsed.data.prompt, { skipApps });
    res.json(result);
  } catch (error) {
    if (error instanceof PipelineError) {
      return res.status(error.status).json({
        error: error.message,
        stage: error.stage,
        stages: error.stages,
        ...(error.payload ?? {}),
      });
    }
    console.error('workflow pipeline error:', error);
    return res.status(500).json({
      error: 'Workflow pipeline error',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() });

  const { page, limit, status, search } = parsed.data;

  try {
    const { rows, total } = await getWorkflowsByUserIdPaginated(req.user!.id, {
      page,
      limit,
      isActive: status === undefined ? undefined : status === 'active',
      search,
    });

    res.json({
      data: rows.map((w) => ({
        id: w.id,
        name: w.name,
        description: w.description,
        prompt: w.prompt,
        is_active: Boolean(w.is_active),
        n8n_workflow_id: w.n8n_workflow_id,
        n8nWorkflowUrl: n8nWorkflowUrl(w.n8n_workflow_id),
        created_at: w.created_at,
        updated_at: w.updated_at,
        execution_count: Number(w.execution_count ?? 0),
        last_execution_status: w.last_execution_status ?? null,
        last_executed_at: w.last_executed_at ?? null,
      })),
      pagination: paginationMeta(page, limit, total),
    });
  } catch (error) {
    sendError(res, error);
  }
});

router.get('/:id/executions', authenticate, async (req: AuthRequest, res: Response) => {
  const parsed = executionsQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() });

  const workflow = await findOwnedWorkflow(req, res);
  if (!workflow) return;

  try {
    const { rows, total } = await getWorkflowExecutionsByWorkflowIdPaginated(workflow.id, parsed.data);
    res.json({
      workflowId: workflow.id,
      data: rows,
      pagination: paginationMeta(parsed.data.page, parsed.data.limit, total),
    });
  } catch (error) {
    sendError(res, error);
  }
});

router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  const workflow = await findOwnedWorkflow(req, res);
  if (!workflow) return;

  try {
    const [stats, history] = await Promise.all([
      getExecutionStatsByWorkflowId(workflow.id),
      getWorkflowExecutionsByWorkflowIdPaginated(workflow.id, { page: 1, limit: 10 }),
    ]);

    const definitionNodes = Array.isArray((workflow.definition as any)?.nodes)
      ? ((workflow.definition as any).nodes as any[])
      : [];
    const requiredCredentials = detectRequiredCredentials(definitionNodes);
    const linkedCredentials = await listUserCredentials(req.user!.id);
    const missing = missingCredentials(requiredCredentials, linkedCredentials);

    let n8nInfo: Record<string, unknown>;
    if (!workflow.n8n_workflow_id) {
      n8nInfo = { available: false, error: 'Workflow has not been deployed to n8n yet' };
    } else {
      try {
        const live = await n8n.getWorkflow(workflow.n8n_workflow_id);
        n8nInfo = {
          available: true,
          id: live.id,
          name: live.name,
          active: n8n.isWorkflowActive(live),
          nodes: live.nodes,
          connections: live.connections,
          updatedAt: live.updatedAt ?? null,
        };
      } catch (error) {
        n8nInfo = {
          available: false,
          error: error instanceof N8nError ? error.message : 'Could not reach n8n',
          n8nStatus: error instanceof N8nError ? error.n8nStatus : undefined,
        };
      }
    }

    res.json({
      workflow: {
        id: workflow.id,
        name: workflow.name,
        description: workflow.description,
        prompt: workflow.prompt,
        definition: workflow.definition,
        is_active: Boolean(workflow.is_active),
        n8n_workflow_id: workflow.n8n_workflow_id,
        n8nWorkflowUrl: n8nWorkflowUrl(workflow.n8n_workflow_id),
        created_at: workflow.created_at,
        updated_at: workflow.updated_at,
      },
      executionStats: stats,
      executions: history.rows,
      credentials: {
        required: requiredCredentials.map(toPublicSpec),
        missing: missing.map((spec) => spec.app),
      },
      n8n: n8nInfo,
    });
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/:id/execute', authenticate, async (req: AuthRequest, res: Response) => {
  const parsed = executeSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() });

  const workflow = await findOwnedWorkflow(req, res);
  if (!workflow) return;

  if (!workflow.n8n_workflow_id) {
    return res.status(409).json({
      error: 'Workflow has not been deployed to n8n yet',
      workflowId: workflow.id,
    });
  }

  try {
    const definitionNodes = Array.isArray((workflow.definition as any)?.nodes)
      ? ((workflow.definition as any).nodes as any[])
      : [];
    const requiredCredentials = detectRequiredCredentials(definitionNodes);
    if (requiredCredentials.length > 0) {
      const linkedCredentials = await listUserCredentials(req.user!.id);
      const missing = missingCredentials(requiredCredentials, linkedCredentials);
      if (missing.length > 0) {
        const labels = missing.map((spec) => spec.label).join(', ');
        return res.status(409).json({
          error: `Credentials required before this workflow can run: ${labels}.`,
          workflowId: workflow.id,
          needsCredentials: missing.map(toPublicSpec),
        });
      }
    }

    const result = await rerunWorkflow(req.user!.id, workflow, parsed.data.payload ?? {});
    res.json({
      workflowId: workflow.id,
      n8nWorkflowId: workflow.n8n_workflow_id,
      n8nWorkflowUrl: n8nWorkflowUrl(workflow.n8n_workflow_id),
      status: result.status,
      execution: {
        id: result.dbExecutionId,
        n8nExecutionId: result.n8nExecutionId ?? null,
        ...(result.status === 'success'
          ? { output: result.data }
          : { error: result.error, errorAnalysis: result.errorAnalysis }),
      },
      webhookUrl: result.webhookUrl,
      ms: result.ms,
    });
  } catch (error) {
    if (error instanceof N8nError && error.n8nStatus === 404) {
      await updateWorkflow(workflow.id, { is_active: false });
      return res.status(404).json({
        error: 'This workflow no longer exists in n8n (it may have been deleted there).',
        workflowId: workflow.id,
        n8nStatus: 404,
      });
    }
    sendError(res, error);
  }
});

router.patch('/:id/activate', authenticate, async (req: AuthRequest, res: Response) => {
  const workflow = await findOwnedWorkflow(req, res);
  if (!workflow) return;

  if (!workflow.n8n_workflow_id) {
    return res.status(409).json({ error: 'Workflow has not been deployed to n8n yet', workflowId: workflow.id });
  }

  try {
    await n8n.activateWorkflow(workflow.n8n_workflow_id);
    await updateWorkflow(workflow.id, { is_active: true });
    res.json({ id: workflow.id, name: workflow.name, is_active: true });
  } catch (error) {
    sendError(res, error);
  }
});

router.patch('/:id/deactivate', authenticate, async (req: AuthRequest, res: Response) => {
  const workflow = await findOwnedWorkflow(req, res);
  if (!workflow) return;

  if (!workflow.n8n_workflow_id) {
    return res.status(409).json({ error: 'Workflow has not been deployed to n8n yet', workflowId: workflow.id });
  }

  try {
    await n8n.deactivateWorkflow(workflow.n8n_workflow_id);
    await updateWorkflow(workflow.id, { is_active: false });
    res.json({ id: workflow.id, name: workflow.name, is_active: false });
  } catch (error) {
    sendError(res, error);
  }
});

router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  const workflow = await findOwnedWorkflow(req, res);
  if (!workflow) return;

  let n8nDeleted = false;
  if (workflow.n8n_workflow_id) {
    try {
      if (workflow.is_active) {
        await n8n.deactivateWorkflow(workflow.n8n_workflow_id).catch(() => undefined);
      }
      await n8n.deleteWorkflow(workflow.n8n_workflow_id);
      n8nDeleted = true;
    } catch (error) {
      if (error instanceof N8nError && error.n8nStatus === 404) {
        n8nDeleted = false;
      } else {
        return sendError(res, error);
      }
    }
  }

  await deleteWorkflowRow(workflow.id);

  res.json({
    id: workflow.id,
    name: workflow.name,
    deleted: true,
    n8nDeleted,
    n8nWorkflowId: workflow.n8n_workflow_id,
    ...(workflow.n8n_workflow_id && !n8nDeleted ? { note: 'Workflow was already missing from n8n' } : {}),
  });
});

export default router;
