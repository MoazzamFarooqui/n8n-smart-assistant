import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import * as n8n from '../services/n8n.js';
import { N8nError } from '../services/n8n.js';
import {
  CREDENTIAL_APPS,
  getCredentialSpec,
  getCredentialSpecByType,
  listPublicSpecs,
  toPublicCredential,
  validateCredentialFields,
} from '../services/credentials.js';
import {
  deleteUserCredential,
  getUserCredential,
  listUserCredentials,
  upsertUserCredential,
} from '../models/UserCredential.js';

const router = Router();

function sendError(res: Response, error: unknown) {
  if (error instanceof N8nError) {
    return res.status(error.status).json({ error: error.message, details: error.details });
  }
  console.error('credential route error:', error);
  return res.status(500).json({
    error: 'Credential management error',
    details: error instanceof Error ? error.message : 'Unknown error',
  });
}

const createSchema = z.object({
  app: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(255).optional(),
  data: z
    .record(z.union([z.string(), z.number(), z.boolean(), z.null()]))
    .optional(),
  n8nCredentialId: z.string().trim().min(1).max(64).optional(),
});

const availableQuerySchema = z.object({
  type: z.string().trim().min(1).max(100).optional(),
});

router.get('/types', authenticate, (_req: AuthRequest, res: Response) => {
  res.json({ data: listPublicSpecs(), apps: CREDENTIAL_APPS });
});

router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const credentials = await listUserCredentials(req.user!.id);
    res.json({ data: credentials.map(toPublicCredential) });
  } catch (error) {
    sendError(res, error);
  }
});

router.get('/available', authenticate, async (req: AuthRequest, res: Response) => {
  const parsed = availableQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() });

  try {
    const result = await n8n.listCredentials({ limit: 100 });
    const data = result.data
      .filter((credential) => !parsed.data.type || credential.type === parsed.data.type)
      .map((credential) => ({
        id: credential.id,
        name: credential.name,
        type: credential.type,
        app: getCredentialSpecByType(credential.type)?.app ?? null,
      }));
    res.json({ data, nextCursor: result.nextCursor });
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() });

  const spec = getCredentialSpec(parsed.data.app);
  if (!spec) {
    return res.status(400).json({
      error: `Unknown app "${parsed.data.app}".`,
      availableApps: CREDENTIAL_APPS,
    });
  }

  const userId = req.user!.id;

  try {
    const existing = await getUserCredential(userId, spec.app);
    let n8nCredentialId: string;
    let credentialName: string;
    let managed = true;

    if (parsed.data.n8nCredentialId) {
      const remote = await n8n.getCredential(parsed.data.n8nCredentialId);
      if (remote.type !== spec.type) {
        return res.status(400).json({
          error: `Credential type mismatch: "${spec.app}" expects "${spec.type}" but n8n returned "${remote.type}".`,
        });
      }
      n8nCredentialId = remote.id;
      credentialName = parsed.data.name || remote.name;
      managed = false;
    } else {
      if (!spec.creatable) {
        return res.status(400).json({
          error: `"${spec.label}" cannot be created through this API.`,
          manual: true,
          type: spec.type,
          hint: spec.hint,
          docs: 'Connect it in n8n first, then POST again with { "app": "' + spec.app + '", "n8nCredentialId": "<id>" } or use GET /api/credentials/available.',
        });
      }

      const validated = validateCredentialFields(spec, parsed.data.data);
      if (!validated.ok) {
        return res.status(400).json({ error: validated.error, missing: validated.missing });
      }

      credentialName = parsed.data.name || `AIES ${spec.label}`;

      if (existing && Boolean(existing.managed)) {
        try {
          await n8n.updateCredential(existing.n8n_credential_id, {
            name: credentialName,
            data: validated.data,
          });
          n8nCredentialId = existing.n8n_credential_id;
        } catch (error) {
          if (!(error instanceof N8nError && error.n8nStatus === 404)) throw error;
          const created = await n8n.createCredential({
            name: credentialName,
            type: spec.type,
            data: validated.data,
          });
          n8nCredentialId = created.id;
        }
      } else {
        const created = await n8n.createCredential({
          name: credentialName,
          type: spec.type,
          data: validated.data,
        });
        n8nCredentialId = created.id;
      }
    }

    const saved = await upsertUserCredential({
      user_id: userId,
      app: spec.app,
      credential_type: spec.type,
      credential_name: credentialName,
      n8n_credential_id: n8nCredentialId,
      managed,
    });

    if (existing && existing.managed && existing.n8n_credential_id !== saved.n8n_credential_id) {
      await n8n.deleteCredential(existing.n8n_credential_id).catch(() => undefined);
    }

    res.status(existing ? 200 : 201).json(toPublicCredential(saved));
  } catch (error) {
    sendError(res, error);
  }
});

router.delete('/:app', authenticate, async (req: AuthRequest, res: Response) => {
  const spec = getCredentialSpec(req.params.app);
  if (!spec) {
    return res.status(400).json({ error: `Unknown app "${req.params.app}".`, availableApps: CREDENTIAL_APPS });
  }

  try {
    const existing = await getUserCredential(req.user!.id, spec.app);
    if (!existing) return res.status(404).json({ error: `No ${spec.label} credential is linked.` });

    let n8nDeleted = false;
    if (existing.managed) {
      try {
        await n8n.deleteCredential(existing.n8n_credential_id);
        n8nDeleted = true;
      } catch (error) {
        if (!(error instanceof N8nError && error.n8nStatus === 404)) throw error;
      }
    }

    await deleteUserCredential(req.user!.id, spec.app);
    res.json({ app: spec.app, deleted: true, n8nDeleted });
  } catch (error) {
    sendError(res, error);
  }
});

export default router;
