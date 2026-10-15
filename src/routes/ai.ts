import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { callGemini, SYSTEM_PROMPTS } from '../services/gemini.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';

const router = Router();

const chatSchema = z.object({
  message: z.string().min(1).max(4000),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })).optional(),
});

const explainNodeSchema = z.object({
  nodeType: z.string().min(1),
  nodeName: z.string().optional(),
});

const explainWorkflowSchema = z.object({
  workflowJson: z.string().min(1),
});

const generateWorkflowSchema = z.object({
  description: z.string().min(10).max(2000),
  nodes: z.array(z.string()).optional(),
});

const validateWorkflowSchema = z.object({
  workflowJson: z.string().min(1),
});

const translateErrorSchema = z.object({
  error: z.string().min(1),
  context: z.string().optional(),
});

const compatibilitySchema = z.object({
  sourceNode: z.string().min(1),
  targetNode: z.string().min(1),
});

const securityAuditSchema = z.object({
  workflowJson: z.string().min(1),
});

async function handleAIRequest(
  req: Request,
  res: Response,
  promptKey: keyof typeof SYSTEM_PROMPTS,
  userPrompt: string
) {
  try {
    const result = await callGemini(SYSTEM_PROMPTS[promptKey], userPrompt);
    res.json({ response: result.text, usage: result.usage });
  } catch (error) {
    console.error(`AI ${promptKey} error:`, error);
    res.status(500).json({ error: 'AI service unavailable', details: error instanceof Error ? error.message : 'Unknown error' });
  }
}

router.post('/chat', authenticate, async (req: AuthRequest, res: Response) => {
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() });

  const { message, history } = parsed.data;
  let fullPrompt = message;
  
  if (history && history.length > 0) {
    const context = history.map(h => `${h.role}: ${h.content}`).join('\n');
    fullPrompt = `Previous conversation:\n${context}\n\nCurrent: ${message}`;
  }

  await handleAIRequest(req, res, 'chat', fullPrompt);
});

router.post('/explain-node', authenticate, async (req: AuthRequest, res: Response) => {
  const parsed = explainNodeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() });

  const { nodeType, nodeName } = parsed.data;
  const prompt = `Node type: ${nodeType}${nodeName ? ` (${nodeName})` : ''}`;
  await handleAIRequest(req, res, 'explainNode', prompt);
});

router.post('/explain-workflow', authenticate, async (req: AuthRequest, res: Response) => {
  const parsed = explainWorkflowSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() });

  await handleAIRequest(req, res, 'explainWorkflow', parsed.data.workflowJson);
});

router.post('/generate-workflow', authenticate, async (req: AuthRequest, res: Response) => {
  const parsed = generateWorkflowSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() });

  const { description, nodes } = parsed.data;
  let prompt = `Description: ${description}`;
  if (nodes && nodes.length > 0) {
    prompt += `\nPreferred nodes: ${nodes.join(', ')}`;
  }
  await handleAIRequest(req, res, 'generateWorkflow', prompt);
});

router.post('/validate-workflow', authenticate, async (req: AuthRequest, res: Response) => {
  const parsed = validateWorkflowSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() });

  await handleAIRequest(req, res, 'validateWorkflow', parsed.data.workflowJson);
});

router.post('/translate-error', authenticate, async (req: AuthRequest, res: Response) => {
  const parsed = translateErrorSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() });

  const { error, context } = parsed.data;
  let prompt = `Error: ${error}`;
  if (context) prompt += `\nContext: ${context}`;
  await handleAIRequest(req, res, 'translateError', prompt);
});

router.post('/compatibility', authenticate, async (req: AuthRequest, res: Response) => {
  const parsed = compatibilitySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() });

  const { sourceNode, targetNode } = parsed.data;
  const prompt = `Source: ${sourceNode}\nTarget: ${targetNode}`;
  await handleAIRequest(req, res, 'compatibility', prompt);
});

router.post('/security-audit', authenticate, async (req: AuthRequest, res: Response) => {
  const parsed = securityAuditSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() });

  await handleAIRequest(req, res, 'securityAudit', parsed.data.workflowJson);
});

export default router;