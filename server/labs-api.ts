import { Router } from 'express';
import { markerFor, parseLabText, type LabResult } from '../src/pipeline/bloodwork';
import { requireUser } from './auth';
import { asyncHandler, type Deps } from './http';

interface Row {
  date: string;
  name: string;
  value: number;
  cmp: string | null;
  unit: string | null;
  ref_low: number | null;
  ref_high: number | null;
}

const toResult = (r: Row): LabResult => ({
  date: typeof r.date === 'string' ? r.date.slice(0, 10) : new Date(r.date).toISOString().slice(0, 10),
  name: r.name,
  marker: markerFor(r.name)?.id ?? null,
  value: Number(r.value),
  cmp: r.cmp === '<' || r.cmp === '>' ? r.cmp : null,
  unit: r.unit,
  refLow: r.ref_low === null ? null : Number(r.ref_low),
  refHigh: r.ref_high === null ? null : Number(r.ref_high),
});

/**
 * Blood test results: all of them read, a report's text imported, everything deleted. The text is
 * parsed here as well as in the browser, so nothing the browser claims is stored unchecked; the
 * marker is matched again on every read, so a better match later applies to old results too.
 */
export function labsApiRoutes(deps: Deps): Router {
  const router = Router();
  router.use('/labs', requireUser(deps));

  router.get(
    '/labs',
    asyncHandler(async (req, res) => {
      const { rows } = await deps.db.query<Row>(
        `SELECT to_char(date, 'YYYY-MM-DD') AS date, name, value, cmp, unit, ref_low, ref_high
           FROM user_lab_results WHERE user_id = $1 ORDER BY date, name`,
        [res.locals.userId],
      );
      res.json({ results: rows.map(toResult) });
    }),
  );

  router.post(
    '/labs/import',
    asyncHandler(async (req, res) => {
      const text = typeof req.body?.text === 'string' ? req.body.text : '';
      const { results, unread } = parseLabText(text.slice(0, 200_000));
      if (!results.length) {
        res.status(400).json({ error: 'no_results', unread: unread.length });
        return;
      }
      const client = await deps.db.connect();
      try {
        await client.query('BEGIN');
        for (const r of results) {
          await client.query(
            `INSERT INTO user_lab_results (user_id, date, name, value, cmp, unit, ref_low, ref_high)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (user_id, date, name) DO UPDATE
               SET value = EXCLUDED.value, cmp = EXCLUDED.cmp, unit = EXCLUDED.unit,
                   ref_low = EXCLUDED.ref_low, ref_high = EXCLUDED.ref_high`,
            [res.locals.userId, r.date, r.name, r.value, r.cmp, r.unit, r.refLow, r.refHigh],
          );
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
      res.json({ imported: results.length, unread: unread.length });
    }),
  );

  router.delete(
    '/labs',
    asyncHandler(async (req, res) => {
      await deps.db.query('DELETE FROM user_lab_results WHERE user_id = $1', [res.locals.userId]);
      res.json({ ok: true });
    }),
  );

  return router;
}
