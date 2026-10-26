import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { callGemini, SYSTEM_PROMPTS } from '../services/gemini.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import {
  createChatSession,
  getChatSessionById,
  updateChatSession,
} from '../models/ChatSession.js';
import {
  createChatMessage,
  getChatMessagesBySessionId,
} from '../models/ChatMessage.js';

const router = Router();

const chatSchema = z.object({
  message: z.string().trim().min(1).max(4000),
  sessionId: z.number().int().positive().optional(),
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
    const result = await callGemini(
      SYSTEM_PROMPTS[promptKey],
      userPrompt
    );

    res.json({ response: result.text, usage: result.usage });
  } catch (error) {
    console.error(`AI ${promptKey} error:`, error);

    res.status(500).json({
      error: 'AI service unavailable',
      details: error instanceof Error
        ? error.message
        : 'Unknown error',
    });
  }
}

// Persistent chat: save messages and return the session ID.
router.post(
  '/chat',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    const parsed = chatSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        errors: parsed.error.flatten(),
      });
    }

    try {
      const { message, sessionId, history } = parsed.data;
      const userId = req.user!.id;

      let session;

      if (sessionId !== undefined) {
        session = await getChatSessionById(sessionId);

        if (!session || session.user_id !== userId) {
          return res.status(404).json({
            error: 'Chat not found',
          });
        }
      } else {
        session = await createChatSession({
          user_id: userId,
          title: message.slice(0, 80),
        });
      }

      // Load saved conversation before inserting the new message.
      const savedMessages = sessionId !== undefined
        ? await getChatMessagesBySessionId(session.id)
        : [];

      const savedHistory = savedMessages
        .filter((item) =>
          item.role === 'user' || item.role === 'assistant'
        )
        .map((item) => `${item.role}: ${item.content}`);

      // Use client history only for legacy clients with no saved history.
      const previousHistory = savedHistory.length > 0
        ? savedHistory
        : (history ?? []).map(
            (item) => `${item.role}: ${item.content}`
          );

      await createChatMessage({
        session_id: session.id,
        role: 'user',
        content: message,
      });

      const fullPrompt = previousHistory.length > 0
        ? `Previous conversation:\n${previousHistory.join('\n')}\n\nCurrent: ${message}`
        : message;

      const result = await callGemini(
        SYSTEM_PROMPTS.chat,
        fullPrompt
      );

      const assistantMessage = await createChatMessage({
        session_id: session.id,
        role: 'assistant',
        content: result.text,
      });

      if (!session.title) {
        await updateChatSession(session.id, {
          title: message.slice(0, 80),
        });
      }

      return res.json({
        response: result.text,
        usage: result.usage,
        sessionId: session.id,
        message: assistantMessage,
      });
    } catch (error) {
      console.error('Persistent AI chat error:', error);

      return res.status(500).json({
        error: 'AI chat request failed. The user message may have been saved.',
      });
    }
  }
);

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