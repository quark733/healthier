import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Search, X } from 'lucide-react';
import { t } from '../i18n';
import { fmtNum } from '../ui/primitives';
import type { CivilDate } from '../lib/date';
import type { FoodLog } from '../hooks/useFoodLog';
import { MEALS, type Meal } from '../pipeline/foodLog';
import { entryFrom, historyFoods, isBarcode, searchHistory, type FoodMatch } from '../pipeline/foodSearch';
import { MacroLine } from './FoodDiaryCard';

/** The meal that fits the hour, for food logged today. */
function mealNow(): Meal {
  const h = new Date().getHours();
  return h < 10 ? 'breakfast' : h < 13 ? 'lunch' : h < 16 ? 'meal2' : h < 20 ? 'dinner' : 'evening';
}

/**
 * Reads a barcode off a photo. The browser's own BarcodeDetector where there is one (Chrome on
 * Android); ZXing otherwise (Safari on iPhone has no detector), loaded only when it's needed.
 */
async function readBarcode(file: File): Promise<string | null> {
  const url = URL.createObjectURL(file);
  try {
    const Detector = (window as any).BarcodeDetector;
    if (Detector) {
      try {
        const bitmap = await createImageBitmap(file);
        const found = await new Detector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] }).detect(bitmap);
        if (found?.[0]?.rawValue) return String(found[0].rawValue);
      } catch {
        // Fall through to ZXing.
      }
    }
    const { BrowserMultiFormatReader } = await import('@zxing/browser');
    const result = await new BrowserMultiFormatReader().decodeFromImageUrl(url);
    return result.getText();
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Finding a food and logging it: what's been eaten before (instant, from the diary), and, as you
 * type, packaged food from Open Food Facts and plain food from Livsmedelsverket. A photo of a
 * barcode looks the package up. Pick one, set the grams and the meal, and it's in the day.
 */
