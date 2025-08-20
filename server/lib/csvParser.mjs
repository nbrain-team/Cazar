import { DateTime } from 'luxon';

export function findHeaderIndex(records) {
  for (let i = 0; i < Math.min(records.length, 20); i++) {
    const row = records[i].map((c) => String(c || '').trim());
    if (row[0] === 'Employee' && row.includes('Total Days')) return i;
  }
  return -1;
}

export function parseDayHeaders(headerRow) {
  const map = {};
  headerRow.forEach((h, idx) => {
    const s = String(h || '').trim();
    if (/^[A-Z][a-z]{2}\s\d{2},\s\d{4}$/.test(s)) {
      map[idx] = { label: s, isDay: true };
    }
  });
  return map;
}

export function deriveSegmentsFromCell(cell, serviceDate, tz) {
  const text = String(cell || '').trim();
  const segments = [];
  if (!text || text === '0') return segments;
  const range = /(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/.exec(text);
  let start, end;
  if (range) {
    const [_, ah, am, bh, bm] = range;
    start = DateTime.fromISO(serviceDate, { zone: tz }).set({ hour: Number(ah), minute: Number(am) });
    end = DateTime.fromISO(serviceDate, { zone: tz }).set({ hour: Number(bh), minute: Number(bm) });
    if (end <= start) end = end.plus({ days: 1 });
  } else {
    const hoursMatch = /(\d{1,2}(?:\.\d{1,2})?)/.exec(text);
    const hrs = hoursMatch ? Number(hoursMatch[1]) : 10;
    start = DateTime.fromISO(serviceDate, { zone: tz }).set({ hour: 8, minute: 0 });
    end = start.plus({ hours: isFinite(hrs) ? hrs : 10 });
  }
  segments.push({ duty_type: 'scheduled', start, end, confidence: 0.7 });
  segments.push({ duty_type: 'pretrip', start: start.minus({ minutes: 30 }), end: start, confidence: 0.9 });
  segments.push({ duty_type: 'posttrip', start: end, end: end.plus({ minutes: 15 }), confidence: 0.9 });
  return segments;
}


