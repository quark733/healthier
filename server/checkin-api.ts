import { Router } from 'express';
import { readCheckin, type Checkin } from '../src/pipeline/checkin';
import { requireUser } from './auth';
import { asyncHandler, type Deps } from './http';

/** The morning check-ins: the last 60 days read, one day's answers written. */
export function checkinApiRoutes(deps: Deps): Router {
  const router = Router();
  router.use('/checkins', requireUser(deps));

  router.get(
    '/checkins',
    asyncHandler(async (req, res) => {
      const { rows } = await deps.db.query<{ value: unknown }>(
        `SELECT value FROM user_checkins WHERE user_id = $1 AND date >= (now() - interval '60 days')::date ORDER BY date`,
        [res.locals.userId],
      );
      const checkins = rows.map((r) => readCheckin(r.value)).filter((c): c is Checkin => c !== null);
      res.json({ checkins });
    }),
  );

  router.put(
    '/checkins',
    asyncHandler(async (req, res) => {
      const c = readCheckin(req.body?.checkin);
      if (!c) {
        res.status(400).json({ error: 'invalid_checkin' });
        return;
      }
      await deps.db.query(
        `INSERT INTO user_checkins (user_id, date, value) VALUES ($1, $2, $3::jsonb)
         ON CONFLICT (user_id, date) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [res.locals.userId, c.date, JSON.stringify(c)],
      );
      res.json({ checkin: c });
    }),
  );

  return router;
}
