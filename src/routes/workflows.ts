import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { runPipeline, PipelineError } from '../services/pipeline.js';

const router = Router();

const generateAndDeploySchema = z.object({
  prompt: z.string().trim().min(10, 'prompt must be at least 10 characters').max(2000, 'prompt is too long'),
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

export default router;
