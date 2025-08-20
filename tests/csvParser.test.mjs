import { describe, it, expect } from 'vitest';
import { DateTime } from 'luxon';
import { findHeaderIndex, parseDayHeaders, deriveSegmentsFromCell } from '../server/lib/csvParser.mjs';

describe('csvParser', () => {
  it('findHeaderIndex finds the Employee header row', () => {
    const records = [
      ['Employee Schedule for Week 32'],
      ['','',''],
      ['Employee','Transporter ID','Aug 03, 2025','Total Days']
    ];
    const idx = findHeaderIndex(records);
    expect(idx).toBe(2);
  });

  it('parseDayHeaders recognizes day columns', () => {
    const header = ['Employee','Transporter ID','Aug 03, 2025','Aug 04, 2025','Total Days'];
    const map = parseDayHeaders(header);
    expect(Object.keys(map).length).toBe(2);
  });

  it('deriveSegmentsFromCell creates scheduled + pre/post trips', () => {
    const segs = deriveSegmentsFromCell('Wave 2 Extra Large Cargo Van - 10hr', '2025-08-03', 'America/Los_Angeles');
    expect(segs.length).toBe(3);
    expect(segs[0].duty_type).toBe('scheduled');
  });
});


