import { Router } from 'express';
import { parseFoodImport, readFoodEntry, readMeal, readSavedMeal, savedMealEntries, scaleEntry, type FoodEntry } from '../src/pipeline/foodLog';
import { requireUser } from './auth';
import { asyncHandler, type Deps } from './http';
import {
  addFoodEntries,
  clearFoodDays,
  deleteFoodEntry,
  deleteSavedMeal,
  findSavedMeal,
  getFoodEntries,
  getFoodEntry,
  getSavedMeals,
  saveMeal,
  updateFoodAmounts,
} from './foodlog-repo';

/** The food diary from the Nutrition page: read, pasted in by the day, an entry added or deleted. */
export function foodLogApiRoutes(deps: Deps): Router {
  const router = Router();
  router.use('/food-log', requireUser(deps));
  router.use('/saved-meals', requireUser(deps));

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

  /** One entry, or several (`entries`, e.g. a meal copied to another day). */
  router.post(
    '/food-log',
    asyncHandler(async (req, res) => {
      const raw: unknown[] = Array.isArray(req.body?.entries) ? req.body.entries.slice(0, 80) : [req.body?.entry];
      const read = raw.map(readFoodEntry);
      if (!read.length || read.some((e) => e === null)) {
        res.status(400).json({ error: 'invalid_entry' });
        return;
      }
      const saved = await addFoodEntries(deps.db, res.locals.userId, read.map((e) => ({ ...e!, id: undefined })) as FoodEntry[]);
      res.json({ entry: saved[0], entries: saved });
    }),
  );

  /** A new weight for an entry; its kcal and macros scale with it. */
  router.patch(
    '/food-log/:id',
    asyncHandler(async (req, res) => {
      const e = await getFoodEntry(deps.db, res.locals.userId, String(req.params.id));
      const scaled = e ? scaleEntry(e, Number(req.body?.grams)) : null;
      if (!scaled) {
        res.status(e ? 400 : 404).json({ error: e ? 'invalid_grams' : 'not_found' });
        return;
      }
      await updateFoodAmounts(deps.db, res.locals.userId, scaled);
      res.json({ entry: scaled });
    }),
  );

  router.delete(
    '/food-log/:id',
    asyncHandler(async (req, res) => {
      const ok = await deleteFoodEntry(deps.db, res.locals.userId, String(req.params.id));
      res.status(ok ? 200 : 404).json({ ok });
    }),
  );

  router.get(
    '/saved-meals',
    asyncHandler(async (_req, res) => {
      res.json({ meals: await getSavedMeals(deps.db, res.locals.userId) });
    }),
  );

  /** Saves (or replaces, by name) a meal. */
  router.post(
    '/saved-meals',
    asyncHandler(async (req, res) => {
      const m = readSavedMeal(req.body?.meal);
      if (!m) {
        res.status(400).json({ error: 'invalid_meal' });
        return;
      }
      res.json({ meal: await saveMeal(deps.db, res.locals.userId, m) });
    }),
  );

  router.delete(
    '/saved-meals/:id',
    asyncHandler(async (req, res) => {
      const ok = await deleteSavedMeal(deps.db, res.locals.userId, String(req.params.id));
      res.status(ok ? 200 : 404).json({ ok });
    }),
  );

  /** Logs a saved meal on a day: { date, portion?, meal? }. */
  router.post(
    '/saved-meals/:id/log',
    asyncHandler(async (req, res) => {
      const m = await findSavedMeal(deps.db, res.locals.userId, String(req.params.id));
      const date = typeof req.body?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.body.date) ? req.body.date : null;
      if (!m || !date) {
        res.status(m ? 400 : 404).json({ error: m ? 'invalid_date' : 'not_found' });
        return;
      }
      const portion = Number(req.body?.portion ?? 1);
      const entries = savedMealEntries(m, date, portion, readMeal(req.body?.meal) ?? m.meal);
      res.json({ entries: await addFoodEntries(deps.db, res.locals.userId, entries) });
    }),
  );

  return router;
}
