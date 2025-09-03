import { ComplianceService } from './complianceService';

type MetricKey = 'cdf_dpmo' | 'dcr' | 'swc_pod' | 'swc_cc' | 'swc_ad' | 'dnrs' | 'delivered_packages' | 'seatbelt_off_rate' | 'speeding_event_rate' | 'distractions_rate';

export interface SmartChatOptions {
  station?: 'DYY5' | 'VNY1' | 'ALL';
  week?: string; // e.g., 2025-29
  explain?: boolean;
  topN?: number;
}

const METRIC_SYNONYMS: Record<MetricKey, string[]> = {
  cdf_dpmo: ['cdf', 'cdf dpmo', 'customer delivery feedback', 'defects per million', 'customer delivery feedback defects'],
  dcr: ['dcr', 'delivery completion rate', 'completion rate'],
  swc_pod: ['swc', 'swc-pod', 'pod compliance', 'photo on delivery'],
  swc_cc: ['swc-cc', 'call customer'],
  swc_ad: ['swc-ad', 'attempted delivery'],
  dnrs: ['dnrs', 'non rescues', 'rescues', 'rescues avoided'],
  delivered_packages: ['delivered', 'delivered packages', 'packages delivered'],
  seatbelt_off_rate: ['seatbelt', 'seatbelt-off', 'seat belt'],
  speeding_event_rate: ['speeding', 'speeding events'],
  distractions_rate: ['distraction', 'distractions'],
};

function findMetricKeys(q: string): MetricKey[] {
  const hit: MetricKey[] = [];
  Object.entries(METRIC_SYNONYMS).forEach(([k, arr]) => {
    if (arr.some(s => q.includes(s))) hit.push(k as MetricKey);
  });
  // defaults
  if (hit.length === 0 && (q.includes('band') || q.includes('scorecard'))) hit.push('dcr', 'swc_pod');
  return hit.length ? hit : ['dcr'];
}

function parseOps(q: string) {
  const ops = {
    compare: q.includes(' vs ') || q.includes(' versus '),
    avg: q.includes('avg') || q.includes('average') || q.includes('mean'),
    sum: q.includes('sum') || q.includes('total'),
    top: /top\s(\d{1,2})/.exec(q)?.[1],
    worst: /bottom\s(\d{1,2})|worst\s(\d{1,2})/.exec(q)?.[1],
    trend: q.includes('trend') || q.includes('over time')
  };
  return ops;
}

function parseStations(q: string, override?: SmartChatOptions['station']): ('DYY5'|'VNY1')[] {
  if (override && override !== 'ALL') return [override];
  const got: ('DYY5'|'VNY1')[] = [];
  if (q.includes('dyy5')) got.push('DYY5');
  if (q.includes('vny1')) got.push('VNY1');
  return got.length ? got : ['DYY5', 'VNY1'];
}

function topN<T>(arr: T[], n: number, by: (t: T) => number, asc = false): T[] {
  const s = [...arr].sort((a, b) => (asc ? 1 : -1) * (by(a) - by(b)));
  return s.slice(0, n);
}

function avg(arr: number[]): number { return arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0; }
function sum(arr: number[]): number { return arr.reduce((a,b)=>a+b,0); }

export class SmartChatService {
  static async ask(query: string, opts?: SmartChatOptions): Promise<string> {
    const q = query.toLowerCase();

    // Check if this is an HOS-related query
    const hosKeywords = [
      'hos', 'hours of service', 'consecutive', 'days in a row', 
      '60 hour', '70 hour', '60/7', '70/8', 'violation', 
      'meal break', 'lunch break', 'rest break', 'driver', 
      'at risk', 'compliance', 'dot', 'fmcsa'
    ];
    
    const isHosQuery = hosKeywords.some(keyword => q.includes(keyword));
    
    if (isHosQuery) {
      // Redirect to HOS chat API
      try {
        const resp = await fetch('/api/hos/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query })
        });
        const data = await resp.json();
        if (data?.answer) return data.answer;
      } catch (e) {
        console.error('HOS chat API error:', e);
      }
    }

    const isDataDirective = q.trim().startsWith('data:');

