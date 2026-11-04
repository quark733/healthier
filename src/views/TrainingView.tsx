import React, { useMemo, useState } from 'react';
import { t } from '../i18n';
import { rich } from '../i18n/react';
import { formatCivilLong, formatCivilYear, formatInteger } from '../i18n/format';
import type { CivilDate } from '../lib/date';
import type { Point } from '../pipeline/derive';
import {
  bestOf, defaultExercise, exerciseProgress, exercisesByFrequency, personalBests, recentLoad, sessionSets, sessionVolume, setsByExercise,
  weeklyTotals, type StrengthSession,
} from '../pipeline/strength';
import { BarSeries, TrendChart } from '../charts';
import { Card, CardHead, EmptyState, Row, Segmented, Value, fmtNum } from '../ui/primitives';
import { ChartChips } from '../ui/ChartChips';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useStrength } from '../hooks/useStrength';
import { setsPerMuscle } from '../pipeline/muscles';
import { MuscleWeekRows } from './WellbeingCards';
import { WorkoutsCard } from './WorkoutsCard';
import type { DailyRecord } from '../types/health';

/**
 * Strength training from StrengthLog: what each session lifted, how this week compares with the
 * four before it, and how each lift's estimated one-rep max has moved. Every figure is arithmetic
 * on the logged sets (pipeline/strength.ts); the one-rep max is Epley's estimate, labelled so.
 */

const COLOR = {
  volume: 'var(--orange-400)',
  sets: 'var(--amber-400)',
  e1rm: 'var(--rose-400)',
} as const;

type SpanId = '12' | '26' | '52' | 'all';
type TrainingChart = 'volume' | 'sets' | 'lift';

const tonnes = (kg: number) => fmtNum(kg / 1000, kg >= 100_000 ? 0 : 1);

