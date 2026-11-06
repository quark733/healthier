import React, { useEffect, useState } from 'react';
import { CheckCircle2, Circle, Plane, ShieldPlus, Trash2 } from 'lucide-react';
import { t } from '../i18n';
import { formatCivilLong, formatInteger } from '../i18n/format';
import type { CivilDate } from '../lib/date';
import { addDays } from '../lib/date';
import { useCare } from '../hooks/useCare';
import { EVENT_TAGS, SITTING_DAY_STEPS, doseStatus, type CarePlan, type DoseSlot, type EventTag } from '../pipeline/care';
import type { DailyRecord } from '../types/health';
import { Card, CardHead } from '../ui/primitives';

/**
 * Clot care: for someone with a history of blood clots or on an anticoagulant. Today's doses,
 * yesterday's sitting, a travel checklist, and the warning signs, clots' and bleeding's, a tap away.
 * Nothing here detects a clot; it keeps the known triggers and the plan in view.
 */

const button = 'rounded-lg border px-3 py-1.5 text-caption';

export function ClotCard({ today, days, calfToday }: { today: CivilDate; days: DailyRecord[]; calfToday: boolean }) {
  const { plan, events, addEvent, removeEvent } = useCare();
  if (!plan.clotHistory && !plan.anticoagulant) return null;
  const doses = doseStatus(events, plan, today);
  const yesterday = days.find((d) => d.date === addDays(today, -1));
  const sitting = yesterday?.steps != null && yesterday.steps < SITTING_DAY_STEPS;
  const travel = events.find((e) => e.kind === 'event' && e.tag === 'travel' && e.date === today);

  const toggle = (slot: DoseSlot) => {
    const taken = doses?.[slot];
    if (taken?.id) return removeEvent(taken.id);
    return addEvent({ kind: 'dose', date: today, at: new Date().toISOString(), slot });
  };
  const toggleTravel = () =>
    travel?.id ? removeEvent(travel.id) : addEvent({ kind: 'event', date: today, at: new Date().toISOString(), tag: 'travel', note: '' });

  return (
    <Card>
      <div className="px-4 pt-4 pb-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <span className="card-title-glance text-zinc-500 flex items-center gap-1.5">
            <ShieldPlus size={14} className="text-rose-400" />
            {t('care.clot.title')}
          </span>
          <button
            type="button"
            onClick={toggleTravel}
            className={`${button} flex items-center gap-1.5 ${travel ? 'border-sky-500/50 text-sky-300' : 'border-zinc-700 text-zinc-400'}`}
          >
            <Plane size={13} />
            {t('care.travel.toggle', { on: travel ? 'yes' : 'no' })}
          </button>
        </div>

        {calfToday && (
          <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3">
            <p className="text-caption text-rose-200 font-medium">{t('care.calf.title')}</p>
            <p className="text-caption text-rose-100/90 mt-1 leading-relaxed">{t('care.calf.what')}</p>
          </div>
        )}

        {doses && (
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-caption text-zinc-300 mr-1">{plan.anticoagulant}</span>
              {(plan.dosesPerDay === 1 ? (['morning'] as DoseSlot[]) : (['morning', 'evening'] as DoseSlot[])).map((slot) => {
                const taken = !!doses[slot];
                return (
                  <button
                    key={slot}
                    type="button"
                    aria-pressed={taken}
                    onClick={() => toggle(slot)}
                    className={`${button} flex items-center gap-1.5 ${taken ? 'border-emerald-500/50 text-emerald-300' : 'border-zinc-700 text-zinc-300'}`}
                  >
                    {taken ? <CheckCircle2 size={14} /> : <Circle size={14} />}
                    {t('care.dose.slot', { slot })}
                  </button>
                );
              })}
            </div>
            <p className={`text-note mt-1.5 ${doses.missed ? 'text-amber-300' : 'text-zinc-500'}`}>
              {doses.days ? t('care.dose.missed', { missed: doses.missed, days: doses.days }) : t('care.dose.start')}
            </p>
          </div>
        )}

        {sitting && (
          <p className="text-caption text-zinc-400 leading-relaxed">{t('care.sitting', { steps: formatInteger(yesterday!.steps!) })}</p>
        )}

        {travel && (
          <div className="rounded-lg border border-sky-500/30 bg-sky-500/5 p-3">
            <p className="text-caption text-sky-200 font-medium">{t('care.travel.title')}</p>
            <ul className="mt-1 space-y-0.5 text-caption text-zinc-300 list-disc pl-4">
              {(['move', 'calf', 'water', 'dose', 'stockings'] as const).map((k) => (
                <li key={k}>{t('care.travel.items', { item: k, medicine: plan.anticoagulant ?? '' })}</li>
              ))}
            </ul>
          </div>
        )}

        <details className="text-caption text-zinc-400">
          <summary className="cursor-pointer text-zinc-300">{t('care.signs.title')}</summary>
          <p className="mt-2 font-medium text-zinc-200">{t('care.signs.clotTitle')}</p>
          <p className="leading-relaxed">{t('care.signs.clot')}</p>
          {plan.anticoagulant && (
            <>
              <p className="mt-2 font-medium text-zinc-200">{t('care.signs.bleedTitle')}</p>
              <p className="leading-relaxed">{t('care.signs.bleed')}</p>
              <p className="mt-2 leading-relaxed">{t('care.dose.forgot')}</p>
            </>
          )}
          {plan.contact && <p className="mt-2 text-zinc-300">{t('care.plan.contactLine', { contact: plan.contact })}</p>}
        </details>
      </div>
    </Card>
  );
}

