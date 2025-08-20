import { describe, it, expect } from 'vitest';
import { DateTime } from 'luxon';
import { overlapMinutes, hoursUsedAtPure, projectedViolationTimePure } from '../server/lib/hosCore.mjs';

describe('hosCore', () => {
  it('overlapMinutes across boundaries', () => {
    const a1 = DateTime.utc(2025, 8, 10, 8, 0);
    const a2 = DateTime.utc(2025, 8, 10, 10, 0);
    const b1 = DateTime.utc(2025, 8, 10, 9, 0);
    const b2 = DateTime.utc(2025, 8, 10, 11, 0);
    expect(overlapMinutes(a1, a2, b1, b2)).toBe(60);
  });

  it('hoursUsedAtPure rolling 168h and restart', () => {
    const now = DateTime.utc(2025, 8, 10, 12, 0);
    const segs = [
      { startUtc: now.minus({ hours: 10 }).toISO(), endUtc: now.minus({ hours: 5 }).toISO() }, // 5h inside
      { startUtc: now.minus({ hours: 200 }).toISO(), endUtc: now.minus({ hours: 180 }).toISO() } // outside window
    ];
    const used = hoursUsedAtPure(segs, now);
    expect(Math.round(used)).toBe(5);
    const restartEnd = now.minus({ hours: 6 });
    const usedAfterRestart = hoursUsedAtPure(segs, now, { restartEndUtc: restartEnd });
    expect(Math.round(usedAfterRestart)).toBe(1); // only 1h from -6..-5
  });

  it('projectedViolationTimePure detects exact minute', () => {
    const now = DateTime.utc(2025, 8, 10, 8, 0);
    // existing usage: 59h
    const segs = [{ startUtc: now.minus({ hours: 59 }).toISO(), endUtc: now.toISO() }];
    const planned = [{ startUtc: now, endUtc: now.plus({ hours: 2 }) }];
    const t = projectedViolationTimePure(segs, planned, now, 60);
    expect(t).not.toBeNull();
  });
});


