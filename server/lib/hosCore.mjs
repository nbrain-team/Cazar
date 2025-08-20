import { DateTime } from 'luxon';

export function overlapMinutes(aStart, aEnd, bStart, bEnd) {
  const startMs = Math.max(aStart.valueOf(), bStart.valueOf());
  const endMs = Math.min(aEnd.valueOf(), bEnd.valueOf());
  return Math.max(0, Math.floor((endMs - startMs) / 60000));
}

/**
 * segments: Array<{ startUtc: ISO string | DateTime, endUtc: ISO string | DateTime }>
 * nowUtc: DateTime
 * opts: { otherEmployerMinutesLast7d?: number, restartEndUtc?: DateTime | null }
 */
export function hoursUsedAtPure(segments, nowUtc, opts = {}) {
  const other = Number(opts.otherEmployerMinutesLast7d || 0);
  const restartEnd = opts.restartEndUtc || null;
  const windowStart = restartEnd && restartEnd < nowUtc ? restartEnd : nowUtc.minus({ hours: 168 });
  let minutes = 0;
  for (const seg of segments) {
    const s = DateTime.isDateTime(seg.startUtc) ? seg.startUtc : DateTime.fromISO(String(seg.startUtc), { zone: 'utc' });
    const e = DateTime.isDateTime(seg.endUtc) ? seg.endUtc : DateTime.fromISO(String(seg.endUtc), { zone: 'utc' });
    if (e <= windowStart || s >= nowUtc) continue;
    minutes += overlapMinutes(s, e, windowStart, nowUtc);
  }
  minutes += other;
  return minutes / 60.0;
}

/**
 * plannedSegments: Array<{ startUtc: DateTime, endUtc: DateTime }>
 * Returns DateTime | null of projected violation moment, using limitHours (default 60)
 */
export function projectedViolationTimePure(existingSegments, plannedSegments, startNow, limitHours = 60, opts = {}) {
  const limitMin = Math.round(limitHours * 60);
  const now = startNow;
  let usedMin = Math.round(hoursUsedAtPure(existingSegments, now, opts) * 60);
  let t = now;
  const segments = plannedSegments.map(s => ({ start: s.startUtc, end: s.endUtc }));
  for (const seg of segments) {
    // As time advances, minutes roll off from the window
    let cur = seg.start < t ? t : seg.start;
    while (cur < seg.end) {
      const next = cur.plus({ minutes: 1 });
      // minutes rolling off at this minute
      const windowStart = next.minus({ hours: 168 });
      for (const es of existingSegments) {
        const s = DateTime.isDateTime(es.startUtc) ? es.startUtc : DateTime.fromISO(String(es.startUtc), { zone: 'utc' });
        const e = DateTime.isDateTime(es.endUtc) ? es.endUtc : DateTime.fromISO(String(es.endUtc), { zone: 'utc' });
        // if exact one minute at (windowStart, windowStart+1m) was counted, subtract
        const roll = overlapMinutes(s, e, windowStart, windowStart.plus({ minutes: 1 }));
        if (roll > 0) usedMin -= roll;
      }
      usedMin += 1; // this on-duty minute
      if (usedMin >= limitMin) return next;
      cur = next;
      t = next;
    }
  }
  return null;
}