const field = 'w-full rounded-lg bg-zinc-900 border border-zinc-700 px-2 py-1.5 text-caption text-zinc-100';

/** Body page: the care plan, typed in once. */
export function CarePlanCard() {
  const { plan, savePlan, loaded } = useCare();
  const [draft, setDraft] = useState<CarePlan>(plan);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  useEffect(() => setDraft(plan), [plan]);
  if (!loaded) return null;
  const save = async () => {
    setState('saving');
    try {
      await savePlan(draft);
      setState('saved');
    } catch {
      setState('failed');
    }
  };
  return (
    <Card>
      <CardHead title={t('care.plan.title')} hint={t('care.plan.hint')} />
      <div className="px-5 pb-5 space-y-3">
        <label className="flex items-center gap-2 text-caption text-zinc-300">
          <input type="checkbox" checked={draft.clotHistory} onChange={(e) => setDraft({ ...draft, clotHistory: e.target.checked })} />
          {t('care.plan.clotHistory')}
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="text-note text-zinc-500 sm:col-span-2">
            {t('care.plan.anticoagulant')}
            <input
              className={`${field} mt-0.5`}
              value={draft.anticoagulant ?? ''}
              placeholder={t('care.plan.anticoagulantPlaceholder')}
              onChange={(e) => setDraft({ ...draft, anticoagulant: e.target.value || null, dosesPerDay: e.target.value ? draft.dosesPerDay ?? 2 : null })}
            />
          </label>
          <label className="text-note text-zinc-500">
            {t('care.plan.dosesPerDay')}
            <select
              className={`${field} mt-0.5`}
              value={draft.dosesPerDay ?? 2}
              disabled={!draft.anticoagulant}
              onChange={(e) => setDraft({ ...draft, dosesPerDay: e.target.value === '1' ? 1 : 2 })}
            >
              <option value={1}>{t('care.plan.perDay', { n: 1 })}</option>
              <option value={2}>{t('care.plan.perDay', { n: 2 })}</option>
            </select>
          </label>
        </div>
        {draft.anticoagulant && (
          <label className="flex items-center gap-2 text-caption text-zinc-300">
            <input type="checkbox" checked={draft.trackDoses} onChange={(e) => setDraft({ ...draft, trackDoses: e.target.checked })} />
            {t('care.plan.trackDoses')}
          </label>
        )}
        <label className="block text-note text-zinc-500">
          {t('care.plan.contact')}
          <input className={`${field} mt-0.5`} value={draft.contact} placeholder={t('care.plan.contactPlaceholder')} onChange={(e) => setDraft({ ...draft, contact: e.target.value })} />
        </label>
        <label className="block text-note text-zinc-500">
          {t('care.plan.notes')}
          <textarea rows={3} className={`${field} mt-0.5`} value={draft.notes} placeholder={t('care.plan.notesPlaceholder')} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
        </label>
        <div className="flex items-center gap-3">
          <button type="button" onClick={save} disabled={state === 'saving'} className="rounded-lg bg-zinc-100 text-zinc-900 px-3 py-1.5 text-caption font-medium disabled:opacity-40">
            {t('care.plan.save')}
          </button>
          {state === 'saved' && <span className="text-caption text-emerald-300">{t('care.plan.saved')}</span>}
          {state === 'failed' && <span className="text-caption text-rose-300">{t('care.plan.failed')}</span>}
        </div>
      </div>
    </Card>
  );
}

