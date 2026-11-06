import { Router } from 'express';
import { readLogEntry, type LogEntry } from '../src/pipeline/healthLog';
import { requireUser } from './auth';
import { asyncHandler, type Deps } from './http';

/** The health log: the last year read, an entry added, one deleted. */
export function logApiRoutes(deps: Deps): Router {
  const router = Router();
  router.use('/log', requireUser(deps));

  router.get(
    '/log',
    asyncHandler(async (req, res) => {
      const { rows } = await deps.db.query<{ id: string; value: Record<string, unknown> }>(
        `SELECT id::text, value FROM user_log WHERE user_id = $1 AND date >= (now() - interval '400 days')::date ORDER BY date, id`,
        [res.locals.userId],
      );
      res.json({ entries: rows.map((r) => readLogEntry({ ...r.value, id: r.id })).filter((e): e is LogEntry => e !== null) });
    }),
  );

  router.post(
    '/log',
    asyncHandler(async (req, res) => {
      const e = readLogEntry(req.body?.entry);
      if (!e) {
        res.status(400).json({ error: 'invalid_entry' });
        return;
      }
      const { id: _drop, ...value } = e;
      const { rows } = await deps.db.query<{ id: string }>(
        `INSERT INTO user_log (user_id, date, value) VALUES ($1, $2, $3::jsonb) RETURNING id::text`,
        [res.locals.userId, e.date, JSON.stringify(value)],
      );
      res.json({ entry: { ...e, id: rows[0].id } });
    }),
  );

  router.delete(
    '/log/:id',
    asyncHandler(async (req, res) => {
      const id = String(req.params.id);
      if (!/^\d+$/.test(id)) {
        res.status(400).json({ error: 'invalid_id' });
        return;
      }
      await deps.db.query('DELETE FROM user_log WHERE user_id = $1 AND id = $2', [res.locals.userId, id]);
      res.json({ ok: true });
    }),
  );

  return router;
}
