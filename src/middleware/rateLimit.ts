import rateLimit, { type Options } from 'express-rate-limit';

const jsonHandler: Options['handler'] = (_req, res) => {
  res.status(429).json({ error: 'Too many requests. Please wait a moment and try again.' });
};

export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 400,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonHandler,
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonHandler,
});

export const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonHandler,
});
