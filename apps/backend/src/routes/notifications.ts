import { Router } from 'express';
import { eq, desc, and, count, lt } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/error.js';
import { emitToUsers, registerSseClient } from '../ws/wsManager.js';
import { verifyToken } from '../utils/jwt.js';

const router = Router();

// ── SSE stream (auth via query param since EventSource has no custom headers) ──
router.get('/stream', (req, res) => {
  const token = req.query.token as string;
  if (!token) { res.status(401).end(); return; }

  const user = verifyToken(token);
  if (!user) { res.status(401).end(); return; }

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable Nginx/proxy buffering
  res.flushHeaders();

  const cleanup = registerSseClient(user.id, user.role, res);

  // Send a heartbeat comment every 20s to keep the connection alive through proxies
  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch { clearInterval(heartbeat); }
  }, 20000);

  req.on('close', () => {
    clearInterval(heartbeat);
    cleanup();
  });
});

router.use(authenticate);

router.get('/', asyncHandler(async (req, res) => {
  const { type, before, limit: limitStr } = req.query as Record<string, string>;
  const limit = Math.min(Number(limitStr) || 30, 50);

  const conditions: any[] = [eq(schema.notifications.receiverId, req.user!.id)];
  if (type && type !== 'all') conditions.push(eq(schema.notifications.type, type));
  if (before) conditions.push(lt(schema.notifications.createdAt, new Date(before)));

  const data = await db
    .select()
    .from(schema.notifications)
    .where(and(...conditions))
    .orderBy(desc(schema.notifications.createdAt))
    .limit(limit);
  res.json({ success: true, data });
}));

router.get('/unread-count', asyncHandler(async (req, res) => {
  const [{ total }] = await db
    .select({ total: count() })
    .from(schema.notifications)
    .where(and(
      eq(schema.notifications.receiverId, req.user!.id),
      eq(schema.notifications.isRead, false),
    ));
  res.json({ success: true, data: { count: total } });
}));

router.patch('/:id/read', asyncHandler(async (req, res) => {
  const notificationId = String(req.params.id);
  await db
    .update(schema.notifications)
    .set({ isRead: true })
    .where(and(
      eq(schema.notifications.id, notificationId),
      eq(schema.notifications.receiverId, req.user!.id),
    ));
  res.json({ success: true, message: 'Marked as read' });
}));

router.patch('/read-all', asyncHandler(async (req, res) => {
  await db
    .update(schema.notifications)
    .set({ isRead: true })
    .where(and(
      eq(schema.notifications.receiverId, req.user!.id),
      eq(schema.notifications.isRead, false),
    ));
  res.json({ success: true, message: 'All marked as read' });
}));

router.post('/send', asyncHandler(async (req, res) => {
  if (req.user!.role !== 'admin' && req.user!.role !== 'teacher') {
    throw new ApiError(403, 'Not allowed');
  }
  const { receiverIds, title, message, type = 'general', link } = req.body;
  if (!receiverIds?.length || !title || !message) {
    throw new ApiError(400, 'receiverIds, title, message required');
  }

  const inserted = await db.insert(schema.notifications).values(
    receiverIds.map((rid: string) => ({
      receiverId: rid, senderId: req.user!.id, type, title, message, link,
    }))
  ).returning();

  // Push real-time SSE event to all recipients
  const wsEvent = { id: inserted[0]?.id, title, message, type, link, createdAt: new Date().toISOString(), isRead: false };
  emitToUsers(receiverIds, wsEvent);

  res.status(201).json({ success: true, message: 'Notifications sent' });
}));

export default router;
