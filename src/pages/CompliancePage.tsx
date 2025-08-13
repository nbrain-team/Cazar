import { useEffect, useMemo, useState } from 'react';
import { Tabs } from '@radix-ui/themes';
import { ComplianceService } from '../services/complianceService';
import { WhcService } from '../services/whcService';
import type { ComplianceRule, DspDriverWeeklyMetric, Violation } from '../types';
import type { WorkHoursAuditDaily } from '../types';
import { XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';

function KPI({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card" style={{ padding: '1rem' }}>
      <div style={{ fontSize: '0.8rem', color: '#666' }}>{label}</div>
      <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  const headers = Array.from(rows.reduce((set, row) => { Object.keys(row).forEach(k => set.add(k)); return set; }, new Set<string>())) as string[];
  const csv = [headers.join(',')].concat(
    rows.map(r => headers.map(h => {
      const v = (r as any)[h];
      if (v === null || v === undefined) return '';
      const s = String(v).replaceAll('"', '""');
      return s.includes(',') || s.includes('"') ? `"${s}"` : s;
    }).join(','))
  ).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function CompliancePage() {
  const [station, setStation] = useState<string>('DYY5');
  const [week, setWeek] = useState<string>('2025-29');
  const [metrics, setMetrics] = useState<DspDriverWeeklyMetric[]>([]);
  const [violations, setViolations] = useState<Violation[]>([]);
  const [rules, setRules] = useState<ComplianceRule[]>([]);
  const [auditDate, setAuditDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [whcAudit, setWhcAudit] = useState<WorkHoursAuditDaily[]>([]);
  const [editingRuleKey, setEditingRuleKey] = useState<string | null>(null);
  const [thresholdDraft, setThresholdDraft] = useState<string>('');
  const [whcNotes, setWhcNotes] = useState<Record<string, string>>({});

  useEffect(() => {
    ComplianceService.getWeeklyMetrics({ station_code: station, week_code: week }).then(setMetrics);
    ComplianceService.getViolations({ station_code: station }).then(setViolations);
    ComplianceService.getRules().then(setRules);
    WhcService.computeDailyAudit(station, auditDate).then(rows => {
      setWhcAudit(rows);
      // initialize notes map keys
      const m: Record<string, string> = {};
      rows.forEach(r => { m[`${r.driver_name}-${r.work_date}`] = whcNotes[`${r.driver_name}-${r.work_date}`] || ''; });
      setWhcNotes(m);
    });
  }, [station, week, auditDate]);

  const kpis = useMemo(() => {
    const openViolations = violations.filter(v => v.status === 'open').length;
    const avgSeatbeltOff =
      metrics.length ? (metrics.reduce((s, m) => s + (m.seatbelt_off_rate || 0), 0) / metrics.length) : 0;
    const avgSpeedingRate =
      metrics.length ? (metrics.reduce((s, m) => s + (m.speeding_event_rate || 0), 0) / metrics.length) : 0;
    const avgCdfDpmo = metrics.length ? (metrics.reduce((s, m) => s + (m.cdf_dpmo || 0), 0) / metrics.length) : 0;
    const atRisk = metrics.filter(m => (m.speeding_event_rate || 0) > 0 || (m.distractions_rate || 0) > 0 || (m.seatbelt_off_rate || 0) > 0).length;
    return { openViolations, avgSeatbeltOff, avgSpeedingRate, avgCdfDpmo, atRisk };
  }, [metrics, violations]);

  const trendData = useMemo(() => {
    return metrics.map(m => ({
      transporter: m.transporter_id,
      dcr: m.dcr ?? 0,
      cdf: m.cdf_dpmo ?? 0,
      swcpod: m.swc_pod ?? 0
    }));
  }, [metrics]);

  const acknowledge = async (v: Violation) => {
    await ComplianceService.acknowledgeViolation({ transporter_id: v.transporter_id, metric_key: v.metric_key });
    const updated = await ComplianceService.getViolations({ station_code: station });
    setViolations(updated.map(x => x.transporter_id === v.transporter_id && x.metric_key === v.metric_key ? { ...x, status: 'acknowledged' } : x));
  };

  const resolve = async (v: Violation) => {
    await ComplianceService.resolveViolation({ transporter_id: v.transporter_id, metric_key: v.metric_key, reason_code: 'demo' });
    const updated = await ComplianceService.getViolations({ station_code: station });
    setViolations(updated.map(x => x.transporter_id === v.transporter_id && x.metric_key === v.metric_key ? { ...x, status: 'resolved' } : x));
  };

  const startEditRule = (r: ComplianceRule) => {
    setEditingRuleKey(`${r.metric_key}-${r.window}`);
    setThresholdDraft(String(r.threshold_value));
  };

  const saveRule = async (r: ComplianceRule) => {
    const t = Number(thresholdDraft);
    const updated: ComplianceRule = { ...r, threshold_value: isNaN(t) ? r.threshold_value : t };
    await ComplianceService.updateRule(updated);
    const refreshed = await ComplianceService.getRules();
    setRules(refreshed);
    setEditingRuleKey(null);
  };

  const exportWhcWithNotes = () => {
    const rows = whcAudit.map(r => ({ ...r, notes: whcNotes[`${r.driver_name}-${r.work_date}`] || '' }));
    downloadCsv(`${station}-${auditDate}-payroll-guard.csv`, rows as unknown as Record<string, unknown>[]);
  };

  return (
    <div style={{ padding: '2rem' }}>
      <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '1rem' }}>COMPLIANCE</h1>
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <select value={station} onChange={e => setStation(e.target.value)}>
          <option value="DYY5">DYY5</option>
          <option value="VNY1">VNY1</option>
        </select>
        <select value={week} onChange={e => setWeek(e.target.value)}>
          <option value="2025-29">2025-29</option>
        </select>
      </div>

      <Tabs.Root defaultValue="overview">
        <Tabs.List style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', marginBottom: '0.5rem' }}>
          <Tabs.Trigger value="overview" style={{ padding: '0.5rem 0.75rem', borderRadius: 8 }}>OVERVIEW</Tabs.Trigger>
          <Tabs.Trigger value="drivers" style={{ padding: '0.5rem 0.75rem', borderRadius: 8 }}>DRIVERS</Tabs.Trigger>
          <Tabs.Trigger value="violations" style={{ padding: '0.5rem 0.75rem', borderRadius: 8 }}>VIOLATIONS</Tabs.Trigger>
          <Tabs.Trigger value="rules" style={{ padding: '0.5rem 0.75rem', borderRadius: 8 }}>RULES</Tabs.Trigger>
          <Tabs.Trigger value="scorecards" style={{ padding: '0.5rem 0.75rem', borderRadius: 8 }}>SCORECARDS</Tabs.Trigger>
          <Tabs.Trigger value="whc" style={{ padding: '0.5rem 0.75rem', borderRadius: 8 }}>WORK HOURS</Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="overview">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '1rem', marginTop: '1rem' }}>
            <KPI label="AT-RISK DRIVERS" value={kpis.atRisk} />
            <KPI label="OPEN VIOLATIONS" value={kpis.openViolations} />
            <KPI label="AVG SEATBELT-OFF RATE" value={kpis.avgSeatbeltOff.toFixed(3)} />
            <KPI label="AVG SPEEDING EVENT RATE" value={kpis.avgSpeedingRate.toFixed(3)} />
            <KPI label="AVG CDF DPMO" value={kpis.avgCdfDpmo.toFixed(1)} />
          </div>
          <div className="card" style={{ marginTop: '1rem', padding: '1rem' }}>
            <h3 style={{ marginBottom: '0.5rem' }}>Weekly Trends</h3>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="transporter" hide />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="dcr" stroke="#3b82f6" name="DCR" />
                <Line type="monotone" dataKey="swcpod" stroke="#10b981" name="SWC-POD" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Tabs.Content>

        <Tabs.Content value="drivers">
          <div className="card" style={{ marginTop: '1rem', padding: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', gap: '1rem', flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0 }}>Drivers</h3>
              <button className="btn btn-secondary" onClick={() => downloadCsv(`${station}-${week}-drivers.csv`, metrics as unknown as Record<string, unknown>[])}>Export CSV</button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>TRANSPORTER ID</th>
                    <th>DELIVERED</th>
                    <th>CDF DPMO</th>
                    <th>SEATBELT-OFF RATE</th>
                    <th>SPEEDING EVENT RATE</th>
                    <th>DISTRACTIONS RATE</th>
                    <th>DCR</th>
                    <th>DSB</th>
                    <th>SWC-POD</th>
                    <th>DNRS</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.map(m => (
                    <tr key={`${m.transporter_id}-${m.week_code}`}>
                      <td>{m.transporter_id}</td>
                      <td>{m.delivered_packages}</td>
                      <td>{m.cdf_dpmo ?? 0}</td>
                      <td>{(m.seatbelt_off_rate ?? 0).toFixed(3)}</td>
                      <td>{(m.speeding_event_rate ?? 0).toFixed(3)}</td>
                      <td>{(m.distractions_rate ?? 0).toFixed(3)}</td>
                      <td>{m.dcr ?? 0}</td>
                      <td>{m.dsb ?? 0}</td>
                      <td>{m.swc_pod ?? 0}</td>
                      <td>{m.dnrs ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Tabs.Content>

        <Tabs.Content value="violations">
          <div className="card" style={{ marginTop: '1rem', padding: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', gap: '1rem', flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0 }}>Violations</h3>
              <button className="btn btn-secondary" onClick={() => downloadCsv(`${station}-${week}-violations.csv`, violations as unknown as Record<string, unknown>[])}>Export CSV</button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>TRANSPORTER ID</th>
                    <th>METRIC</th>
                    <th>OBSERVED</th>
                    <th>THRESHOLD</th>
                    <th>SEVERITY</th>
                    <th>STATUS</th>
                    <th>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {violations.map(v => (
                    <tr key={`${v.transporter_id}-${v.metric_key}`}>
                      <td>{v.transporter_id}</td>
                      <td>{v.metric_key}</td>
                      <td>{v.observed_value}</td>
                      <td>{v.threshold_value}</td>
                      <td>{v.severity}</td>
                      <td>{v.status}</td>
                      <td style={{ display: 'flex', gap: '0.5rem' }}>
                        <button className="btn btn-secondary" onClick={() => acknowledge(v)}>Ack</button>
                        <button className="btn btn-primary" onClick={() => resolve(v)}>Resolve</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Tabs.Content>

        <Tabs.Content value="rules">
          <div className="card" style={{ marginTop: '1rem', padding: '1rem' }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>METRIC</th>
                    <th>OPERATOR</th>
                    <th>THRESHOLD</th>
                    <th>WINDOW</th>
                    <th>SEVERITY</th>
                    <th>ACTIVE</th>
                    <th>ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map(r => {
                    const key = `${r.metric_key}-${r.window}`;
                    const isEditing = editingRuleKey === key;
                    return (
                      <tr key={key}>
                        <td>{r.metric_key}</td>
                        <td>{r.operator}</td>
                        <td>
                          {isEditing ? (
                            <input className="input" value={thresholdDraft} onChange={e => setThresholdDraft(e.target.value)} style={{ maxWidth: 120 }} />
                          ) : (
                            r.threshold_value
                          )}
                        </td>
                        <td>{r.window}</td>
                        <td>{r.severity}</td>
                        <td>{r.active ? 'Yes' : 'No'}</td>
                        <td style={{ display: 'flex', gap: '0.5rem' }}>
                          {isEditing ? (
                            <button className="btn btn-primary" onClick={() => saveRule(r)}>Save</button>
                          ) : (
                            <button className="btn btn-secondary" onClick={() => startEditRule(r)}>Edit</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </Tabs.Content>

        <Tabs.Content value="scorecards">
          <div className="card" style={{ marginTop: '1rem', padding: '1rem' }}>
            <h3>Scorecards</h3>
            <p>Weekly scorecard metrics by driver for {station}, week {week}.</p>
            <ul>
              {metrics.map(m => (
                <li key={`${m.transporter_id}-score`}>{m.transporter_id}: DCR {m.dcr ?? 0}, SWC-POD {m.swc_pod ?? 0}, CDF DPMO {m.cdf_dpmo ?? 0}</li>
              ))}
            </ul>
          </div>
        </Tabs.Content>

        <Tabs.Content value="whc">
          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <label>Date: <input className="input" type="date" value={auditDate} onChange={e => setAuditDate(e.target.value)} /></label>
            <button className="btn btn-secondary" onClick={exportWhcWithNotes}>Export Payroll Guard CSV</button>
          </div>
          <div className="card" style={{ marginTop: '1rem', padding: '1rem' }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>DRIVER</th>
                    <th>SHIFT START</th>
                    <th>SHIFT END</th>
                    <th>ON-DUTY HOURS</th>
                    <th>MEAL (MIN)</th>
                    <th>MEAL IN WINDOW</th>
                    <th>DAILY MAX?</th>
                    <th>5TH/6TH DAY?</th>
                    <th>WEEKLY HOURS</th>
                    <th>WEEKLY OT?</th>
                    <th>VERDICT</th>
                    <th>NOTES</th>
                  </tr>
                </thead>
                <tbody>
                  {whcAudit.map(a => {
                    const key = `${a.driver_name}-${a.work_date}`;
                    return (
                      <tr key={key}>
                        <td>{a.driver_name}</td>
                        <td>{a.shift_start ? new Date(a.shift_start).toLocaleTimeString() : ''}</td>
                        <td>{a.shift_end ? new Date(a.shift_end).toLocaleTimeString() : ''}</td>
                        <td>{a.on_duty_hours?.toFixed(2)}</td>
                        <td>{a.meal_minutes}</td>
                        <td>{a.meal_within_window ? 'Yes' : 'No'}</td>
                        <td>{a.daily_max_exceeded ? 'Yes' : 'No'}</td>
                        <td>{a.fifth_sixth_day_flag ? 'Yes' : 'No'}</td>
                        <td>{a.weekly_hours?.toFixed(2)}</td>
                        <td>{a.weekly_ot_flag ? 'Yes' : 'No'}</td>
                        <td>{a.verdict}</td>
                        <td>
                          <input
                            className="input"
                            style={{ maxWidth: 240 }}
                            placeholder="Add note for payroll/CAP"
                            value={whcNotes[key] || ''}
                            onChange={(e) => setWhcNotes(prev => ({ ...prev, [key]: e.target.value }))}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
} 