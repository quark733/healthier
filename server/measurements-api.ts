import { Router } from 'express';
import { readMeasurement, type Measurement } from '../src/pipeline/measurements';
import { requireUser } from './auth';
import { asyncHandler, type Deps } from './http';

/** Hand-taken measurements (blood pressure, waist): the last year read, one added, one deleted. */
export function measurementsApiRoutes(deps: Deps): Router {
  const router = Router();
  router.use('/measurements', requireUser(deps));

  router.get(
    '/measurements',
    asyncHandler(async (req, res) => {
      const { rows } = await deps.db.query<{ id: string; value: Record<string, unknown> }>(
        `SELECT id::text, value FROM user_measurements
          WHERE user_id = $1 AND taken_at >= now() - interval '400 days' ORDER BY taken_at`,
        [res.locals.userId],
      );
      const measurements = rows.map((r) => readMeasurement({ ...r.value, id: r.id })).filter((m): m is Measurement => m !== null);
      res.json({ measurements });
    }),
  );

  router.post(
    '/measurements',
    asyncHandler(async (req, res) => {
      const m = readMeasurement(req.body?.measurement);
      if (!m) {
        res.status(400).json({ error: 'invalid_measurement' });
        return;
      }
      const { id: _drop, ...value } = m;
      const { rows } = await deps.db.query<{ id: string }>(
        `INSERT INTO user_measurements (user_id, kind, taken_at, value) VALUES ($1, $2, $3, $4::jsonb) RETURNING id::text`,
        [res.locals.userId, m.kind, m.at, JSON.stringify(value)],
      );
      res.json({ measurement: { ...m, id: rows[0].id } });
    }),
  );

  router.delete(
    '/measurements/:id',
    asyncHandler(async (req, res) => {
      const id = String(req.params.id);
      if (!/^\d+$/.test(id)) {
        res.status(400).json({ error: 'invalid_id' });
        return;
      }
      await deps.db.query('DELETE FROM user_measurements WHERE user_id = $1 AND id = $2', [res.locals.userId, id]);
      res.json({ ok: true });
    }),
  );

  return router;
}
