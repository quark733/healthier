import { Router } from 'express';
import { readCarePlan, readEvent, type CareEvent } from '../src/pipeline/care';
import { requireUser } from './auth';
import { asyncHandler, type Deps } from './http';

/** The care plan (one per person) and the health log (doses and tagged events). */
export function careApiRoutes(deps: Deps): Router {
  const router = Router();
  router.use('/care', requireUser(deps));

  router.get(
    '/care',
    asyncHandler(async (req, res) => {
      const plan = await deps.db.query<{ value: unknown }>('SELECT value FROM user_care_plan WHERE user_id = $1', [res.locals.userId]);
      const { rows } = await deps.db.query<{ id: string; value: Record<string, unknown> }>(
        `SELECT id::text, value FROM user_events WHERE user_id = $1 AND date >= (now() - interval '400 days')::date ORDER BY at`,
        [res.locals.userId],
      );
      res.json({
        plan: readCarePlan(plan.rows[0]?.value),
        events: rows.map((r) => readEvent({ ...r.value, id: r.id })).filter((e): e is CareEvent => e !== null),
      });
    }),
  );

  router.put(
    '/care/plan',
    asyncHandler(async (req, res) => {
      const plan = readCarePlan(req.body?.plan);
      await deps.db.query(
        `INSERT INTO user_care_plan (user_id, value) VALUES ($1, $2::jsonb)
         ON CONFLICT (user_id) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [res.locals.userId, JSON.stringify(plan)],
      );
      res.json({ plan });
    }),
  );

  router.post(
    '/care/events',
    asyncHandler(async (req, res) => {
      const e = readEvent(req.body?.event);
      if (!e) {
        res.status(400).json({ error: 'invalid_event' });
        return;
      }
      const { id: _drop, ...value } = e;
      const { rows } = await deps.db.query<{ id: string }>(
        `INSERT INTO user_events (user_id, date, at, kind, value) VALUES ($1, $2, $3, $4, $5::jsonb) RETURNING id::text`,
        [res.locals.userId, e.date, e.at, e.kind, JSON.stringify(value)],
      );
      res.json({ event: { ...e, id: rows[0].id } });
    }),
  );

  router.delete(
    '/care/events/:id',
    asyncHandler(async (req, res) => {
      const id = String(req.params.id);
      if (!/^\d+$/.test(id)) {
        res.status(400).json({ error: 'invalid_id' });
        return;
      }
      await deps.db.query('DELETE FROM user_events WHERE user_id = $1 AND id = $2', [res.locals.userId, id]);
      res.json({ ok: true });
    }),
  );

  return router;
}
