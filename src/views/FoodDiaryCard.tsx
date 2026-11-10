import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { t } from '../i18n';
import { formatCivilLong, formatInteger, formatMonthYear, weekdayLetter } from '../i18n/format';
import { addDays, isoWeekdayIndex, type CivilDate } from '../lib/date';
import type { DailyRecord } from '../types/health';
import type { FoodLog } from '../hooks/useFoodLog';
import { useTargets } from '../hooks/useTargets';
import { byDate, mealsOf, totalsOf, type FoodTotals } from '../pipeline/foodLog';
import { Card, CardHead, fmtNum } from '../ui/primitives';

/**
 * The food diary as a calendar: a month of days, each with what was eaten, and the chosen day's
 * meals, foods, grams and macros, its total and what was left of the targets. Days Claude wrote
 * (or that were pasted) are the diary; a day with only a diary app's numbers shows those.
 */

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
  const { entries, importText, remove } = foodLog;
  const { targets } = useTargets();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [chosen, setChosen] = useState<CivilDate>(today);
  const [pasting, setPasting] = useState(false);

  const dated = useMemo(() => byDate(entries), [entries]);
  const record = useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);
  const cells = monthGrid(month);
  const monday = addDays(`${month}-01` as CivilDate, -isoWeekdayIndex(`${month}-01` as CivilDate));
  const dayEntries = dated.get(chosen) ?? [];
  const appDay = record.get(chosen);
  const total = dayEntries.length ? totalsOf(dayEntries) : null;

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
                </button>
              );
            })}
          </div>
          <p className="text-note text-zinc-500 mt-2">{t('nutrition.diary.legend')}</p>
        </div>

        <div>
          <p className="text-detail text-zinc-100 mb-2">{formatCivilLong(chosen)}</p>
          {total ? (
            <>
              {mealsOf(dayEntries).map((m) => (
                <div key={m.meal} className="mb-3">
                  <div className="flex items-baseline justify-between gap-3 border-b border-zinc-800 pb-1 mb-1">
                    <span className="text-caption font-medium text-zinc-200">{t('nutrition.diary.meal', { meal: m.meal })}</span>
                    <span className="text-note text-zinc-400 tabular-nums">{t('nutrition.diary.macros', macros(m.totals))}</span>
                  </div>
                  {m.entries.map((e) => (
                    <div key={e.id ?? e.food} className="flex items-start justify-between gap-3 py-0.5">
                      <div className="min-w-0">
                        <p className="text-caption text-zinc-300">
                          {t('nutrition.diary.item', { food: e.food, grams: e.grams === null ? 'none' : fmtNum(e.grams, 0) })}
                        </p>
                        <p className="text-note text-zinc-500 tabular-nums">{t('nutrition.diary.macros', macros(e))}</p>
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
              <Left total={total} targets={targets} />
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
        <span className="block text-caption text-zinc-100 tabular-nums">{t('nutrition.diary.macros', macros(total))}</span>
        <span className="block text-note text-zinc-500 tabular-nums">
          {t('nutrition.diary.extra', { sat: fmtNum(total.satFat, 1), salt: fmtNum(total.salt, 1) })}
        </span>
      </span>
    </div>
  );
}

function Left({ total, targets }: { total: FoodTotals; targets: ReturnType<typeof useTargets>['targets'] }) {
  if (targets.kcal === null && targets.proteinG === null) return null;
  const left = (target: number | null, got: number) => (target === null ? 'none' : n0(target - got));
  return (
    <div className="flex items-baseline justify-between gap-3 pt-1.5">
      <span className="text-caption text-zinc-500">{t('nutrition.diary.left')}</span>
      <span className="text-caption text-zinc-300 tabular-nums text-right">
        {t('nutrition.diary.leftValue', {
          kcal: left(targets.kcal, total.kcal),
          p: left(targets.proteinG, total.protein),
          c: left(targets.carbsG, total.carbs),
          f: left(targets.fatG, total.fat),
        })}
      </span>
    </div>
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
