import { Router } from 'express';
import { parseFoodImport, readFoodEntry } from '../src/pipeline/foodLog';
import { requireUser } from './auth';
import { asyncHandler, type Deps } from './http';
import { addFoodEntries, clearFoodDays, deleteFoodEntry, getFoodEntries } from './foodlog-repo';

/** The food diary from the Nutrition page: read, pasted in by the day, an entry added or deleted. */
export function foodLogApiRoutes(deps: Deps): Router {
  const router = Router();
  router.use('/food-log', requireUser(deps));

  router.get(
    '/food-log',
    asyncHandler(async (req, res) => {
      const from = typeof req.query.from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.from) ? req.query.from : undefined;
      const to = typeof req.query.to === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.to) ? req.query.to : undefined;
      res.json({ entries: await getFoodEntries(deps.db, res.locals.userId, from, to) });
    }),
  );

  /** Pasted lines; each day in them replaces what that day had. */
  router.post(
    '/food-log/import',
    asyncHandler(async (req, res) => {
      const { entries, unread } = parseFoodImport(typeof req.body?.text === 'string' ? req.body.text : '');
      if (!entries.length) {
        res.status(400).json({ error: 'nothing_read', unread });
        return;
      }
      const dates = [...new Set(entries.map((e) => e.date))];
      await clearFoodDays(deps.db, res.locals.userId, dates);
      const saved = await addFoodEntries(deps.db, res.locals.userId, entries);
      res.json({ saved: saved.length, days: dates, unread });
    }),
  );

  router.post(
    '/food-log',
    asyncHandler(async (req, res) => {
      const e = readFoodEntry(req.body?.entry);
      if (!e) {
        res.status(400).json({ error: 'invalid_entry' });
        return;
      }
      const [saved] = await addFoodEntries(deps.db, res.locals.userId, [e]);
      res.json({ entry: saved });
    }),
  );

  router.delete(
    '/food-log/:id',
    asyncHandler(async (req, res) => {
      const ok = await deleteFoodEntry(deps.db, res.locals.userId, String(req.params.id));
      res.status(ok ? 200 : 404).json({ ok });
    }),
  );

  return router;
}
