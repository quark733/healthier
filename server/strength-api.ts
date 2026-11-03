import { Router, type Request } from 'express';
import { parseSessions, unreadCount } from '../src/pipeline/strength';
import type { StrengthResponse } from '../src/types/api';
import { requireUser } from './auth';
import { asyncHandler, type Deps } from './http';
import {
  deleteStrength, getStrengthLink, getStrengthSessions, hasIngestKey, newIngestKey, revokeIngestKey, saveStrengthLink,
  storeStrengthSessions, userForIngestKey, type StrengthStatus,
} from './strength-repo';
import { isSyncingStrength, syncStrength } from './strengthlog';

/** Text sent in is at most this long: years of sessions fit well inside it. */
const MAX_TEXT = 2_000_000;

type ImportResult = { sessions: number; unread: number } | { error: 'invalid_text' | 'pounds' | 'no_sessions' };

/**
 * Store sessions from get_sessions text. A complete reply (all it matched, shown) replaces the
 * range it covers, so sessions deleted in StrengthLog go here too; a partial one only adds.
 */
async function importText(deps: Deps, userId: string, text: string): Promise<ImportResult> {
  if (!text.trim() || text.length > MAX_TEXT) return { error: 'invalid_text' };
  const parsed = parseSessions(text);
  if (!parsed.kilograms) return { error: 'pounds' };
  if (!parsed.sessions.length) return /no sessions in range/i.test(text) ? { sessions: 0, unread: 0 } : { error: 'no_sessions' };
  const complete = parsed.from && parsed.to && parsed.shown !== null && parsed.total !== null && parsed.shown >= parsed.total;
  await storeStrengthSessions(deps.db, userId, parsed.sessions, complete ? { from: parsed.from!, to: parsed.to! } : undefined);
  return { sessions: parsed.sessions.length, unread: parsed.sessions.reduce((n, s) => n + unreadCount(s), 0) };
}

/** The texts in a request: one as `text`, or several replies as `texts`. */
const textsOf = (req: Request): string[] => {
  const body = req.body ?? {};
  if (Array.isArray(body.texts)) return body.texts.filter((t: unknown): t is string => typeof t === 'string');
  return typeof body.text === 'string' ? [body.text] : [];
};

async function importAll(deps: Deps, userId: string, texts: string[], via: NonNullable<StrengthStatus['via']>) {
  let sessions = 0;
  let unread = 0;
  for (const text of texts) {
    const r = await importText(deps, userId, text);
    if ('error' in r) return r;
    sessions += r.sessions;
    unread += r.unread;
  }
  await saveStrengthLink(deps.db, deps.config.encryptionKey, userId, undefined, {
    via, unread, lastError: null, ...(via === 'scheduled' ? { lastSyncAt: new Date().toISOString() } : {}),
  });
  return { sessions, unread };
}

/** The Training page's API: the stored sessions, the link's status, syncs, keys, and text sent in. */
export function strengthApiRoutes(deps: Deps): Router {
  const router = Router();

  /**
   * Sessions from a scheduled job, signed with the person's sync key instead of a browser
   * session. It can add sessions and nothing else.
   */
  router.post(
    '/strength-ingest',
    asyncHandler(async (req, res) => {
      const auth = req.get('authorization') ?? '';
      const key = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
      const userId = key ? await userForIngestKey(deps.db, key) : null;
      if (!userId) {
        res.status(401).json({ error: 'invalid_key' });
        return;
      }
      const texts = textsOf(req);
      if (!texts.length) {
        res.status(400).json({ error: 'invalid_text' });
        return;
      }
      const result = await importAll(deps, userId, texts, 'scheduled');
      res.status('error' in result ? 400 : 200).json(result);
    }),
  );

  router.use('/strength', requireUser(deps));

  router.get(
    '/strength',
    asyncHandler(async (req, res) => {
      const userId: string = res.locals.userId;
      const [sessions, link, hasKey] = await Promise.all([
        getStrengthSessions(deps.db, userId),
        getStrengthLink(deps.db, deps.config.encryptionKey, userId),
        hasIngestKey(deps.db, userId),
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
        hasKey,
      };
      res.json(body);
    }),
  );

  router.post(
    '/strength/sync',
    asyncHandler(async (req, res) => {
      // The first sync reads years of history, so it runs on; the page asks again for the result.
      void syncStrength(deps, res.locals.userId).catch(() => {});
      res.status(202).json({ ok: true });
    }),
  );

  router.post(
    '/strength/import',
    asyncHandler(async (req, res) => {
      const result = await importAll(deps, res.locals.userId, textsOf(req), 'paste');
      res.status('error' in result ? 400 : 200).json(result);
    }),
  );

  /** A new sync key, replacing the old one. Shown once. */
  router.post(
    '/strength/key',
    asyncHandler(async (req, res) => {
      res.json({ key: await newIngestKey(deps.db, res.locals.userId) });
    }),
  );

  router.delete(
    '/strength/key',
    asyncHandler(async (req, res) => {
      await revokeIngestKey(deps.db, res.locals.userId);
      res.json({ ok: true });
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