    // Prefer RAG for everything except explicit data: directive
    if (!isDataDirective) {
      try {
        const resp = await fetch('/rag/query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, topK: opts?.topN ?? 8, station: opts?.station ?? 'ALL', week: opts?.week ?? '2025-29' })
        });
        const data = await resp.json();
        if (data?.answer) return data.answer;
      } catch (e) {
        // Soft fallback after a short delay so it doesn't feel instantaneous
        await new Promise(r => setTimeout(r, 500));
      }
    }

    // Strip data: prefix for local analytics
    const cleaned = isDataDirective ? query.replace(/^data:\s*/i, '') : query;
    const week = opts?.week ?? '2025-29';
    const stations = parseStations(cleaned.toLowerCase(), opts?.station);
    const metrics = findMetricKeys(cleaned.toLowerCase());
    const ops = parseOps(cleaned.toLowerCase());

    // Load weekly metrics for requested stations
    const all = await Promise.all(stations.map(s => ComplianceService.getWeeklyMetrics({ station_code: s, week_code: week })));
    const byStation = new Map(stations.map((s, i) => [s, all[i]]));

    // Prepare response parts
    const lines: string[] = [];

    // Compare mode
    if (ops.compare && stations.length >= 2 && metrics.length >= 1) {
      const a = stations[0];
      const b = stations[1];
      metrics.forEach(m => {
        const va = avg((byStation.get(a) || []).map(x => (x as any)[m] || 0));
        const vb = avg((byStation.get(b) || []).map(x => (x as any)[m] || 0));
        lines.push(`- ${m} — ${a}: ${fmt(va, m)} vs ${b}: ${fmt(vb, m)} (${diffPct(va, vb)})`);
      });
      return `### Comparison\n${lines.join('\n')}`;
    }

    // Top / Bottom ranking
    const topNumber = Number(ops.top || ops.worst || opts?.topN || 0);
    if (topNumber > 0 && metrics.length >= 1) {
      const m = metrics[0];
      const rows = stations.flatMap(s => (byStation.get(s) || []).map(r => ({ ...r, station: s })));
      const ranked = topN(rows, topNumber, r => (r as any)[m] || 0, Boolean(ops.worst));
      ranked.forEach((r, i) => {
        lines.push(`${i+1}. ${r.station} ${r.transporter_id} — ${m}: ${fmt((r as any)[m]||0, m)} | DCR ${fmt(r.dcr||0,'dcr')} | SWC-POD ${fmt(r.swc_pod||0,'swc_pod')}`);
      });
      return `### ${ops.worst ? 'Bottom' : 'Top'} ${topNumber} by ${m}\n${lines.join('\n')}`;
    }

    // Aggregate (avg/sum)
    if (ops.avg || ops.sum || metrics.length) {
      metrics.forEach(m => {
        stations.forEach(s => {
          const rows = byStation.get(s) || [];
          const values = rows.map(x => (x as any)[m] || 0);
          const v = ops.sum ? sum(values) : avg(values);
          lines.push(`- ${s} ${ops.sum ? 'total' : 'avg'} ${m}: ${fmt(v, m)}`);
        });
      });
      return `### Aggregate\n${lines.join('\n')}`;
    }

    // Fallback summary
    stations.forEach(s => {
      const rows = byStation.get(s) || [];
      lines.push(`- ${s}: drivers ${rows.length}, avg DCR ${fmt(avg(rows.map(r=>r.dcr||0)),'dcr')}, avg SWC-POD ${fmt(avg(rows.map(r=>r.swc_pod||0)),'swc_pod')}, avg CDF DPMO ${fmt(avg(rows.map(r=>r.cdf_dpmo||0)),'cdf_dpmo')}`);
    });
    return `### Summary\n${lines.join('\n')}`;
  }
}

function fmt(v: number, key: string) {
  if (['dcr','swc_pod','swc_cc','swc_ad'].includes(key)) return (v).toFixed(3);
  if (['seatbelt_off_rate','speeding_event_rate','distractions_rate'].includes(key)) return (v).toFixed(3);
  if (['cdf_dpmo','delivered_packages','dnrs'].includes(key)) return Number(v.toFixed(3)).toString();
  return Number(v.toFixed(2)).toString();
}

function diffPct(a: number, b: number) {
  if (b === 0) return '+∞%';
  const d = ((a - b) / Math.abs(b)) * 100;
  const sign = d >= 0 ? '+' : '';
  return `${sign}${d.toFixed(1)}%`;
} 