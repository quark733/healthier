import { Router, type Request, type Response } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { addDays, todayCivilIn, type CivilDate } from '../src/lib/date';
import type { DailyRecord } from '../src/types/health';
import { readTargets } from '../src/pipeline/targets';
import { estimateExpenditure } from '../src/pipeline/expenditure';
import { histories, markerFor, rangeFor, statusOf, type LabResult } from '../src/pipeline/bloodwork';
import { readCheckin, type Checkin } from '../src/pipeline/checkin';
import { readMeasurement, bpSummary, waistSummary, type Measurement } from '../src/pipeline/measurements';
import { readLogEntry, type LogEntry } from '../src/pipeline/healthLog';
import { recentLoad, sessionSets, sessionVolume, type StrengthSession } from '../src/pipeline/strength';
import { setsPerMuscle } from '../src/pipeline/muscles';
import { getStrengthSessions } from './strength-repo';
import { getSyncState, getUser } from './repo';
import { loadHistory } from './sync';
import { randomToken, sha256 } from './crypto';
import { requireUser } from './auth';
import { asyncHandler, type Deps } from './http';

/**
 * A read-only MCP server over the person's own data, so Claude can answer questions from their
 * real numbers. Reached at /mcp/<read key>: the key is made on the Settings page, shown once,
 * stored only as a hash, and can be replaced or turned off there. It reads; it can't change or
 * delete anything. Every call reads the stored data afresh; nothing is cached or logged.
 */

const MAX_DAYS = 400;

async function userForReadKey(deps: Deps, key: string): Promise<string | null> {
  if (!/^hcr_[A-Za-z0-9_-]{20,}$/.test(key)) return null;
  const { rows } = await deps.db.query<{ user_id: string }>('SELECT user_id FROM mcp_keys WHERE key_hash = $1', [sha256(key)]);
  return rows[0]?.user_id ?? null;
}

const round = (v: number | null | undefined, d = 1) => (v === null || v === undefined ? null : Math.round(v * 10 ** d) / 10 ** d);

/** A day as Claude needs it: the readings, without the bookkeeping. */
function digest(d: DailyRecord) {
  const out: Record<string, unknown> = { date: d.date };
  const put = (k: string, v: unknown) => {
    if (v !== null && v !== undefined) out[k] = v;
  };
  put('steps', d.steps);
  put('activeMinutes', d.activeMinutes ? d.activeMinutes.moderate + d.activeMinutes.vigorous : null);
  put('totalKcal', d.totalKcal);
  put('weightKg', round(d.weightKg, 2));
  put('bodyFatPct', round(d.bodyFatPct, 1));
  put('eatenKcal', d.caloriesKcal);
  put('proteinG', d.proteinG);
  put('carbsG', d.carbsG);
  put('fatG', d.fatG);
  if (d.sleep) put('sleep', { minutesAsleep: d.sleep.minutesAsleep, bedtime: d.sleep.bedtimeIso, wake: d.sleep.wakeIso });
  put('restingHr', d.restingHr);
  put('hrvMs', round(d.hrv, 1));
  put('respiratoryRate', round(d.respiratoryRate, 1));
  put('spo2', d.spo2 ? round(d.spo2.avg, 1) : null);
  put('skinTempDeviationC', round(d.skinTempDeviationC, 2));
  put('vo2Max', round(d.vo2Max, 1));
  if (d.workouts?.length) put('workouts', d.workouts.map((w) => ({ kind: w.kind, name: w.name, minutes: w.minutes, kcal: w.kcal, avgHr: w.avgHr, km: w.distanceKm })));
  return out;
}

function sessionDigest(s: StrengthSession) {
  return {
    date: s.date,
    name: s.name,
    minutes: s.durationMin,
    sets: sessionSets(s),
    volumeKg: Math.round(sessionVolume(s)),
    ratings: s.ratings ?? null,
    exercises: s.exercises.map((e) => ({
      name: e.name,
      sets: e.sets.map((set) => ({ kg: set.loadKg, reps: set.reps, count: set.count, rpe: set.rpe ?? null, bodyweight: set.bodyweight || undefined })),
    })),
  };
}

const text = (data: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(data) }] });