export function FoodSearch({ foodLog, date, today }: { foodLog: FoodLog; date: CivilDate; today: CivilDate }) {
  const { entries, findFood, copyTo, demo } = foodLog;
  const [q, setQ] = useState('');
  const [remote, setRemote] = useState<{ off: FoodMatch[]; slv: FoodMatch[] } | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'failed' | 'scanning' | 'noCode'>('idle');
  const [picked, setPicked] = useState<FoodMatch | null>(null);
  const [grams, setGrams] = useState('100');
  const [meal, setMeal] = useState<Meal>(mealNow());
  const [added, setAdded] = useState<string | null>(null);
  const photo = useRef<HTMLInputElement>(null);

  const history = useMemo(() => historyFoods(entries), [entries]);
  const mine = q.trim().length >= 2 && !isBarcode(q) ? searchHistory(history, q) : [];

  // The databases are asked once typing stops, from three letters (or a whole barcode).
  useEffect(() => {
    const query = q.trim();
    setRemote(null);
    if (demo || (query.length < 3 && !isBarcode(query))) return;
    let live = true;
    const timer = setTimeout(async () => {
      setState('loading');
      try {
        const r = await findFood(query);
        if (!live) return;
        setRemote(r);
        setState('idle');
        // A scanned or typed barcode that found its product goes straight to the grams.
        if (isBarcode(query) && r.off.length === 1) choose(r.off[0]);
      } catch {
        if (live) setState('failed');
      }
    }, 700);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [q, demo, findFood]);

  const choose = (m: FoodMatch) => {
    setPicked(m);
    setGrams(String(m.lastGrams ?? 100));
    setMeal(date === today ? mealNow() : (m.lastMeal ?? 'snack'));
    setAdded(null);
  };

  const g = Number(grams.replace(',', '.'));
  const entry = picked && Number.isFinite(g) && g > 0 && g <= 5000 ? entryFrom(picked, g, date, meal) : null;

  const add = async () => {
    if (!entry) return;
    await copyTo([entry], date);
    setAdded(entry.food);
    setPicked(null);
    setQ('');
  };

  const scan = async (file: File | undefined) => {
    if (!file) return;
    setState('scanning');
    const code = await readBarcode(file);
    if (photo.current) photo.current.value = '';
    if (code) {
      setState('idle');
      setQ(code);
    } else setState('noCode');
  };

  const row = (m: FoodMatch) => (
    <button
      key={`${m.source}:${m.id}`}
      type="button"
      onClick={() => choose(m)}
      className="w-full text-left rounded-lg px-2 py-1.5 hover:bg-zinc-800/70 flex items-baseline justify-between gap-3"
    >
      <span className="min-w-0">
        <span className="text-caption text-zinc-200">{m.name}</span>
        {m.brand && <span className="text-note text-zinc-500"> · {m.brand}</span>}
      </span>
      <span className="text-note text-zinc-500 tabular-nums shrink-0">
        {t('food.search.per100', { kcal: fmtNum(m.per100.kcal, 0), p: fmtNum(m.per100.protein, 1) })}
      </span>
    </button>
  );

  const group = (title: string, list: FoodMatch[]) =>
    list.length > 0 && (
      <div>
        <p className="text-micro uppercase tracking-wide text-zinc-500 px-2 mt-1">{title}</p>
        {list.map(row)}
      </div>
    );

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2">
        <label className="flex-1 flex items-center gap-2 rounded-lg bg-zinc-900 border border-zinc-700 px-2 py-1.5">
          <Search size={14} className="text-zinc-500 shrink-0" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPicked(null);
              setAdded(null);
              if (state !== 'loading') setState('idle');
            }}
            placeholder={t('food.search.placeholder')}
            aria-label={t('food.search.placeholder')}
            className="flex-1 min-w-0 bg-transparent text-caption text-zinc-100 outline-none"
          />
          {q && (
            <button type="button" aria-label={t('food.search.clear')} onClick={() => setQ('')} className="text-zinc-500 hover:text-zinc-200">
              <X size={14} />
            </button>
          )}
        </label>
        {!demo && (
          <>
            <button
              type="button"
              aria-label={t('food.search.scan')}
              title={t('food.search.scan')}
              onClick={() => photo.current?.click()}
              className="rounded-lg border border-zinc-700 p-2 text-zinc-300 hover:text-zinc-100"
            >
              <Camera size={15} />
            </button>
            <input ref={photo} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => scan(e.target.files?.[0])} />
          </>
        )}
      </div>

      {state !== 'idle' && !picked && (
        <p className={`text-note mt-1 ${state === 'failed' || state === 'noCode' ? 'text-rose-300' : 'text-zinc-500'}`}>{t('food.search.state', { state })}</p>
      )}
      {added && <p className="text-note text-purple-300 mt-1">{t('food.search.added', { food: added })}</p>}

      {picked ? (
        <div className="mt-2 rounded-lg border border-zinc-700 p-3 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <p className="text-caption text-zinc-100">
              {picked.name}
              {picked.brand && <span className="text-zinc-500"> · {picked.brand}</span>}
            </p>
            <button type="button" aria-label={t('food.search.clear')} onClick={() => setPicked(null)} className="text-zinc-500 hover:text-zinc-200">
              <X size={14} />
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={grams}
              onChange={(e) => setGrams(e.target.value)}
              inputMode="decimal"
              aria-label={t('food.search.grams')}
              className="w-20 rounded-lg bg-zinc-900 border border-zinc-700 px-2 py-1 text-caption text-zinc-100 tabular-nums"
            />
            <span className="text-caption text-zinc-400">{t('food.diary.gramUnit')}</span>
            <select
              value={meal}
              onChange={(e) => setMeal(e.target.value as Meal)}
              aria-label={t('food.search.meal')}
              className="rounded-lg bg-zinc-900 border border-zinc-700 px-2 py-1 text-caption text-zinc-100"
            >
              {MEALS.map((m) => (
                <option key={m} value={m}>
                  {t('food.diary.meal', { meal: m })}
                </option>
              ))}
            </select>
            <button type="button" disabled={!entry} onClick={add} className="rounded-lg bg-zinc-100 text-zinc-900 px-3 py-1 text-caption font-medium disabled:opacity-40">
              {t('food.search.add')}
            </button>
          </div>
          {entry && <MacroLine x={entry} className="block text-note" />}
          <p className="text-micro text-zinc-500">{t('food.search.source', { source: picked.source })}</p>
        </div>
      ) : (
        (mine.length > 0 || remote) && (
          <div className="mt-1 max-h-80 overflow-y-auto">
            {group(t('food.search.group', { source: 'history' }), mine)}
            {remote && group(t('food.search.group', { source: 'off' }), remote.off)}
            {remote && group(t('food.search.group', { source: 'slv' }), remote.slv)}
            {remote && !mine.length && !remote.off.length && !remote.slv.length && <p className="text-note text-zinc-500 px-2 mt-1">{t('food.search.none')}</p>}
          </div>
        )
      )}
    </div>
  );
}
