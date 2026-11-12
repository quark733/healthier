import React, { useMemo, useState } from 'react';
import { Bookmark, ChevronLeft, ChevronRight, Copy, Plus, Trash2, X } from 'lucide-react';
import { t } from '../i18n';
import { rich } from '../i18n/react';
import { formatCivilLong, formatInteger, formatMonthYear, weekdayLetter } from '../i18n/format';
import { addDays, isoWeekdayIndex, type CivilDate } from '../lib/date';
import type { DailyRecord } from '../types/health';
import type { FoodLog } from '../hooks/useFoodLog';
import { useTargets } from '../hooks/useTargets';
import { byDate, mealsOf, savedMealEntries, totalsOf, weekAverage, type FoodEntry, type FoodTotals, type Meal } from '../pipeline/foodLog';
import { Card, CardHead, fmtNum } from '../ui/primitives';

/**
 * The food diary as a calendar: a month of days, each with what was eaten, and the chosen day's
 * meals, foods, grams and macros, its total and what was left of the targets. Days Claude wrote
 * (or that were pasted) are the diary; a day with only a diary app's numbers shows those.
 */

/** Energy and the macros in the colours the Nutrition charts use. */
const COLOR = { energy: 'var(--amber-400)', protein: 'var(--rose-400)', carbs: 'var(--teal-400)', fat: 'var(--violet-400)' } as const;

const n0 = (v: number) => formatInteger(Math.round(v));
const macros = (x: { kcal: number; protein: number; carbs: number; fat: number }) => ({
  kcal: n0(x.kcal),
  p: n0(x.protein),
  c: n0(x.carbs),
  f: n0(x.fat),
});

/** The Monday-first weeks that cover the month `month` ('YYYY-MM'). */
function monthGrid(month: string): (CivilDate | null)[] {
  const first = `${month}-01` as CivilDate;
  const cells: (CivilDate | null)[] = Array.from({ length: isoWeekdayIndex(first) }, () => null);
  for (let d = first; d.startsWith(month); d = addDays(d, 1)) cells.push(d);
  while (cells.length % 7) cells.push(null);
  return cells;
}

function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number);
  const i = y * 12 + (m - 1) + by;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
}

