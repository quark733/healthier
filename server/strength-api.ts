import { Router } from 'express';
import { parseSessions, unreadCount } from '../src/pipeline/strength';
import type { StrengthResponse } from '../src/types/api';
import { requireUser } from './auth';
import { asyncHandler, type Deps } from './http';
import { deleteStrength, getStrengthLink, getStrengthSessions, saveStrengthLink, storeStrengthSessions } from './strength-repo';
import { isSyncingStrength, syncStrength } from './strengthlog';

/** Pasted text is at most this long: years of sessions fit well inside it. */
const MAX_PASTE = 2_000_000;

/** The Training page's API: the stored sessions, the link's status, a sync, and pasting text in. */
export function strengthApiRoutes(deps: Deps): Router {
  const router = Router();
  router.use('/strength', requireUser(deps));

  router.get(
    '/strength',
    asyncHandler(async (req, res) => {
      const userId: string = res.locals.userId;
      const [sessions, link] = await Promise.all([
        getStrengthSessions(deps.db, userId),
        getStrengthLink(deps.db, deps.config.encryptionKey, userId),
      ]);
      const status = link?.status ?? {};
      const body: StrengthResponse = {
        sessions,
        connected: !!status.connected && !!link?.secrets?.refreshToken,
        syncing: isSyncingStrength(userId),
        lastSyncAt: status.lastSyncAt ?? null,
        lastError: status.lastError ?? null,
        unread: status.unread ?? 0,
        via: status.via ?? null,
      };
      res.json(body);
    }),
  );

  router.post(
    '/strength/sync',
    asyncHandler(async (req, res) => {
      const userId: string = res.locals.userId;
      // The first sync reads years of history, so it runs on; the page asks again for the result.
      void syncStrength(deps, userId).catch(() => {});
      res.status(202).json({ ok: true });
    }),
  );

  router.post(
    '/strength/import',
    asyncHandler(async (req, res) => {
      const userId: string = res.locals.userId;
      const text = typeof req.body?.text === 'string' ? req.body.text : '';
      if (!text.trim() || text.length > MAX_PASTE) {
        res.status(400).json({ error: 'invalid_text' });
        return;
      }
      const parsed = parseSessions(text);
      if (!parsed.kilograms) {
        res.status(400).json({ error: 'pounds' });
        return;
      }
      if (!parsed.sessions.length) {
        res.status(400).json({ error: 'no_sessions' });
        return;
      }
      // A complete reply replaces its range; a partial one only adds.
      const complete = parsed.from && parsed.to && parsed.shown !== null && parsed.total !== null && parsed.shown >= parsed.total;
      await storeStrengthSessions(deps.db, userId, parsed.sessions, complete ? { from: parsed.from!, to: parsed.to! } : undefined);
      const unread = parsed.sessions.reduce((n, s) => n + unreadCount(s), 0);
      await saveStrengthLink(deps.db, deps.config.encryptionKey, userId, undefined, { via: 'paste', unread });
      res.json({ sessions: parsed.sessions.length, unread });
    }),
  );

  /** Disconnect StrengthLog and forget every session stored from it. */
  router.delete(
    '/strength',
    asyncHandler(async (req, res) => {
      await deleteStrength(deps.db, res.locals.userId);
      res.json({ ok: true });
    }),
  );

  return router;
}
