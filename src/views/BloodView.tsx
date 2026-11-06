import React, { useMemo, useRef, useState } from 'react';
import { hasMessage, t, type MessageKey } from '../i18n';
import { formatCivilYear, formatInteger, formatList } from '../i18n/format';
import { daysBetween, type CivilDate } from '../lib/date';
import { useLabs } from '../hooks/useLabs';
import { useCare } from '../hooks/useCare';
import { pdfLines } from '../lib/pdfText';
import {
  BLOOD_GROUPS, MARKERS, histories, latestRound, missingMarkers, rangeFor, statusOf,
  type BloodGroup, type LabResult, type MarkerHistory, type Status,
} from '../pipeline/bloodwork';
import { supplementAdvice, type SupplementVerdict } from '../pipeline/supplements';
import type { Gender } from '../pipeline/registry';
import { Card, CardHead, EmptyState, fmtNum } from '../ui/primitives';

/**
 * Blood tests: the person's lab results, latest first, judged against the lab's range and, for a
 * few markers, a guideline goal; what's worth a look, what to add at the next test, and which
 * supplements their results speak for or against. Every number comes from their own reports.
 */

const STATUS_STYLE: Record<Status, string> = {
  high: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  low: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  watch: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  ok: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25',
  unknown: 'bg-zinc-800 text-zinc-400 border-zinc-700',
};

const VERDICT_STYLE: Record<SupplementVerdict, string> = {
  take: 'text-emerald-300',
  consider: 'text-amber-300',
  timing: 'text-sky-300',
  skip: 'text-zinc-400',
  avoid: 'text-rose-300',
  test: 'text-violet-300',
};

const known = new Set(MARKERS.map((m) => m.id));
const nameOf = (h: { marker: string | null; name: string }) => (h.marker && known.has(h.marker) ? t(`blood.markers.${h.marker}.name` as MessageKey) : h.name);
const hasKey = hasMessage;

/** As many decimals as the lab gave, up to 2: 1.05 stays 1.05, 180 stays 180. */
const decimalsOf = (v: number) => {
  const str = String(v);
  const dot = str.indexOf('.');
  return dot < 0 ? 0 : Math.min(2, str.length - dot - 1);
};

function valueText(r: LabResult) {
  const n = fmtNum(r.value, decimalsOf(r.value));
  return `${r.cmp ?? ''}${n}${r.unit ? ` ${r.unit}` : ''}`;
}

function rangeText(lo: number | null, hi: number | null) {
  if (lo !== null && hi !== null) return t('blood.range.span', { low: fmtNum(lo, decimalsOf(lo)), high: fmtNum(hi, decimalsOf(hi)) });
  if (hi !== null) return t('blood.range.below', { high: fmtNum(hi, decimalsOf(hi)) });
  if (lo !== null) return t('blood.range.above', { low: fmtNum(lo, decimalsOf(lo)) });
  return t('blood.range.none');
}

