import React, { useState } from 'react';
import { Activity, Ruler, Trash2 } from 'lucide-react';
import { t } from '../i18n';
import { formatCivilLong, formatClock, formatInteger } from '../i18n/format';
import type { CivilDate } from '../lib/date';
import { useMeasurements } from '../hooks/useMeasurements';
import { bpSummary, HOME_BP_HIGH, waistSummary, type Measurement } from '../pipeline/measurements';
import { Card, CardHead, Row, fmtNum } from '../ui/primitives';

/**
 * Blood pressure and waist taken by hand: a form to add a reading, the home average against the
 * European line, the waist against height, and (on the Body page) the readings themselves.
 */

const input = 'w-20 rounded-lg bg-zinc-900 border border-zinc-700 px-2 py-1.5 text-detail text-zinc-100 tabular-nums';
const primary = 'rounded-lg bg-zinc-100 text-zinc-900 px-3 py-1.5 text-caption font-medium disabled:opacity-40';

function localMinutes(at: string) {
  const d = new Date(at);
  return d.getHours() * 60 + d.getMinutes();
}

function AddForms({ today, onDone }: { today: CivilDate; onDone?: () => void }) {
  const { add } = useMeasurements();
  const [sys, setSys] = useState('');
  const [dia, setDia] = useState('');
  const [pulse, setPulse] = useState('');
  const [waist, setWaist] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const num = (s: string) => (s.trim() ? Number(s.replace(',', '.')) : NaN);

  const save = async (m: Measurement) => {
    setBusy(true);
    setError(false);
    try {
      await add(m);
      onDone?.();
      return true;
    } catch {
      setError(true);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const saveBp = async () => {
    const ok = await save({ kind: 'bp', at: new Date().toISOString(), date: today, sys: num(sys), dia: num(dia), pulse: pulse.trim() ? num(pulse) : null });
    if (ok) [setSys, setDia, setPulse].forEach((f) => f(''));
  };
  const saveWaist = async () => {
    const ok = await save({ kind: 'waist', at: new Date().toISOString(), date: today, cm: num(waist) });
    if (ok) setWaist('');
  };
  const bpReady = Number.isFinite(num(sys)) && Number.isFinite(num(dia));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-note text-zinc-500">
          {t('measure.bp.sys')}
          <input inputMode="numeric" className={`${input} block mt-0.5`} value={sys} onChange={(e) => setSys(e.target.value)} />
        </label>
        <label className="text-note text-zinc-500">
          {t('measure.bp.dia')}
          <input inputMode="numeric" className={`${input} block mt-0.5`} value={dia} onChange={(e) => setDia(e.target.value)} />
        </label>
        <label className="text-note text-zinc-500">
          {t('measure.bp.pulse')}
          <input inputMode="numeric" className={`${input} block mt-0.5`} value={pulse} onChange={(e) => setPulse(e.target.value)} />
        </label>
        <button type="button" className={primary} disabled={!bpReady || busy} onClick={saveBp}>
          {t('measure.bp.save')}
        </button>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-note text-zinc-500">
          {t('measure.waist.cm')}
          <input inputMode="decimal" className={`${input} block mt-0.5`} value={waist} onChange={(e) => setWaist(e.target.value)} />
        </label>
        <button type="button" className={primary} disabled={!Number.isFinite(num(waist)) || busy} onClick={saveWaist}>
          {t('measure.waist.save')}
        </button>
      </div>
      {error && <p className="text-caption text-rose-300">{t('measure.failed')}</p>}
    </div>
  );
}

function Summaries({ today, heightCm, compact = false }: { today: CivilDate; heightCm: number | null; compact?: boolean }) {
  const { list } = useMeasurements();
  const bp = bpSummary(list, today);
  const waist = waistSummary(list, heightCm, today);
  return (
    <div>
      <Row label={t('measure.bp.label')}>
        {bp ? (
          <span className={bp.high ? 'text-amber-300' : undefined}>
            {t('measure.bp.value', { sys: formatInteger(Math.round(bp.sys)), dia: formatInteger(Math.round(bp.dia)), n: bp.n })}
          </span>
        ) : (
          t('measure.none')
        )}
      </Row>
      <Row label={t('measure.waist.label')}>
        {waist
          ? t('measure.waist.value', {
              cm: fmtNum(waist.latest.cm, 1),
              change: waist.change4w === null ? 'none' : `${waist.change4w > 0 ? '+' : ''}${fmtNum(waist.change4w, 1)}`,
            })
          : t('measure.none')}
      </Row>
      {!compact && waist?.ratio != null && (
        <Row label={t('measure.waist.ratio')}>{t('measure.waist.ratioValue', { ratio: fmtNum(waist.ratio, 2), band: waist.band ?? 'none' })}</Row>
      )}
      {!compact && bp && (
        <p className="text-note text-zinc-500 mt-1.5 leading-relaxed">
          {t('measure.bp.verdict', {
            high: bp.high ? 'yes' : 'no',
            lineSys: HOME_BP_HIGH.sys,
            lineDia: HOME_BP_HIGH.dia,
            before: bp.before ? `${Math.round(bp.before.sys)}/${Math.round(bp.before.dia)}` : 'none',
          })}
        </p>
      )}
    </div>
  );
}

/** Today: the two numbers in a row, and the form behind a button. */
export function MeasurementsRow({ today, heightCm }: { today: CivilDate; heightCm: number | null }) {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <div className="px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <span className="card-title-glance text-zinc-500 flex items-center gap-1.5">
            <Activity size={14} className="text-rose-400" />
            {t('measure.title')}
          </span>
          <button type="button" onClick={() => setOpen((o) => !o)} className="text-caption text-zinc-400 hover:text-zinc-200 underline underline-offset-2">
            {open ? t('measure.close') : t('measure.add')}
          </button>
        </div>
        <div className="mt-1">
          <Summaries today={today} heightCm={heightCm} compact={!open} />
        </div>
        {open && (
          <div className="mt-3 pt-3 border-t border-zinc-800">
            <AddForms today={today} onDone={() => setOpen(false)} />
          </div>
        )}
      </div>
    </Card>
  );
}

