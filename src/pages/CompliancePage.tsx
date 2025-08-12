import { useEffect, useMemo, useState } from 'react';
import { Tabs } from '@radix-ui/themes';
import { ComplianceService } from '../services/complianceService';
import type { ComplianceRule, DspDriverWeeklyMetric, Violation } from '../types';

function KPI({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card" style={{ padding: '1rem' }}>
      <div style={{ fontSize: '0.8rem', color: '#666' }}>{label}</div>
      <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{value}</div>
    </div>
  );
}

export default function CompliancePage() {
  const [station, setStation] = useState<string>('DYY5');
  const [week, setWeek] = useState<string>('2025-29');
  const [metrics, setMetrics] = useState<DspDriverWeeklyMetric[]>([]);
  const [violations, setViolations] = useState<Violation[]>([]);
  const [rules, setRules] = useState<ComplianceRule[]>([]);

  useEffect(() => {
    ComplianceService.getWeeklyMetrics({ station_code: station, week_code: week }).then(setMetrics);
    ComplianceService.getViolations({ station_code: station }).then(setViolations);
    ComplianceService.getRules().then(setRules);
  }, [station, week]);

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

  return (
    <div style={{ padding: '2rem' }}>
      <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '1rem' }}>COMPLIANCE</h1>
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
        <select value={station} onChange={e => setStation(e.target.value)}>
          <option value="DYY5">DYY5</option>
          <option value="VNY1">VNY1</option>
        </select>
        <select value={week} onChange={e => setWeek(e.target.value)}>
          <option value="2025-29">2025-29</option>
        </select>
      </div>

      <Tabs.Root defaultValue="overview">
        <Tabs.List>
          <Tabs.Trigger value="overview">OVERVIEW</Tabs.Trigger>
          <Tabs.Trigger value="drivers">DRIVERS</Tabs.Trigger>
          <Tabs.Trigger value="violations">VIOLATIONS</Tabs.Trigger>
          <Tabs.Trigger value="rules">RULES</Tabs.Trigger>
          <Tabs.Trigger value="scorecards">SCORECARDS</Tabs.Trigger>
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
            <h3>Weekly Trends</h3>
            <p>Charts will show DCR, SWC-POD, CDF DPMO trends (mock placeholder).</p>
          </div>
        </Tabs.Content>

        <Tabs.Content value="drivers">
          <div className="card" style={{ marginTop: '1rem', padding: '1rem' }}>
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
        </Tabs.Content>

        <Tabs.Content value="violations">
          <div className="card" style={{ marginTop: '1rem', padding: '1rem' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>TRANSPORTER ID</th>
                  <th>METRIC</th>
                  <th>OBSERVED</th>
                  <th>THRESHOLD</th>
                  <th>SEVERITY</th>
                  <th>STATUS</th>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Tabs.Content>

        <Tabs.Content value="rules">
          <div className="card" style={{ marginTop: '1rem', padding: '1rem' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>METRIC</th>
                  <th>OPERATOR</th>
                  <th>THRESHOLD</th>
                  <th>WINDOW</th>
                  <th>SEVERITY</th>
                  <th>ACTIVE</th>
                </tr>
              </thead>
              <tbody>
                {rules.map(r => (
                  <tr key={`${r.metric_key}-${r.window}`}>
                    <td>{r.metric_key}</td>
                    <td>{r.operator}</td>
                    <td>{r.threshold_value}</td>
                    <td>{r.window}</td>
                    <td>{r.severity}</td>
                    <td>{r.active ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
      </Tabs.Root>
    </div>
  );
} 