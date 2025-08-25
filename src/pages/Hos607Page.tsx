import { useEffect, useMemo, useState } from 'react';

type GridDriver = {
  driver_id: string;
  driver_name: string;
  day_hours: number[]; // length 7
  total_7d: number;
  hours_used: number;
  hours_available: number;
  lunch_total_minutes?: number; // aggregated lunch minutes across the window
  status?: 'OK' | 'AT_RISK' | 'VIOLATION';
  detail?: string;
  reasons?: { type: string; severity: string; message: string; values?: Record<string, unknown> }[];
};

export default function Hos607Page() {
  const [grid, setGrid] = useState<{ window: { start: string; end: string }, drivers: GridDriver[] } | null>(null);
  const [endDate, setEndDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [uploading, setUploading] = useState(false);
  const [openRow, setOpenRow] = useState<string | null>(null);

  const load = async () => {
    const r = await fetch(`/api/hos/grid?end=${endDate}`);
    const j = await r.json();
    setGrid(j);
  };

  useEffect(() => { load(); }, [endDate]);

  const sorted = useMemo(() => {
    if (!grid) return [] as GridDriver[];
    const rank = (s?: GridDriver['status']) => s === 'VIOLATION' ? 0 : s === 'AT_RISK' ? 1 : 2;
    return [...grid.drivers].sort((a, b) => {
      const ra = rank(a.status);
      const rb = rank(b.status);
      if (ra !== rb) return ra - rb;
      const ha = Number(a.hours_available || 0);
      const hb = Number(b.hours_available || 0);
      return ha - hb;
    });
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
                <th key={i}>{i === 0 ? 'D-6' : i === 6 ? 'D' : `D-${6-i}`}</th>
              ))}
              <th>Lunch</th>
              <th>Status</th>
              <th>7d Total</th>
              <th>Used</th>
              <th>Available</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(d => (
              <>
              <tr key={d.driver_id} onClick={() => setOpenRow(prev => prev === d.driver_id ? null : d.driver_id)} style={{ cursor: 'pointer' }}>
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
                      </div>
                    ) : (
                      <span style={{ color: '#999' }}>–</span>
                    )}
                  </td>
                ))}
                <td>{d.lunch_total_minutes ? `${Math.round(d.lunch_total_minutes)}m` : '–'}</td>
                <td>
                  {d.status ? (
                    <span className={`badge ${d.status === 'VIOLATION' ? 'badge-danger' : d.status === 'AT_RISK' ? 'badge-warning' : 'badge-success'}`} title={d.detail || ''}>
                      {d.status.replace('_', ' ')}
                    </span>
                  ) : 'OK'}
                </td>
                <td>{Number(d.total_7d || 0).toFixed(2)}h</td>
                <td>{Number(d.hours_used || 0).toFixed(2)}h</td>
                <td style={{ color: Number(d.hours_available || 0) < 0 ? 'var(--danger)' : Number(d.hours_available || 0) < 3 ? 'var(--warning)' : 'var(--success)' }}>
                  {Number(d.hours_available || 0).toFixed(2)}h
                </td>
              </tr>
              {openRow === d.driver_id && (
                <tr>
                  <td colSpan={11}>
                    <div className="card" style={{ marginTop: '0.5rem', padding: '0.75rem' }}>
                      <strong>Reasons</strong>
                      <ul style={{ marginTop: '0.5rem' }}>
                        {(d.reasons && d.reasons.length) ? d.reasons.map((r, i) => (
                          <li key={i} style={{ color: r.severity === 'VIOLATION' ? 'var(--danger)' : r.severity === 'AT_RISK' ? 'var(--warning)' : 'inherit' }}>
                            {r.message}
                          </li>
                        )) : <li>No current risks</li>}
                      </ul>
                    </div>
                  </td>
                </tr>
              )}
              </>
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


