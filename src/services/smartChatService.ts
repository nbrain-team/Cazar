import { ComplianceService } from './complianceService';

export class SmartChatService {
  static async ask(query: string): Promise<string> {
    const q = query.toLowerCase();

    // Simple intent routing for demo
    if (q.includes('weekly ot') || q.includes('overtime')) {
      const dyy5 = await ComplianceService.getWeeklyMetrics({ station_code: 'DYY5', week_code: '2025-29' });
      const vny1 = await ComplianceService.getWeeklyMetrics({ station_code: 'VNY1', week_code: '2025-29' });
      const dyy5Drivers = dyy5.length;
      const vny1Drivers = vny1.length;
      return `Weekly OT risk proxy: DYY5 has ${dyy5Drivers} active drivers with avg SWC-POD ${(avg(dyy5.map(m=>m.swc_pod||0))).toFixed(3)} and CDF DPMO ${(avg(dyy5.map(m=>m.cdf_dpmo||0))).toFixed(1)}. VNY1 has ${vny1Drivers} drivers with avg SWC-POD ${(avg(vny1.map(m=>m.swc_pod||0))).toFixed(3)} and CDF DPMO ${(avg(vny1.map(m=>m.cdf_dpmo||0))).toFixed(1)}. Use Schedule Builder to minimize OT by pairing lower SPH cohorts earlier.`;
    }

    if (q.includes('5th') || q.includes('6th')) {
      const dyy5 = await ComplianceService.getWeeklyMetrics({ station_code: 'DYY5', week_code: '2025-29' });
      const dnrs = sum(dyy5.map(m => m.dnrs || 0));
      return `5th/6th-day exposure indicator (DNRS as proxy) at DYY5 is ${dnrs}. Recommend enforcing rest windows and using Live Rescue to avoid overextension on weekends.`;
    }

    if (q.includes('cdf') || q.includes('dcr') || q.includes('swc')) {
      const station = q.includes('vny1') ? 'VNY1' : 'DYY5';
      const metrics = await ComplianceService.getWeeklyMetrics({ station_code: station, week_code: '2025-29' });
      const avgCdf = avg(metrics.map(m => m.cdf_dpmo || 0));
      const avgDcr = avg(metrics.map(m => m.dcr || 0));
      const avgSwc = avg(metrics.map(m => m.swc_pod || 0));
      return `${station} averages — CDF DPMO: ${avgCdf.toFixed(1)}, DCR: ${avgDcr.toFixed(3)}, SWC-POD: ${avgSwc.toFixed(3)}. Focus on buildings with repeat defects and enforce POD prompts.`;
    }

    if (q.includes('seatbelt') || q.includes('speed') || q.includes('distraction')) {
      const station = q.includes('vny1') ? 'VNY1' : 'DYY5';
      const metrics = await ComplianceService.getWeeklyMetrics({ station_code: station, week_code: '2025-29' });
      const sb = avg(metrics.map(m => m.seatbelt_off_rate || 0));
      const sp = avg(metrics.map(m => m.speeding_event_rate || 0));
      const di = avg(metrics.map(m => m.distractions_rate || 0));
      return `${station} safety signals — Seatbelt-off rate: ${(sb).toFixed(3)}, Speeding event rate: ${(sp).toFixed(3)}, Distractions rate: ${(di).toFixed(3)}. Recommend targeted coaching for the small cohort above zero.`;
    }

    // Fallback: combined summary
    const [dyy5, vny1] = await Promise.all([
      ComplianceService.getWeeklyMetrics({ station_code: 'DYY5', week_code: '2025-29' }),
      ComplianceService.getWeeklyMetrics({ station_code: 'VNY1', week_code: '2025-29' }),
    ]);
    return `Summary — DYY5: drivers ${dyy5.length}, avg SWC-POD ${(avg(dyy5.map(m=>m.swc_pod||0))).toFixed(3)}, CDF DPMO ${(avg(dyy5.map(m=>m.cdf_dpmo||0))).toFixed(1)}. VNY1: drivers ${vny1.length}, avg SWC-POD ${(avg(vny1.map(m=>m.swc_pod||0))).toFixed(3)}, CDF DPMO ${(avg(vny1.map(m=>m.cdf_dpmo||0))).toFixed(1)}. Ask me about weekly OT, 5th/6th-day exposure, CDF/DCR/SWC, or safety events.`;
  }
}

function avg(arr: number[]): number {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function sum(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0);
} 