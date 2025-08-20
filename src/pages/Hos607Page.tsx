import { useEffect, useMemo, useState } from 'react';

type GridDriver = {
  driver_id: string;
  driver_name: string;
  day_hours: number[]; // length 7
  total_7d: number;
  hours_used: number;
  hours_available: number;
  lunch_minutes?: number[]; // optional per-day lunch minutes
};

export default function Hos607Page() {
  const [grid, setGrid] = useState<{ window: { start: string; end: string }, drivers: GridDriver[] } | null>(null);
  const [endDate, setEndDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [uploading, setUploading] = useState(false);

  const load = async () => {
    const r = await fetch(`/api/hos/grid?end=${endDate}`);
    const j = await r.json();
    setGrid(j);
  };

  useEffect(() => { load(); }, [endDate]);

  const sorted = useMemo(() => {
    if (!grid) return [] as GridDriver[];
    return [...grid.drivers].sort((a,b)=> a.hours_available - b.hours_available);
  }, [grid]);

  const uploadTimecard = async (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    setUploading(true);
    try {
      await fetch('/api/hos/import-timecards', { method: 'POST', body: fd });
      await load();
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ padding: '2rem' }}>
      <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '1rem' }}>Compliance & HOS 60/7</h1>
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <label>Window end: <input className="input" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} /></label>
        <label>
          Upload Timecard Report.csv
          <input type="file" accept=".csv" onChange={e => { const f = e.target.files?.[0]; if (f) uploadTimecard(f); }} />
        </label>
        {uploading && <span>Uploading…</span>}
      </div>

      <div className="card" style={{ overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ position: 'sticky', left: 0, backgroundColor: 'var(--gray-light)', zIndex: 1 }}>Driver (Position ID)</th>
              {grid && Array.from({ length: 7 }).map((_, i) => (
                <th key={i}>{i === 0 ? 'D-6' : i === 6 ? 'D' : `D-${6-i}`}<div style={{ fontSize: '0.7rem', color: '#777' }}>Lunch</div></th>
              ))}
              <th>7d Total</th>
              <th>Used</th>
              <th>Available</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(d => (
              <tr key={d.driver_id}>
                <td style={{ position: 'sticky', left: 0, backgroundColor: 'var(--card-bg)', zIndex: 1 }}>{d.driver_name} ({d.driver_id})</td>
                {d.day_hours.map((h, idx) => (
                  <td key={idx}>
                    {Number(h || 0) > 0 ? (
                      <div style={{
                        padding: '0.25rem 0.5rem',
                        backgroundColor: Number(h || 0) >= 10 ? 'var(--danger-light)' : Number(h || 0) >= 8 ? 'var(--warning-light)' : 'var(--primary-light)',
                        borderRadius: 4,
                        textAlign: 'center',
                        fontWeight: 600
                      }}>
                        {Number(h || 0).toFixed(2)}h
                        <div style={{ fontSize: '0.7rem', color: '#555' }}>{d.lunch_minutes?.[idx] ? `${Math.round(d.lunch_minutes[idx])}m` : ''}</div>
                      </div>
                    ) : (
                      <span style={{ color: '#999' }}>–</span>
                    )}
                  </td>
                ))}
                <td>{Number(d.total_7d || 0).toFixed(2)}h</td>
                <td>{Number(d.hours_used || 0).toFixed(2)}h</td>
                <td style={{ color: Number(d.hours_available || 0) < 0 ? 'var(--danger)' : Number(d.hours_available || 0) < 3 ? 'var(--warning)' : 'var(--success)' }}>
                  {Number(d.hours_available || 0).toFixed(2)}h
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={11} style={{ textAlign: 'center', color: '#777', padding: '1rem' }}>No data for this window yet. Upload Timecard Report.csv to populate.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}


