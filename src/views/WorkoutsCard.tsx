import React from 'react';
import { t } from '../i18n';
import { formatCivilLong, formatClock, formatInteger } from '../i18n/format';
import { addDays, type CivilDate } from '../lib/date';
import type { DailyRecord } from '../types/health';
import { workoutWeek, workoutsBetween } from '../pipeline/workouts';
import { Card, CardHead, Row, fmtNum } from '../ui/primitives';

/**
 * Every workout Google Health has from the last 7 days, newest first, and the last 7 days in
 * three numbers. This is the whole training picture for anyone without StrengthLog, and for
 * someone with it, the runs, walks and rides the strength cards don't see.
 */
export function WorkoutsCard({ days, today, strengthElsewhere = false }: { days: DailyRecord[]; today: CivilDate; strengthElsewhere?: boolean }) {
  // With StrengthLog connected, its sessions are in the cards above: list the rest here.
  const list = workoutsBetween(days, addDays(today, -6), today)
    .filter((w) => !strengthElsewhere || w.kind !== 'strength')
    .reverse();
  const week = workoutWeek(days, today);
  return (
    <Card>
      <CardHead title={t('training.workouts.title')} hint={t('training.workouts.hint')} />
      <div className="px-5 pb-5">
        {week.sessions ? (
          <>
            <Row label={t('training.workouts.week')}>
              {t('training.workouts.weekValue', { sessions: week.sessions, strength: week.strength, cardio: formatInteger(week.cardioMinutes) })}
            </Row>
            {!list.length && <p className="text-caption text-zinc-500 mt-2">{t('training.workouts.onlyStrength')}</p>}
            <div className="mt-2">
              {list.map((w) => (
                <Row
                  key={w.startIso}
                  label={t('training.workouts.when', {
                    name: w.name ?? t('training.workouts.kind', { kind: w.kind }),
                    date: formatCivilLong(w.date),
                    time: formatClock(w.startMinute),
                  })}
                >
                  {t('training.workouts.detail', {
                    minutes: formatInteger(w.minutes),
                    kcal: w.kcal === null ? 'none' : formatInteger(w.kcal),
                    hr: w.avgHr === null ? 'none' : formatInteger(w.avgHr),
                    km: w.distanceKm === null ? 'none' : fmtNum(w.distanceKm, 1),
                  })}
                </Row>
              ))}
            </div>
          </>
        ) : (
          <p className="text-caption text-zinc-500">{t('training.workouts.none')}</p>
        )}
      </div>
    </Card>
  );
}