/** Body page: the form, the summaries, how to measure, and the last readings. */
export function MeasurementsCard({ today, heightCm }: { today: CivilDate; heightCm: number | null }) {
  const { list, remove } = useMeasurements();
  const recent = [...list].reverse().slice(0, 14);
  return (
    <Card>
      <CardHead title={t('measure.title')} hint={t('measure.hint')} />
      <div className="px-5 pb-5 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
        <div className="space-y-4">
          <AddForms today={today} />
          <Summaries today={today} heightCm={heightCm} />
        </div>
        <div>
          <p className="text-caption text-zinc-500 mb-1 flex items-center gap-1.5">
            <Ruler size={13} />
            {t('measure.recent')}
          </p>
          {recent.length ? (
            recent.map((m) => (
              <div key={m.id ?? m.at} className="flex items-center justify-between gap-3 py-1.5 border-b border-zinc-800/60 last:border-0 text-caption">
                <span className="text-zinc-400">{`${formatCivilLong(m.date)} ${formatClock(localMinutes(m.at))}`}</span>
                <span className="text-zinc-200 tabular-nums ml-auto">
                  {m.kind === 'bp'
                    ? t('measure.bp.reading', { sys: m.sys, dia: m.dia, pulse: m.pulse === null ? 'none' : String(m.pulse) })
                    : t('measure.waist.reading', { cm: fmtNum(m.cm, 1) })}
                </span>
                {m.id && (
                  <button type="button" aria-label={t('measure.delete')} onClick={() => remove(m.id!)} className="text-zinc-600 hover:text-rose-300">
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            ))
          ) : (
            <p className="text-caption text-zinc-500">{t('measure.none')}</p>
          )}
        </div>
      </div>
    </Card>
  );
}
