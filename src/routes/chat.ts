import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import {
  createChatSession,
  deleteChatSession,
  getChatSessionById,
  getChatSessionsByUserId,
  touchChatSession,
  type ChatSession,
} from '../models/ChatSession.js';
import { createChatMessage, getChatMessagesBySessionId } from '../models/ChatMessage.js';

const router = Router();

const createSchema = z.object({
  title: z.string().trim().min(1).max(255).optional(),
});

async function findOwnedSession(req: AuthRequest, res: Response): Promise<ChatSession | null> {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid chat id' });
    return null;
  }

  const session = await getChatSessionById(id);
  if (!session || session.user_id !== req.user!.id) {
    res.status(404).json({ error: 'Chat not found' });
    return null;
  }
  return session;
}

export async function persistChatTurn(input: {
  userId: number;
  sessionId?: number;
  title?: string;
  userMessage: string;
  assistantMessage: string;
}): Promise<number> {
  let session: ChatSession | null = null;

  if (input.sessionId) {
    session = await getChatSessionById(input.sessionId);
    if (!session || session.user_id !== input.userId) {
      const err = new Error('Chat not found');
      (err as Error & { status: number }).status = 404;
      throw err;
    }
  } else {
    session = await createChatSession({
      user_id: input.userId,
      title: input.title || input.userMessage.slice(0, 34),
    });
  }

  await createChatMessage({ session_id: session.id, role: 'user', content: input.userMessage });
  await createChatMessage({ session_id: session.id, role: 'assistant', content: input.assistantMessage });
  await touchChatSession(session.id, input.title);
  return session.id;
}

router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  const sessions = await getChatSessionsByUserId(req.user!.id);
  res.json({ sessions });
});

router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  const parsed = createSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() });

  const session = await createChatSession({
    user_id: req.user!.id,
    title: parsed.data.title,
  });
  res.status(201).json({ session });
});

router.get('/:id/messages', authenticate, async (req: AuthRequest, res: Response) => {
  const session = await findOwnedSession(req, res);
  if (!session) return;

  const messages = await getChatMessagesBySessionId(session.id);
  res.json({ sessionId: session.id, messages });
});

router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  const session = await findOwnedSession(req, res);
  if (!session) return;

  await deleteChatSession(session.id);
  res.json({ id: session.id, deleted: true });
});

export default router;
