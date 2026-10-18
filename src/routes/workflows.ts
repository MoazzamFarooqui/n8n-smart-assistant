import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { runPipeline, PipelineError } from '../services/pipeline.js';
import { N8nError } from '../services/n8n.js';
import { config } from '../config/env.js';
import { getWorkflowsByUserIdPaginated } from '../models/Workflow.js';

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

const generateAndDeploySchema = z.object({
  prompt: z.string().trim().min(10, 'prompt must be at least 10 characters').max(2000, 'prompt is too long'),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  status: z.enum(['active', 'inactive']).optional(),
  search: z.string().trim().min(1).max(100).optional(),
});

router.post('/generate-and-deploy', authenticate, async (req: AuthRequest, res: Response) => {
  const parsed = generateAndDeploySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() });

  try {
    const result = await runPipeline(req.user!.id, parsed.data.prompt);
    res.json(result);
  } catch (error) {
    if (error instanceof PipelineError) {
      return res.status(error.status).json({
        error: error.message,
        stage: error.stage,
        stages: error.stages,
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

export default router;