/** The lab's range as a band, the result as a dot, and a guideline goal as a tick. */
function RangeBar({ r, gender }: { r: LabResult; gender: Gender | null }) {
  const [lo, hi] = rangeFor(r, gender);
  if (lo === null && hi === null) return null;
  const goal = MARKERS.find((m) => m.id === r.marker)?.goal;
  const span = lo !== null && hi !== null ? hi - lo : (hi ?? lo ?? 1);
  const min = lo !== null ? lo - span * 0.5 : 0;
  const max = hi !== null ? hi + span * 0.5 : (lo as number) + span * 1.0;
  const pos = (v: number) => `${Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100))}%`;
  const status = statusOf(r, gender);
  const dot = status === 'high' || status === 'low' ? 'bg-rose-400' : status === 'watch' ? 'bg-amber-400' : 'bg-emerald-400';
  const goalAt = goal?.below ?? goal?.above;
  return (
    <div className="relative h-2 rounded-full bg-zinc-800 mt-1.5" aria-hidden>
      <div className="absolute inset-y-0 rounded-full bg-emerald-500/25" style={{ left: lo === null ? '0%' : pos(lo), right: hi === null ? '0%' : `calc(100% - ${pos(hi)})` }} />
      {goalAt !== undefined && <div className="absolute -top-0.5 h-3 w-px bg-zinc-300/70" style={{ left: pos(goalAt) }} />}
      <div className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-3 w-3 rounded-full ring-2 ring-zinc-950 ${dot}`} style={{ left: pos(r.value) }} />
    </div>
  );
}

/** explainStatus: say what's behind this result's flag; otherwise, what the marker is. */
function MarkerRow({ h, gender, explainStatus = false }: { h: MarkerHistory; gender: Gender | null; explainStatus?: boolean }) {
  const r = h.latest;
  const status = statusOf(r, gender);
  const [lo, hi] = rangeFor(r, gender);
  const goal = MARKERS.find((m) => m.id === r.marker)?.goal;
  const prev = h.earlier.at(-1);
  const statusKey = `blood.markers.${h.marker}.${status}`;
  const aboutKey = `blood.markers.${h.marker}.about`;
  const explain = !h.marker
    ? null
    : explainStatus && hasKey(statusKey)
      ? t(statusKey as MessageKey)
      : hasKey(aboutKey)
        ? t(aboutKey as MessageKey)
        : null;
  return (
    <div className="py-2.5 border-b border-zinc-800/60 last:border-0">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <span className="text-detail text-zinc-200">{nameOf(h)}</span>
          {h.marker && <span className="hidden sm:inline text-note text-zinc-500 ml-2">{h.name}</span>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-detail tabular-nums text-zinc-100">{valueText(r)}</span>
          <span className={`text-note px-1.5 py-0.5 rounded border ${STATUS_STYLE[status]}`}>{t('blood.status', { status })}</span>
        </div>
      </div>
      <RangeBar r={r} gender={gender} />
      <div className="flex flex-wrap justify-between gap-x-3 text-note text-zinc-500 mt-1">
        <span>
          {rangeText(lo, hi)}
          {goal && h.marker && ` · ${t(`blood.markers.${h.marker}.goal` as MessageKey)}`}
        </span>
        {prev && <span>{t('blood.before', { value: valueText(prev), date: formatCivilYear(prev.date) })}</span>}
      </div>
      {explain && <p className="text-caption text-zinc-400 leading-relaxed mt-1.5">{explain}</p>}
    </div>
  );
}

export function BloodView({ demo, today, gender }: { demo: boolean; today: CivilDate; gender: Gender | null }) {
  const labs = useLabs(demo);
  const care = useCare();
  const all = useMemo(() => histories(labs.results), [labs.results]);
  const round = latestRound(labs.results);
  const latestDate = round?.date ?? null;
  const latestTest = round?.results ?? [];
  const flagged = all
    .map((h) => ({ h, s: statusOf(h.latest, gender) }))
    .filter((x) => x.s === 'high' || x.s === 'low' || x.s === 'watch')
    .sort((a, b) => (a.s === 'watch' ? 1 : 0) - (b.s === 'watch' ? 1 : 0));
  const outside = flagged.filter((x) => x.s !== 'watch').length;
  const latestByMarker = new Map(all.filter((h) => h.marker).map((h) => [h.marker!, h.latest]));
  const advice = supplementAdvice(latestByMarker, gender, care.plan);
  const missing = missingMarkers(latestTest);
  const ageDays = latestDate ? daysBetween(latestDate, today) : null;

  return (
    <div className="space-y-3">
      <Card>
        <CardHead title={t('blood.title')} hint={t('blood.hint')} />
        <div className="px-5 pb-5">
          {latestDate ? (
            <div className="flex flex-wrap gap-x-8 gap-y-2">
              <Stat label={t('blood.latest')} value={formatCivilYear(latestDate)} note={ageDays !== null ? t('blood.ago', { months: Math.round(ageDays / 30.4) }) : undefined} />
              <Stat label={t('blood.results')} value={formatInteger(all.length)} />
              <Stat label={t('blood.outside')} value={formatInteger(outside)} tone={outside ? 'text-rose-300' : undefined} />
              <Stat label={t('blood.watch')} value={formatInteger(flagged.length - outside)} tone={flagged.length - outside ? 'text-amber-300' : undefined} />
            </div>
          ) : (
            labs.loaded && <EmptyState title={t('blood.empty.title')} detail={t('blood.empty.detail')} />
          )}
          {ageDays !== null && ageDays > 180 && <p className="text-caption text-amber-300/90 mt-3">{t('blood.stale', { months: Math.round(ageDays / 30.4) })}</p>}
        </div>
      </Card>

      {flagged.length > 0 && (
        <Card>
          <CardHead title={t('blood.flagged.title')} hint={t('blood.flagged.hint')} />
          <div className="px-5 pb-4">
            {flagged.map(({ h, s }) => (
              <React.Fragment key={h.marker ?? h.name}>
                <MarkerRow h={h} gender={gender} explainStatus />
                {care.plan.clotHistory && s === 'high' && (h.marker === 'hb' || h.marker === 'hct') && (
                  <p className="text-caption text-amber-300/90 -mt-1 mb-2 leading-relaxed">{t('blood.clotNote')}</p>
                )}
              </React.Fragment>
            ))}
          </div>
        </Card>
      )}

      {latestDate && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
          <Card>
            <CardHead title={t('blood.supplements.title')} hint={t('blood.supplements.hint')} />
            <div className="px-5 pb-5 space-y-3">
              {advice.map((a) => (
                <div key={a.id}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-detail text-zinc-200">{t(`blood.supplements.items.${a.id}.name` as MessageKey)}</span>
                    <span className={`text-caption font-medium ${VERDICT_STYLE[a.verdict]}`}>{t('blood.supplements.verdict', { verdict: a.verdict })}</span>
                  </div>
                  <p className="text-caption text-zinc-400 leading-relaxed mt-0.5">
                    {t(`blood.supplements.items.${a.id}.${a.verdict}` as MessageKey, { value: a.from ? valueText(a.from) : '' })}
                  </p>
                </div>
              ))}
              <details className="text-note text-zinc-500">
                <summary className="cursor-pointer">{t('blood.sources')}</summary>
                <p className="mt-1 leading-relaxed">{t('blood.supplements.sources')}</p>
              </details>
            </div>
          </Card>

          <Card>
            <CardHead title={t('blood.next.title')} hint={t('blood.next.hint')} />
            <div className="px-5 pb-5 space-y-2.5">
              {flagged.length > 0 && (
                <p className="text-caption text-zinc-300">{t('blood.next.recheck', { names: formatList(flagged.map(({ h }) => nameOf(h))) })}</p>
              )}
              {missing.map((m) => (
                <div key={m}>
                  <p className="text-detail text-zinc-200">{t(`blood.markers.${m}.name` as MessageKey)}</p>
                  <p className="text-caption text-zinc-400 leading-relaxed">{t(`blood.next.why.${m}` as MessageKey)}</p>
                </div>
              ))}
              {!missing.length && <p className="text-caption text-zinc-400">{t('blood.next.complete')}</p>}
              <p className="text-note text-zinc-500">{t('blood.next.how')}</p>
            </div>
          </Card>
        </div>
      )}

      {BLOOD_GROUPS.map((g) => {
        const rows = all.filter((h) => h.marker && MARKERS.find((m) => m.id === h.marker)?.group === g);
        if (!rows.length) return null;
        const order = (h: MarkerHistory) => MARKERS.findIndex((m) => m.id === h.marker);
        return <GroupCard key={g} group={g} rows={rows.sort((a, b) => order(a) - order(b))} gender={gender} />;
      })}
      {all.some((h) => !h.marker) && <GroupCard group="other" rows={all.filter((h) => !h.marker)} gender={gender} />}

      <ImportCard demo={demo} labs={labs} />

      <p className="text-note text-zinc-500 px-1 leading-relaxed">{t('blood.disclaimer')}</p>
    </div>
  );
}

function Stat({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: string }) {
  return (
    <div>
      <p className="text-caption text-zinc-500">{label}</p>
      <p className={`text-section tabular-nums ${tone ?? 'text-zinc-100'}`}>{value}</p>
      {note && <p className="text-note text-zinc-500">{note}</p>}
    </div>
  );
}

function GroupCard({ group, rows, gender }: { group: BloodGroup | 'other'; rows: MarkerHistory[]; gender: Gender | null }) {
  const flagged = rows.filter((h) => statusOf(h.latest, gender) !== 'ok' && statusOf(h.latest, gender) !== 'unknown').length;
  return (
    <Card>
      <details open={flagged > 0}>
        <summary className="px-5 py-4 cursor-pointer flex items-baseline justify-between gap-3 list-none">
          <span className="card-title-detail text-zinc-50">{t('blood.groups', { group })}</span>
          <span className="text-caption text-zinc-500">{t('blood.groupCount', { count: rows.length, flagged })}</span>
        </summary>
        <div className="px-5 pb-4">
          {rows.map((h) => (
            <MarkerRow key={h.marker ?? h.name} h={h} gender={gender} />
          ))}
        </div>
      </details>
    </Card>
  );
}

function ImportCard({ demo, labs }: { demo: boolean; labs: ReturnType<typeof useLabs> }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const run = async (input: string) => {
    setBusy(true);
    setMessage(null);
    try {
      const r = await labs.importText(input);
      setMessage(t('blood.import.done', { count: r.imported }));
      setText('');
    } catch {
      setMessage(t('blood.import.failed'));
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    setMessage(null);
    try {
      await run(await pdfLines(f));
    } catch {
      setMessage(t('blood.import.failed'));
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHead title={t('blood.import.title')} hint={t('blood.import.hint')} />
      <div className="px-5 pb-5 space-y-3">
        {demo ? (
          <p className="text-caption text-zinc-500">{t('blood.import.demo')}</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => file.current?.click()}
                className="rounded-lg bg-zinc-100 text-zinc-900 px-3 py-1.5 text-caption font-medium disabled:opacity-40"
              >
                {t('blood.import.pdf')}
              </button>
              <input ref={file} type="file" accept="application/pdf" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
              <span className="text-note text-zinc-500">{t('blood.import.pdfNote')}</span>
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              placeholder={t('blood.import.placeholder')}
              className="w-full rounded-lg bg-zinc-900 border border-zinc-700 p-2 text-caption text-zinc-200 font-mono"
            />
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={busy || !text.trim()}
                onClick={() => run(text)}
                className="rounded-lg border border-zinc-600 px-3 py-1.5 text-caption text-zinc-200 disabled:opacity-40"
              >
                {t('blood.import.paste')}
              </button>
              {labs.results.length > 0 && (
                <button type="button" disabled={busy} onClick={() => labs.clear()} className="text-caption text-zinc-500 hover:text-rose-300 ml-auto">
                  {t('blood.import.clear')}
                </button>
              )}
            </div>
          </>
        )}
        {message && <p className="text-caption text-zinc-300">{message}</p>}
      </div>
    </Card>
  );
}