export function TrainingView({ demo, today, notice, days = [] }: { demo: boolean; today: CivilDate; notice?: string | null; days?: DailyRecord[] }) {
  const strength = useStrength(demo);
  const wide = useMediaQuery('(min-width: 768px)');
  const [span, setSpan] = useState<SpanId>('12');
  const [chart, setChart] = useState<TrainingChart>('volume');
  const [picked, setPicked] = useState<string | null>(null);

  const sessions = strength.data?.sessions ?? [];
  const weeksAll = useMemo(() => {
    if (!sessions.length) return 12;
    const first = sessions[0].date;
    return Math.max(12, Math.ceil((Date.parse(today) - Date.parse(first)) / (7 * 86_400_000)) + 1);
  }, [sessions, today]);
  const weeks = span === 'all' ? weeksAll : Number(span);
  const totals = useMemo(() => weeklyTotals(sessions, today, weeks), [sessions, today, weeks]);
  const exercises = useMemo(() => exercisesByFrequency(sessions), [sessions]);
  const lift = picked ?? defaultExercise(sessions);
  const progress = useMemo(() => (lift ? exerciseProgress(sessions, lift) : []), [sessions, lift]);

  if (!strength.data) {
    return <Card><EmptyState title={strength.error ? t('training.loadFailed') : t('training.loading')} detail={strength.error ?? undefined} /></Card>;
  }

  const link = <ConnectionCard demo={demo} strength={strength} notice={notice} />;
  const workouts = <WorkoutsCard days={days} today={today} />;
  if (!sessions.length) {
    return (
      <div className="space-y-3">
        {workouts}
        {link}
      </div>
    );
  }

  const latest = sessions[sessions.length - 1];
  const load = recentLoad(sessions, today);
  const muscles = setsPerMuscle(sessions, today);
  const perExercise = setsByExercise(sessions, today).slice(0, 8);
  const bests = personalBests(sessions).slice(0, 10);
  const since = (Date.parse(today) - Date.parse(totals[0].date)) / 86_400_000;
  const spanStart = totals[0].date;
  const progressInSpan = progress.filter((p) => p.date >= spanStart);

  const volumeSeries: Point[] = totals.map((w) => ({ date: w.date, value: w.sessions ? Math.round(w.volumeKg) : null }));
  const setsSeries: Point[] = totals.map((w) => ({ date: w.date, value: w.sessions ? w.sets : null }));
  const liftSeries: Point[] = progressInSpan.map((p) => ({ date: p.date, value: p.e1rm }));

  const volumeCard = (
    <Card>
      <CardHead title={t('training.volume.title')} hint={t('training.volume.hint')} />
      <div className="px-2 pb-3">
        <BarSeries series={volumeSeries} bucket="week" color={COLOR.volume} unit={t('units.kg')} height={210} />
      </div>
    </Card>
  );
  const setsCard = (
    <Card>
      <CardHead title={t('training.sets.title')} hint={t('training.sets.hint')} />
      <div className="px-2 pb-3">
        <BarSeries series={setsSeries} bucket="week" color={COLOR.sets} unit={t('training.units.sets')} height={200} />
      </div>
    </Card>
  );
  const liftCard = (
    <Card>
      <CardHead
        title={t('training.lift.title')}
        hint={t('training.lift.hint')}
        right={
          <select
            aria-label={t('training.lift.choose')}
            value={lift ?? ''}
            onChange={(e) => setPicked(e.target.value)}
            className="max-w-[12rem] bg-zinc-900 border border-zinc-800 rounded-md px-2 py-1 text-caption text-zinc-200"
          >
            {exercises.map((e) => (
              <option key={e.name} value={e.name}>{e.name}</option>
            ))}
          </select>
        }
      />
      <div className="px-2 pb-3">
        {liftSeries.some((p) => p.value !== null) ? (
          <TrendChart series={liftSeries} color={COLOR.e1rm} unit={t('units.kg')} height={200} meanWindow={null} format={(v) => fmtNum(v, 1)} />
        ) : (
          <EmptyState title={t('training.lift.none')} detail={t('training.lift.noneDetail')} />
        )}
      </div>
    </Card>
  );
  const charts: { key: TrainingChart; label: string; card: React.ReactNode }[] = [
    { key: 'volume', label: t('training.chips.volume'), card: volumeCard },
    { key: 'sets', label: t('training.chips.sets'), card: setsCard },
    { key: 'lift', label: t('training.chips.lift'), card: liftCard },
  ];
  const shown = charts.find((c) => c.key === chart) ?? charts[0];
  const muted = (w: React.ReactNode) => <span className="text-zinc-500">{w}</span>;
  const spanTotals = totals.reduce((a, w) => ({ sessions: a.sessions + w.sessions, sets: a.sets + w.sets, volumeKg: a.volumeKg + w.volumeKg }), { sessions: 0, sets: 0, volumeKg: 0 });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <LatestSession session={latest} />
        <ThisWeek load={load} />
      </div>

      <Card>
        <CardHead title={t('training.muscleWeek.title')} hint={t('training.muscleWeek.hint')} />
        <div className="px-5 pb-5">
          <MuscleWeekRows week={muscles.week} />
          {muscles.uncounted.length > 0 && (
            <p className="text-note text-zinc-500 mt-3">{t('training.muscleWeek.uncounted', { names: muscles.uncounted.join(', ') })}</p>
          )}
        </div>
      </Card>

      {workouts}

      <div className="flex items-center justify-between px-1 gap-3">
        <h2 className="text-section uppercase text-page-ink">{t('training.overTime.title')}</h2>
        <Segmented
          size="sm"
          value={span}
          onChange={setSpan}
          options={[
            { id: '12', label: t('training.span.twelve') },
            { id: '26', label: t('training.span.half') },
            { id: '52', label: t('training.span.year') },
            { id: 'all', label: t('training.span.all') },
          ]}
        />
      </div>

      <Card>
        <CardHead title={t('training.summary.title', { weeks: formatInteger(weeks) })} />
        <div className="px-5 pb-4">
          <Row dense={!wide} label={t('training.summary.sessions')}>
            {rich('training.summary.sessionsValue', { sessions: formatInteger(spanTotals.sessions), perWeek: fmtNum(spanTotals.sessions / Math.max(1, since / 7), 1), muted })}
          </Row>
          <Row dense={!wide} label={t('training.summary.sets')}>{formatInteger(spanTotals.sets)}</Row>
          <Row dense={!wide} label={t('training.summary.volume')}>{t('training.tonnes', { value: tonnes(spanTotals.volumeKg) })}</Row>
        </div>
      </Card>

      {wide ? (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {volumeCard}
            {setsCard}
          </div>
          {liftCard}
        </>
      ) : (
        <>
          <ChartChips label={t('training.chips.label')} options={charts} value={shown.key} onChange={setChart} />
          {shown.card}
        </>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card>
          <CardHead title={t('training.perExercise.title')} hint={t('training.perExercise.hint')} />
          <div className="px-5 pb-4">
            {perExercise.length ? (
              perExercise.map((e) => (
                <Row key={e.name} label={e.name}>
                  {rich('training.perExercise.value', { week: formatInteger(e.week), usual: fmtNum(e.usual, 1), muted })}
                </Row>
              ))
            ) : (
              <p className="text-caption text-zinc-500">{t('training.perExercise.none')}</p>
            )}
          </div>
        </Card>
        <Card>
          <CardHead title={t('training.bests.title')} hint={t('training.bests.hint')} />
          <div className="px-5 pb-4">
            {bests.map((b) => (
              <Row key={b.name} label={b.name}>
                {b.heaviest !== null
                  ? rich('training.bests.value', {
                      heaviest: fmtNum(b.heaviest, 1),
                      e1rm: b.e1rm !== null ? fmtNum(b.e1rm, 1) : '—',
                      date: formatCivilYear(b.heaviestOn!),
                      muted,
                    })
                  : t('training.bests.bodyweight')}
              </Row>
            ))}
          </div>
        </Card>
      </div>

      {link}
    </div>
  );
}

function LatestSession({ session }: { session: StrengthSession }) {
  const volume = sessionVolume(session);
  return (
    <Card>
      <CardHead title={t('training.latest.title', { date: formatCivilLong(session.date) })} hint={session.name} />
      <div className="px-5 pb-4">
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div>
            <div className="text-caption text-zinc-500">{t('training.latest.volume')}</div>
            <Value value={tonnes(volume)} unit={t('training.units.tonnes')} size="sm" />
          </div>
          <div>
            <div className="text-caption text-zinc-500">{t('training.latest.sets')}</div>
            <Value value={sessionSets(session)} size="sm" />
          </div>
          <div>
            <div className="text-caption text-zinc-500">{t('training.latest.duration')}</div>
            <Value value={session.durationMin} unit={t('units.minutes')} size="sm" />
          </div>
        </div>
        {session.exercises.map((e, i) => {
          const best = bestOf(e);
          const n = e.sets.reduce((sum, s) => sum + s.count, 0);
          return (
            <Row key={`${e.name}-${i}`} label={e.name}>
              {best.heaviest !== null
                ? t('training.latest.exercise', { sets: formatInteger(n), top: fmtNum(best.heaviest, 1) })
                : t('training.latest.exerciseBodyweight', { sets: formatInteger(n) })}
            </Row>
          );
        })}
      </div>
    </Card>
  );
}

function ThisWeek({ load }: { load: ReturnType<typeof recentLoad> }) {
  const muted = (w: React.ReactNode) => <span className="text-zinc-500">{w}</span>;
  const verdict =
    load.ratio === null ? null : load.ratio >= 1.3 ? 'more' : load.ratio <= 0.7 ? 'less' : 'usual';
  return (
    <Card>
      <CardHead title={t('training.week.title')} hint={t('training.week.hint')} />
      <div className="px-5 pb-4">
        <Row label={t('training.week.sessions')}>
          {load.usual ? rich('training.week.vsUsual', { now: formatInteger(load.week.sessions), usual: fmtNum(load.usual.sessions, 1), muted }) : formatInteger(load.week.sessions)}
        </Row>
        <Row label={t('training.week.sets')}>
          {load.usual ? rich('training.week.vsUsual', { now: formatInteger(load.week.sets), usual: fmtNum(load.usual.sets, 0), muted }) : formatInteger(load.week.sets)}
        </Row>
        <Row label={t('training.week.volume')}>
          {load.usual
            ? rich('training.week.vsUsualTonnes', { now: tonnes(load.week.volumeKg), usual: tonnes(load.usual.volumeKg), muted })
            : t('training.tonnes', { value: tonnes(load.week.volumeKg) })}
        </Row>
        {verdict && load.ratio !== null && (
          <p className="mt-3 text-caption text-zinc-400 leading-relaxed">
            {t('training.week.verdict', { verdict, percent: formatInteger(Math.round(Math.abs(load.ratio - 1) * 100)) })}
          </p>
        )}
      </div>
    </Card>
  );
}

function ConnectionCard({ demo, strength, notice }: { demo: boolean; strength: ReturnType<typeof useStrength>; notice?: string | null }) {
  const [pasting, setPasting] = useState(false);
  const [text, setText] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const data = strength.data!;
  const connected = data.connected;
  const noticeText =
    notice === 'connected' ? t('training.link.notice.connected') : notice ? t('training.link.notice.failed', { code: notice }) : null;
  const button = 'px-3 py-1.5 rounded-lg text-caption font-medium disabled:opacity-50';

  const paste = async () => {
    try {
      const r = await strength.importText(text);
      setResult(t('training.link.paste.done', { sessions: formatInteger(r.sessions) }));
      setText('');
      setPasting(false);
    } catch {
      setResult(t('training.link.paste.failed'));
    }
  };

  const makeKey = async () => {
    if (data.hasKey && !window.confirm(t('training.link.key.replaceConfirm'))) return;
    setKey(await strength.newKey());
  };

  return (
    <Card>
      <CardHead title={t('training.link.title')} hint={t('training.link.hint')} />
      <div className="px-5 pb-5 space-y-3">
        {noticeText && <p className="text-caption text-zinc-300">{noticeText}</p>}
        {demo ? (
          <p className="text-caption text-zinc-500">{t('training.link.demo')}</p>
        ) : (
          <>
            <Row label={t('training.link.status')}>
              {data.syncing
                ? t('training.link.syncing')
                : connected
                  ? t('training.link.connected')
                  : data.hasKey
                    ? t('training.link.scheduled')
                    : t('training.link.notConnected')}
            </Row>
            {data.lastSyncAt && <Row label={t('training.link.lastSync')}>{formatCivilLong(data.lastSyncAt.slice(0, 10))}</Row>}
            <Row label={t('training.link.stored')}>{t('training.link.storedValue', { count: data.sessions.length })}</Row>
            {data.lastError && <p className="text-caption text-rose-400">{data.lastError}</p>}
            {data.unread > 0 && <p className="text-caption text-amber-400">{t('training.link.unread', { count: data.unread })}</p>}
            <div className="flex flex-wrap gap-2">
              {connected && (
                <button type="button" disabled={data.syncing} onClick={() => void strength.sync()} className={`${button} bg-zinc-800 text-zinc-100 hover:bg-zinc-700`}>
                  {t('training.link.syncNow')}
                </button>
              )}
              <button type="button" onClick={() => void makeKey()} className={`${button} bg-zinc-800 text-zinc-100 hover:bg-zinc-700`}>
                {data.hasKey ? t('training.link.key.replace') : t('training.link.key.create')}
              </button>
              <button type="button" onClick={() => setPasting((p) => !p)} className={`${button} bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800`}>
                {t('training.link.paste.open')}
              </button>
              {data.sessions.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(t('training.link.disconnectConfirm'))) void strength.disconnect();
                  }}
                  className={`${button} text-zinc-500 hover:text-rose-400`}
                >
                  {t('training.link.disconnect')}
                </button>
              )}
            </div>
            {key && (
              <div className="space-y-1.5">
                <p className="text-caption text-zinc-400">{t('training.link.key.shown')}</p>
                <code className="block break-all bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-caption text-zinc-100 select-all">{key}</code>
              </div>
            )}
            {pasting && (
              <div className="space-y-2">
                <p className="text-caption text-zinc-500">{t('training.link.paste.hint')}</p>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={6}
                  aria-label={t('training.link.paste.label')}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-caption font-mono text-zinc-200"
                />
                <button type="button" disabled={!text.trim()} onClick={() => void paste()} className={`${button} bg-zinc-800 text-zinc-100 hover:bg-zinc-700`}>
                  {t('training.link.paste.save')}
                </button>
              </div>
            )}
            {result && <p className="text-caption text-zinc-400">{result}</p>}
          </>
        )}
      </div>
    </Card>
  );
}
