import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import {
  createChatSession,
  getChatSessionById,
  getChatSessionsByUserId,
  deleteChatSession,
} from '../models/ChatSession.js';
import { getChatMessagesBySessionId } from '../models/ChatMessage.js';

const router = Router();

const createSchema = z.object({
  title: z.string().trim().min(1).max(255).optional(),
});

router.use(authenticate);

// Get the logged-in user's chat history
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const sessions = await getChatSessionsByUserId(req.user!.id);
    res.json({ sessions });
  } catch {
    res.status(500).json({ error: 'Failed to load chat history' });
  }
});

// Create a new chat session
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const parsed = createSchema.safeParse(req.body ?? {});

    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid chat title' });
    }

    const session = await createChatSession({
      user_id: req.user!.id,
      title: parsed.data.title,
    });

    res.status(201).json({ session });
  } catch {
    res.status(500).json({ error: 'Failed to create chat' });
  }
});

// Load messages from a chat owned by the logged-in user
router.get('/:id/messages', async (req: AuthRequest, res: Response) => {
  try {
    const sessionId = Number(req.params.id);

    if (!Number.isSafeInteger(sessionId) || sessionId <= 0) {
      return res.status(400).json({ error: 'Invalid chat ID' });
    }

    const session = await getChatSessionById(sessionId);

    if (!session || session.user_id !== req.user!.id) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    const messages = await getChatMessagesBySessionId(sessionId);
    res.json({ session, messages });
  } catch {
    res.status(500).json({ error: 'Failed to load chat messages' });
  }
});

// Delete a chat owned by the logged-in user
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const sessionId = Number(req.params.id);

    if (!Number.isSafeInteger(sessionId) || sessionId <= 0) {
      return res.status(400).json({ error: 'Invalid chat ID' });
    }

    const session = await getChatSessionById(sessionId);

    if (!session || session.user_id !== req.user!.id) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    await deleteChatSession(sessionId);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete chat' });
  }
});

export default router;