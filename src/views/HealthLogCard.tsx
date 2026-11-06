import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { t } from '../i18n';
import { formatCivilLong } from '../i18n/format';
import type { CivilDate } from '../lib/date';
import { useHealthLog } from '../hooks/useHealthLog';
import { LOG_TAGS, type LogTag } from '../pipeline/healthLog';
import { Card, CardHead } from '../ui/primitives';

const field = 'w-full rounded-lg bg-zinc-900 border border-zinc-700 px-2 py-1.5 text-caption text-zinc-100';

/** Body page: tag a day with what happened, and see the latest tags. */
export function HealthLogCard({ demo, today }: { demo: boolean; today: CivilDate }) {
  const { entries, add, remove } = useHealthLog(demo, today);
  const [date, setDate] = useState<CivilDate>(today);
  const [tag, setTag] = useState<LogTag>('sick');
  const [note, setNote] = useState('');
  const list = [...entries].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 20);
  const submit = async () => {
    await add({ date, at: new Date().toISOString(), tag, note });
    setNote('');
  };
  return (
    <Card>
      <CardHead title={t('healthLog.title')} hint={t('healthLog.hint')} />
      <div className="px-5 pb-5 space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-note text-zinc-500">
            {t('healthLog.date')}
            <input type="date" max={today} value={date} onChange={(e) => setDate(e.target.value as CivilDate)} className={`${field} mt-0.5 w-40`} />
          </label>
          <label className="text-note text-zinc-500">
            {t('healthLog.what')}
            <select value={tag} onChange={(e) => setTag(e.target.value as LogTag)} className={`${field} mt-0.5 w-44`}>
              {LOG_TAGS.map((k) => (
                <option key={k} value={k}>
                  {t('healthLog.tag', { tag: k })}
                </option>
              ))}
            </select>
          </label>
          <label className="text-note text-zinc-500 flex-1 min-w-40">
            {t('healthLog.note')}
            <input value={note} onChange={(e) => setNote(e.target.value)} className={`${field} mt-0.5`} />
          </label>
          <button type="button" onClick={submit} className="rounded-lg bg-zinc-100 text-zinc-900 px-3 py-1.5 text-caption font-medium">
            {t('healthLog.add')}
          </button>
        </div>
        {list.length ? (
          <div>
            {list.map((e) => (
              <div key={e.id ?? e.at} className="flex items-center gap-3 py-1.5 border-b border-zinc-800/60 last:border-0 text-caption">
                <span className="text-zinc-500 w-28 shrink-0">{formatCivilLong(e.date)}</span>
                <span className="text-zinc-200">{t('healthLog.tag', { tag: e.tag })}</span>
                {e.note && <span className="text-zinc-400 truncate">{e.note}</span>}
                {e.id && (
                  <button type="button" aria-label={t('healthLog.delete')} onClick={() => remove(e.id!)} className="ml-auto text-zinc-600 hover:text-rose-300">
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-caption text-zinc-500">{t('healthLog.none')}</p>
        )}
      </div>
    </Card>
  );
}