function buildServer(deps: Deps, userId: string): McpServer {
  const server = new McpServer({ name: 'healthcheck', version: '1.0.0' });
  const range = { from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('First day, YYYY-MM-DD'), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Last day, YYYY-MM-DD') };

  const context = async () => {
    const user = await getUser(deps.db, userId);
    const days = (await loadHistory(deps, userId)) ?? [];
    const today = days.at(-1)?.date ?? todayCivilIn(user?.timeZone ?? 'Europe/Stockholm');
    return { user, days, today };
  };
  const query = async <T,>(sql: string, read: (v: any) => T | null, params: unknown[] = [userId]) => {
    const { rows } = await deps.db.query<{ id?: string; value: Record<string, unknown> }>(sql, params);
    return rows.map((r) => read({ ...r.value, id: r.id })).filter((x): x is T => x !== null);
  };

  server.registerTool(
    'get_overview',
    {
      description:
        "The person's current picture in one call: today's date, targets (food and weight goal), weight trend and the burn worked out from food and weight, the last 7 days' averages (food, steps, sleep, resting heart rate, HRV), training this week against the usual, sets per muscle, this morning's check-in, home blood pressure and waist, and blood test results outside the range or short of a goal.",
      inputSchema: {},
    },
    async () => {
      const { user, days, today } = await context();
      const targets = readTargets((await deps.db.query<{ value: unknown }>('SELECT value FROM user_targets WHERE user_id = $1', [userId])).rows[0]?.value);
      const week = days.filter((d) => d.date > addDays(today, -7) && d.date < today);
      const avg = (f: (d: DailyRecord) => number | null | undefined) => {
        const v = week.map(f).filter((x): x is number => typeof x === 'number');
        return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
      };
      const sessions = await getStrengthSessions(deps.db, userId);
      const checkins = await query<Checkin>(`SELECT value FROM user_checkins WHERE user_id = $1 AND date >= (now() - interval '30 days')::date ORDER BY date`, readCheckin);
      const measurements = await query<Measurement>(`SELECT id::text, value FROM user_measurements WHERE user_id = $1 AND taken_at >= now() - interval '60 days' ORDER BY taken_at`, readMeasurement);
      const labs = await labResults(deps, userId);
      const heightCm = ((await getSyncState(deps.db, userId))?.profile as { heightCm?: number | null } | undefined)?.heightCm ?? null;
      const load = recentLoad(sessions, today);
      return text({
        today,
        timeZone: user?.timeZone,
        gender: user?.gender ?? null,
        targets,
        latestWeightKg: [...days].reverse().find((d) => d.weightKg !== null)?.weightKg ?? null,
        expenditure: estimateExpenditure(days, today),
        last7Days: {
          eatenKcal: avg((d) => d.caloriesKcal),
          proteinG: avg((d) => d.proteinG),
          steps: avg((d) => d.steps),
          sleepMinutes: avg((d) => d.sleep?.minutesAsleep),
          restingHr: avg((d) => d.restingHr),
          hrvMs: avg((d) => d.hrv),
        },
        training: { thisWeek: load.week, usualWeek: load.usual, ratio: load.ratio, setsPerMuscle: setsPerMuscle(sessions, today).week, lastSession: sessions.at(-1)?.date ?? null },
        checkinToday: checkins.find((c) => c.date === today) ?? null,
        bloodPressure7d: bpSummary(measurements, today),
        waist: waistSummary(measurements, heightCm, today),
        bloodTestsToWatch: labs.filter((r) => r.status !== 'ok' && r.status !== 'unknown'),
      });
    },
  );

  server.registerTool(
    'get_days',
    { description: 'Daily readings for a range of days (at most 400): steps, energy, weight and body fat, food logged (kcal, protein, carbs, fat), sleep, resting heart rate, HRV, breathing rate, oxygen, skin temperature, workouts.', inputSchema: range },
    async ({ from, to }) => {
      const { days } = await context();
      return text(days.filter((d) => d.date >= from && d.date <= to).slice(-MAX_DAYS).map(digest));
    },
  );

  server.registerTool(
    'get_training',
    { description: 'Strength sessions from StrengthLog in a range: exercises, sets (kg, reps, count, RPE), volume and the ratings the person gave.', inputSchema: range },
    async ({ from, to }) => {
      const sessions = await getStrengthSessions(deps.db, userId);
      return text(sessions.filter((s) => s.date >= from && s.date <= to).map(sessionDigest));
    },
  );

  server.registerTool(
    'get_blood_tests',
    { description: "Every blood test result imported, with the lab's range, the status (low, high, watch = in range but short of a guideline goal, ok) and earlier values.", inputSchema: {} },
    async () => text(await labResults(deps, userId)),
  );

  server.registerTool(
    'get_journal',
    { description: 'In a range: morning check-ins (sleep quality, energy, soreness, stress, mood 1–5; late caffeine), home blood pressure and waist readings, and health log tags (ill, injury, travel, medicine change, hard week, symptom).', inputSchema: range },
    async ({ from, to }) => {
      const p = [userId, from, to];
      return text({
        checkins: await query<Checkin>(`SELECT value FROM user_checkins WHERE user_id = $1 AND date BETWEEN $2 AND $3 ORDER BY date`, readCheckin, p),
        measurements: (await query<Measurement>(`SELECT id::text, value FROM user_measurements WHERE user_id = $1 AND (value->>'date') BETWEEN $2 AND $3 ORDER BY taken_at`, readMeasurement, p)).map(({ id: _id, ...m }) => m),
        log: (await query<LogEntry>(`SELECT id::text, value FROM user_log WHERE user_id = $1 AND date BETWEEN $2 AND $3 ORDER BY date`, readLogEntry, p)).map(({ id: _id, ...e }) => e),
      });
    },
  );

  return server;
}

async function labResults(deps: Deps, userId: string) {
  const user = await getUser(deps.db, userId);
  const { rows } = await deps.db.query<{ date: string; name: string; value: number; cmp: string | null; unit: string | null; ref_low: number | null; ref_high: number | null }>(
    `SELECT to_char(date, 'YYYY-MM-DD') AS date, name, value, cmp, unit, ref_low, ref_high FROM user_lab_results WHERE user_id = $1 ORDER BY date`,
    [userId],
  );
  const results: LabResult[] = rows.map((r) => ({
    date: r.date as CivilDate,
    name: r.name,
    marker: markerFor(r.name)?.id ?? null,
    value: Number(r.value),
    cmp: r.cmp === '<' || r.cmp === '>' ? r.cmp : null,
    unit: r.unit,
    refLow: r.ref_low === null ? null : Number(r.ref_low),
    refHigh: r.ref_high === null ? null : Number(r.ref_high),
  }));
  return histories(results).map((h) => {
    const [low, high] = rangeFor(h.latest, user?.gender ?? null);
    return {
      marker: h.marker,
      name: h.name,
      date: h.latest.date,
      value: `${h.latest.cmp ?? ''}${h.latest.value}`,
      unit: h.latest.unit,
      range: { low, high },
      status: statusOf(h.latest, user?.gender ?? null),
      earlier: h.earlier.map((e) => ({ date: e.date, value: `${e.cmp ?? ''}${e.value}` })),
    };
  });
}

export function mcpRoutes(deps: Deps): Router {
  const router = Router();

  router.post(
    '/mcp/:key',
    asyncHandler(async (req: Request, res: Response) => {
      const userId = await userForReadKey(deps, String(req.params.key));
      if (!userId) {
        res.status(401).json({ jsonrpc: '2.0', error: { code: -32001, message: 'Unknown or revoked key' }, id: null });
        return;
      }
      // Stateless: a fresh server and transport for each request, nothing kept between them.
      const server = buildServer(deps, userId);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      res.on('close', () => {
        transport.close();
        server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    }),
  );
  // Stateless servers answer only POST.
  router.all('/mcp/:key', (_req, res) => {
    res.status(405).set('Allow', 'POST').json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed' }, id: null });
  });

  // The key, from the Settings page (signed in).
  router.use('/api/mcp-key', requireUser(deps));
  router.get(
    '/api/mcp-key',
    asyncHandler(async (_req, res) => {
      const { rows } = await deps.db.query<{ created_at: Date }>('SELECT created_at FROM mcp_keys WHERE user_id = $1', [res.locals.userId]);
      res.json({ hasKey: rows.length > 0, createdAt: rows[0]?.created_at ?? null });
    }),
  );
  router.post(
    '/api/mcp-key',
    asyncHandler(async (_req, res) => {
      const key = `hcr_${randomToken(32)}`;
      await deps.db.query(
        `INSERT INTO mcp_keys (user_id, key_hash) VALUES ($1, $2)
         ON CONFLICT (user_id) DO UPDATE SET key_hash = EXCLUDED.key_hash, created_at = now()`,
        [res.locals.userId, sha256(key)],
      );
      res.json({ key });
    }),
  );
  router.delete(
    '/api/mcp-key',
    asyncHandler(async (_req, res) => {
      await deps.db.query('DELETE FROM mcp_keys WHERE user_id = $1', [res.locals.userId]);
      res.json({ ok: true });
    }),
  );

  return router;
}