export function FoodDiaryCard({ days, today, foodLog }: { days: DailyRecord[]; today: CivilDate; foodLog: FoodLog }) {
  const { entries, importText, remove, setGrams, copyTo } = foodLog;
  const [copied, setCopied] = useState<string | null>(null);
  const { targets } = useTargets();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [chosen, setChosenRaw] = useState<CivilDate>(today);
  const setChosen = (d: CivilDate) => {
    setChosenRaw(d);
    setCopied(null);
  };
  const [pasting, setPasting] = useState(false);

  const dated = useMemo(() => byDate(entries), [entries]);
  const record = useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);
  const cells = monthGrid(month);
  const monday = addDays(`${month}-01` as CivilDate, -isoWeekdayIndex(`${month}-01` as CivilDate));
  const dayEntries = dated.get(chosen) ?? [];
  const appDay = record.get(chosen);
  const total = dayEntries.length ? totalsOf(dayEntries) : null;
  // Fat's floor: half a gram per kilo of the latest weight, to the nearest 5 g.
  const weight = [...days].reverse().find((d) => d.weightKg !== null)?.weightKg ?? null;
  const fatFloor = weight === null ? null : Math.round((weight * 0.5) / 5) * 5;

  return (
    <Card>
      <CardHead title={t('nutrition.diary.title')} hint={t('nutrition.diary.hint')} />
      <div className="px-5 pb-5 grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-5">
        <div>
          <div className="flex items-center justify-between mb-2">
            <button type="button" aria-label={t('nutrition.diary.prev')} onClick={() => setMonth((m) => shiftMonth(m, -1))} className="p-1 text-zinc-400 hover:text-zinc-100">
              <ChevronLeft size={16} />
            </button>
            <span className="text-detail text-zinc-200">{formatMonthYear(month)}</span>
            <button
              type="button"
              aria-label={t('nutrition.diary.next')}
              disabled={month >= today.slice(0, 7)}
              onClick={() => setMonth((m) => shiftMonth(m, 1))}
              className="p-1 text-zinc-400 hover:text-zinc-100 disabled:opacity-30"
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center">
            {Array.from({ length: 7 }, (_, i) => (
              <span key={`h${i}`} className="text-note text-zinc-500">
                {weekdayLetter(addDays(monday, i))}
              </span>
            ))}
            {cells.map((d, i) => {
              if (!d) return <span key={`e${i}`} />;
              const diary = dated.get(d);
              const kcal = diary ? totalsOf(diary).kcal : record.get(d)?.caloriesKcal;
              const future = d > today;
              const on = d === chosen;
              return (
                <button
                  key={d}
                  type="button"
                  disabled={future}
                  onClick={() => setChosen(d)}
                  className={`rounded-lg py-1 flex flex-col items-center leading-tight border ${
                    on ? 'border-amber-400/70 bg-amber-400/10' : 'border-transparent hover:bg-zinc-800/60'
                  } ${future ? 'opacity-30' : ''}`}
                >
                  <span className={`text-caption ${d === today ? 'text-zinc-100 font-semibold' : 'text-zinc-300'}`}>{Number(d.slice(8))}</span>
                  <span className={`text-micro tabular-nums ${diary ? 'text-amber-300' : 'text-zinc-600'}`}>
                    {kcal !== undefined && kcal > 0 ? n0(kcal) : ' '}
                  </span>
                  {diary && targets.kcal !== null && (
                    <span className="mt-0.5 h-0.5 w-6 rounded-full bg-zinc-800 overflow-hidden">
                      <span className="block h-full" style={{ width: `${Math.min(100, (100 * (kcal ?? 0)) / targets.kcal)}%`, background: COLOR.energy }} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <p className="text-note text-zinc-500 mt-2">{t('nutrition.diary.legend')}</p>
        </div>

        <div>
          <p className="text-detail text-zinc-100 mb-1">{formatCivilLong(chosen)}</p>
          <WeekLine days={days} end={chosen} targets={targets} />
          <SavedMeals foodLog={foodLog} date={chosen} />
          {total ? (
            <>
              <Bars total={total} targets={targets} fatFloor={fatFloor} />
              {mealsOf(dayEntries).map((m) => (
                <div key={m.meal} className="mb-3">
                  <div className="flex items-center justify-between gap-3 border-b border-zinc-800 pb-1 mb-1">
                    <span className="text-caption font-medium text-zinc-200">{t('nutrition.diary.meal', { meal: m.meal })}</span>
                    <span className="flex items-center gap-2">
                      <MacroLine x={m.totals} className="text-note" />
                      <SaveMeal meal={m.meal} entries={m.entries} onSave={foodLog.saveMeal} />
                      {chosen !== today && (
                        <button
                          type="button"
                          aria-label={t('nutrition.diary.copy')}
                          title={t('nutrition.diary.copy')}
                          onClick={() => void copyTo(m.entries, today).then(() => setCopied(m.meal))}
                          className="text-zinc-500 hover:text-amber-300"
                        >
                          <Copy size={12} />
                        </button>
                      )}
                    </span>
                  </div>
                  {copied === m.meal && chosen !== today && <p className="text-note text-amber-300 mb-1">{t('nutrition.diary.copied')}</p>}
                  {m.entries.map((e) => (
                    <div key={e.id ?? e.food} className="flex items-start justify-between gap-3 py-0.5">
                      <div className="min-w-0">
                        <p className="text-caption text-zinc-300 flex flex-wrap items-baseline gap-x-1.5">
                          <span>{e.food}</span>
                          {e.grams !== null && e.id ? (
                            <GramsEdit grams={e.grams} onSave={(g) => setGrams(e.id!, g)} />
                          ) : e.grams !== null ? (
                            <span className="text-zinc-500">{t('nutrition.diary.grams', { grams: fmtNum(e.grams, 0) })}</span>
                          ) : null}
                        </p>
                        <MacroLine x={e} className="block text-note" />
                      </div>
                      {e.id && (
                        <button type="button" aria-label={t('nutrition.diary.delete')} onClick={() => remove(e.id!)} className="text-zinc-600 hover:text-rose-300 mt-0.5">
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ))}
              <DayTotal total={total} />
            </>
          ) : appDay?.caloriesKcal !== undefined ? (
            <p className="text-caption text-zinc-400">
              {t('nutrition.diary.fromApp', {
                kcal: n0(appDay.caloriesKcal),
                p: n0(appDay.proteinG ?? 0),
                c: n0(appDay.carbsG ?? 0),
                f: n0(appDay.fatG ?? 0),
              })}
            </p>
          ) : (
            <p className="text-caption text-zinc-500">{t('nutrition.diary.empty')}</p>
          )}
        </div>

        <div className="lg:col-span-2">
          <p className="text-note text-zinc-500">{t('nutrition.diary.claude')}</p>
          <button type="button" onClick={() => setPasting((p) => !p)} className="mt-2 text-caption text-zinc-400 hover:text-zinc-200 underline underline-offset-2">
            {t('nutrition.diary.paste', { open: pasting ? 'yes' : 'no' })}
          </button>
          {pasting && <Paste importText={importText} onDone={(d) => d && setChosen(d)} />}
        </div>
      </div>
    </Card>
  );
}

function DayTotal({ total }: { total: FoodTotals }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-zinc-700 pt-2">
      <span className="text-caption font-medium text-zinc-200">{t('nutrition.diary.total')}</span>
      <span className="text-right">
        <MacroLine x={total} className="block text-caption text-zinc-200" />
        <span className="block text-note text-zinc-500 tabular-nums">
          {t('nutrition.diary.extra', { sat: fmtNum(total.satFat, 1), salt: fmtNum(total.salt, 1) })}
        </span>
      </span>
    </div>
  );
}

/**
 * The day against what matters most while dieting: energy and protein, each a bar with what's
 * left. Carbs and fat are shown as amounts, fat with a floor (0.5 g per kg) rather than a target.
 * Neutral colours: going over is shown, not scolded.
 */
function Bars({ total, targets, fatFloor }: { total: FoodTotals; targets: ReturnType<typeof useTargets>['targets']; fatFloor: number | null }) {
  const rows = [
    { key: 'kcal', got: total.kcal, target: targets.kcal, color: COLOR.energy, unit: 'kcal' },
    { key: 'protein', got: total.protein, target: targets.proteinG, color: COLOR.protein, unit: 'g' },
  ] as const;
  return (
    <div className="mb-4">
      <div className="grid grid-cols-2 gap-x-4">
        {rows.map((r) => {
          if (r.target === null) return null;
          const left = r.target - r.got;
          const pct = Math.min(100, (100 * r.got) / r.target);
          return (
            <div key={r.key}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-caption font-medium" style={{ color: r.color }}>
                  {t('nutrition.diary.bar', { what: r.key })}
                </span>
                <span className="text-note text-zinc-400 tabular-nums">
                  {t('nutrition.diary.of', { got: n0(r.got), target: n0(r.target), unit: r.unit })}
                </span>
              </div>
              <div className="h-2 rounded-full bg-zinc-800 mt-1 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: r.color, opacity: left < 0 ? 0.6 : 1 }} />
              </div>
              <p className="text-caption text-zinc-200 tabular-nums mt-0.5">
                {t('nutrition.diary.leftOver', { over: left < 0 ? 'yes' : 'no', amount: n0(Math.abs(left)), unit: r.unit })}
              </p>
            </div>
          );
        })}
      </div>
      <p className="text-note text-zinc-400 tabular-nums mt-2">
        {rich('nutrition.diary.carbsFat', {
          c: (w) => <span style={{ color: COLOR.carbs }}>{w}</span>,
          f: (w) => <span style={{ color: COLOR.fat }}>{w}</span>,
          carbs: n0(total.carbs),
          fat: n0(total.fat),
          floor: fatFloor === null ? 'none' : String(fatFloor),
          low: fatFloor !== null && total.fat < fatFloor ? 'yes' : 'no',
        })}
      </p>
    </div>
  );
}

/** The last seven days' average energy and protein against the targets. */
function WeekLine({ days, end, targets }: { days: DailyRecord[]; end: CivilDate; targets: ReturnType<typeof useTargets>['targets'] }) {
  const w = weekAverage(days, end);
  if (!w) return null;
  return (
    <p className="text-note text-zinc-400 tabular-nums mb-3">
      {t('nutrition.diary.week', {
        kcal: n0(w.kcal),
        protein: n0(w.protein),
        n: w.days,
        kcalTarget: targets.kcal === null ? 'none' : n0(targets.kcal),
        proteinTarget: targets.proteinG === null ? 'none' : n0(targets.proteinG),
      })}
    </p>
  );
}

/** One tap logs a saved meal on the day shown; × forgets it. */
function SavedMeals({ foodLog, date }: { foodLog: FoodLog; date: CivilDate }) {
  const { saved, logSaved, deleteSaved } = foodLog;
  if (!saved.length) return null;
  return (
    <div className="mb-4">
      <p className="text-note text-zinc-500 mb-1">{t('nutrition.diary.savedTitle')}</p>
      <div className="flex flex-wrap gap-1.5">
        {saved.map((m) => (
          <span key={m.id ?? m.name} className="inline-flex items-center rounded-full border border-zinc-700 bg-zinc-900/60 text-caption">
            <button type="button" onClick={() => void logSaved(m, date)} className="pl-2.5 pr-1.5 py-1 text-zinc-200 hover:text-amber-300 flex items-center gap-1">
              <Plus size={12} />
              {t('nutrition.diary.savedChip', { name: m.name, kcal: n0(totalsOf(savedMealEntries(m, date)).kcal) })}
            </button>
            {m.id && (
              <button type="button" aria-label={t('nutrition.diary.savedDelete', { name: m.name })} onClick={() => void deleteSaved(m.id!)} className="pr-2 pl-0.5 text-zinc-600 hover:text-rose-300">
                <X size={11} />
              </button>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Saves a day's meal under a name; the meal's name is offered. */
function SaveMeal({ meal, entries, onSave }: { meal: Meal; entries: FoodEntry[]; onSave: FoodLog['saveMeal'] }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [done, setDone] = useState(false);
  const save = async () => {
    if (!name.trim()) return;
    await onSave(name.trim(), meal, entries);
    setOpen(false);
    setDone(true);
  };
  if (!open) {
    return (
      <button
        type="button"
        aria-label={t('nutrition.diary.saveMeal')}
        title={t('nutrition.diary.saveMeal')}
        onClick={() => {
          setName(t('nutrition.diary.meal', { meal }));
          setOpen(true);
        }}
        className={done ? 'text-amber-300' : 'text-zinc-500 hover:text-amber-300'}
      >
        <Bookmark size={12} />
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      <input
        autoFocus
        aria-label={t('nutrition.diary.saveMeal')}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void save();
          if (e.key === 'Escape') setOpen(false);
        }}
        className="w-28 rounded bg-zinc-900 border border-amber-400/60 px-1 py-0 text-note text-zinc-100"
      />
      <button type="button" onClick={() => void save()} className="text-note text-amber-300">
        {t('nutrition.diary.saveMealGo')}
      </button>
    </span>
  );
}

/** kcal, then protein, carbs and fat in their colours. */
function MacroLine({ x, className = '' }: { x: { kcal: number; protein: number; carbs: number; fat: number }; className?: string }) {
  return (
    <span className={`tabular-nums text-zinc-400 ${className}`}>
      {rich('nutrition.diary.macroLine', {
        ...macros(x),
        p: (w) => <span style={{ color: COLOR.protein }}>{w}</span>,
        c: (w) => <span style={{ color: COLOR.carbs }}>{w}</span>,
        f: (w) => <span style={{ color: COLOR.fat }}>{w}</span>,
        pv: n0(x.protein),
        cv: n0(x.carbs),
        fv: n0(x.fat),
      })}
    </span>
  );
}

/** The weight, tapped to change it; Enter or leaving the field saves, Escape cancels. */
function GramsEdit({ grams, onSave }: { grams: number; onSave: (g: number) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(grams));
  const [failed, setFailed] = useState(false);
  const save = async () => {
    setEditing(false);
    const g = Number(value.replace(',', '.'));
    if (!Number.isFinite(g) || g <= 0 || g === grams) return;
    try {
      setFailed(false);
      await onSave(g);
    } catch {
      setFailed(true);
    }
  };
  if (!editing) {
    return (
      <button
        type="button"
        aria-label={t('nutrition.diary.editGrams')}
        onClick={() => {
          setValue(String(grams));
          setEditing(true);
        }}
        className={`tabular-nums underline decoration-dotted underline-offset-2 ${failed ? 'text-rose-300' : 'text-zinc-400 hover:text-zinc-100'}`}
      >
        {t('nutrition.diary.grams', { grams: fmtNum(grams, 0) })}
      </button>
    );
  }
  return (
    <span className="inline-flex items-baseline gap-1">
      <input
        autoFocus
        inputMode="decimal"
        aria-label={t('nutrition.diary.editGrams')}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void save();
          if (e.key === 'Escape') setEditing(false);
        }}
        className="w-16 rounded bg-zinc-900 border border-amber-400/60 px-1 py-0 text-caption text-zinc-100 tabular-nums"
      />
      <span className="text-zinc-500">{t('nutrition.diary.gramUnit')}</span>
    </span>
  );
}

function Paste({ importText, onDone }: { importText: FoodLog['importText']; onDone: (date: CivilDate | null) => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ saved: number; unread: number } | 'failed' | null>(null);
  const save = async () => {
    setBusy(true);
    try {
      const r = await importText(text);
      setResult({ saved: r.saved, unread: r.unread.length });
      const first = /^(\d{4}-\d{2}-\d{2})/.exec(text.trim());
      onDone(first ? (first[1] as CivilDate) : null);
      setText('');
    } catch {
      setResult('failed');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-2 space-y-2">
      <p className="text-note text-zinc-500">{t('nutrition.diary.pasteHint')}</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-2 py-1.5 text-note text-zinc-100 font-mono"
      />
      <div className="flex items-center gap-3">
        <button type="button" disabled={!text.trim() || busy} onClick={save} className="rounded-lg bg-zinc-100 text-zinc-900 px-3 py-1.5 text-caption font-medium disabled:opacity-40">
          {t('nutrition.diary.save')}
        </button>
        {result && (
          <span className={`text-caption ${result === 'failed' ? 'text-rose-300' : 'text-zinc-400'}`}>
            {result === 'failed' ? t('nutrition.diary.failed') : t('nutrition.diary.saved', { n: result.saved, unread: result.unread })}
          </span>
        )}
      </div>
    </div>
  );
}