/** Body page: the health log, tags on days. */
export function EventsCard({ today }: { today: CivilDate }) {
  const { events, addEvent, removeEvent } = useCare();
  const [date, setDate] = useState<CivilDate>(today);
  const [tag, setTag] = useState<EventTag>('sick');
  const [note, setNote] = useState('');
  const list = events.filter((e) => e.kind === 'event').sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 20);
  const add = async () => {
    await addEvent({ kind: 'event', date, at: new Date().toISOString(), tag, note });
    setNote('');
  };
  return (
    <Card>
      <CardHead title={t('care.log.title')} hint={t('care.log.hint')} />
      <div className="px-5 pb-5 space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-note text-zinc-500">
            {t('care.log.date')}
            <input type="date" max={today} value={date} onChange={(e) => setDate(e.target.value as CivilDate)} className={`${field} mt-0.5 w-40`} />
          </label>
          <label className="text-note text-zinc-500">
            {t('care.log.what')}
            <select value={tag} onChange={(e) => setTag(e.target.value as EventTag)} className={`${field} mt-0.5 w-44`}>
              {EVENT_TAGS.map((k) => (
                <option key={k} value={k}>
                  {t('care.log.tag', { tag: k })}
                </option>
              ))}
            </select>
          </label>
          <label className="text-note text-zinc-500 flex-1 min-w-40">
            {t('care.log.note')}
            <input value={note} onChange={(e) => setNote(e.target.value)} className={`${field} mt-0.5`} />
          </label>
          <button type="button" onClick={add} className="rounded-lg bg-zinc-100 text-zinc-900 px-3 py-1.5 text-caption font-medium">
            {t('care.log.add')}
          </button>
        </div>
        {list.length ? (
          <div>
            {list.map((e) =>
              e.kind === 'event' ? (
                <div key={e.id ?? e.at} className="flex items-center gap-3 py-1.5 border-b border-zinc-800/60 last:border-0 text-caption">
                  <span className="text-zinc-500 w-28 shrink-0">{formatCivilLong(e.date)}</span>
                  <span className="text-zinc-200">{t('care.log.tag', { tag: e.tag })}</span>
                  {e.note && <span className="text-zinc-400 truncate">{e.note}</span>}
                  {e.id && (
                    <button type="button" aria-label={t('care.log.delete')} onClick={() => removeEvent(e.id!)} className="ml-auto text-zinc-600 hover:text-rose-300">
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              ) : null,
            )}
          </div>
        ) : (
          <p className="text-caption text-zinc-500">{t('care.log.none')}</p>
        )}
      </div>
    </Card>
  );
}
