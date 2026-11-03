import { Router } from 'express';
import { readTargets, type Targets } from '../src/pipeline/targets';
import { requireUser } from './auth';
import { asyncHandler, type Deps } from './http';

/** The person's food and bodyweight targets: read, and replaced whole. */
export function targetsApiRoutes(deps: Deps): Router {
  const router = Router();
  router.use('/targets', requireUser(deps));

  router.get(
    '/targets',
    asyncHandler(async (req, res) => {
      const { rows } = await deps.db.query<{ value: unknown }>('SELECT value FROM user_targets WHERE user_id = $1', [res.locals.userId]);
      const targets: Targets = readTargets(rows[0]?.value);
      res.json({ targets });
    }),
  );

  router.put(
    '/targets',
    asyncHandler(async (req, res) => {
      const targets = readTargets(req.body?.targets);
      await deps.db.query(
        `INSERT INTO user_targets (user_id, value) VALUES ($1, $2::jsonb)
         ON CONFLICT (user_id) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [res.locals.userId, JSON.stringify(targets)],
      );
      res.json({ targets });
    }),
  );

  return router;
}
