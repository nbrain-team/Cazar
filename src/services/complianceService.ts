import type { ComplianceRule, DspDriverWeeklyMetric, DriverIdentifiers, SafetyEvent, Violation } from '../types';

// Simple in-memory mock data shaped like the DB tables
const stations = ['DYY5', 'VNY1'] as const;

const identifiers: DriverIdentifiers[] = [
  { transporter_id: 'A1UPD0VQ5XF9L', station_code: 'VNY1', delivery_associate_name: 'KAMAU OMARI ADAMS', adp_position_id: 'LSW001376' },
  { transporter_id: 'A392ICYQEKZ789', station_code: 'VNY1', delivery_associate_name: 'JEFFREY AHAY', adp_position_id: 'LSW001508' },
  { transporter_id: 'A1TYMBVD1U5VKQ', station_code: 'DYY5', delivery_associate_name: 'KEVIN LOPEZ EUSEBIO', adp_position_id: 'LSW001052' },
  { transporter_id: 'A1CO02I4VOCA74', station_code: 'DYY5', delivery_associate_name: 'MIGUEL ANGEL ALVAREZ', adp_position_id: 'LSW001409' },
  { transporter_id: 'A2MPQ47UJLPALK', station_code: 'DYY5', delivery_associate_name: 'WALTER LOCKHART', adp_position_id: 'LSW001348' },
];

const weeklyMetrics: DspDriverWeeklyMetric[] = [
  {
    week_code: '2025-29', station_code: 'VNY1', transporter_id: 'A1UPD0VQ5XF9L',
    delivered_packages: 433, overall_standing: 'Fantastic', key_focus_area: 'Photo-On-Delivery',
    on_road_safety_score: 'Coming Soon', overall_quality_score: 'Fantastic',
    seatbelt_off_rate: 0.003, speeding_event_rate: 0.008, distractions_rate: 0.004,
    sign_signal_violations_rate: 0, stop_sign_violations: 0, stop_light_violations: 0, illegal_u_turns: 0,
    cdf_dpmo: 320, dcr: 0.996, dsb: 0.002, swc_pod: 0.998, swc_cc: 0.003, swc_ad: 0.004,
    dnrs: 2, shipments_per_on_zone_hour: 28.559, pod_opps: 791, cc_opps: 0, customer_escalation_defect: 0,
    customer_delivery_feedback: 0,
  },
  {
    week_code: '2025-29', station_code: 'VNY1', transporter_id: 'A392ICYQEKZ789',
    delivered_packages: 52, overall_standing: 'Fantastic', key_focus_area: 'Photo-On-Delivery',
    on_road_safety_score: 'Coming Soon', overall_quality_score: 'Fantastic',
    seatbelt_off_rate: 0.001, speeding_event_rate: 0.002, distractions_rate: 0.000,
    sign_signal_violations_rate: 0, stop_sign_violations: 0, stop_light_violations: 0, illegal_u_turns: 0,
    cdf_dpmo: 180, dcr: 0.993, dsb: 0.001, swc_pod: 0.912, swc_cc: 0.001, swc_ad: 0.001,
    dnrs: 0, shipments_per_on_zone_hour: 22, pod_opps: 34, cc_opps: 0, customer_escalation_defect: 0,
    customer_delivery_feedback: 0,
  },
  {
    week_code: '2025-29', station_code: 'DYY5', transporter_id: 'A1TYMBVD1U5VKQ',
    delivered_packages: 2688, overall_standing: 'Fantastic', key_focus_area: 'Customer Delivery Feedback',
    on_road_safety_score: 'Fantastic', overall_quality_score: 'Fantastic',
    seatbelt_off_rate: 0.002, speeding_event_rate: 0.004, distractions_rate: 0.006,
    sign_signal_violations_rate: 0, stop_sign_violations: 0, stop_light_violations: 0, illegal_u_turns: 0,
    cdf_dpmo: 980, dcr: 0.999, dsb: 0.003, swc_pod: 0.997, swc_cc: 0.002, swc_ad: 0.003,
    dnrs: 1, shipments_per_on_zone_hour: 28.559, pod_opps: 791, cc_opps: 0, customer_escalation_defect: 0,
    customer_delivery_feedback: 1868.0,
  },
  {
    week_code: '2025-29', station_code: 'DYY5', transporter_id: 'A1CO02I4VOCA74',
    delivered_packages: 647, overall_standing: 'Fantastic', key_focus_area: 'Delivery Completion Rate',
    on_road_safety_score: 'Fantastic', overall_quality_score: 'Fantastic',
    seatbelt_off_rate: 0.000, speeding_event_rate: 0.003, distractions_rate: 0.002,
    sign_signal_violations_rate: 0, stop_sign_violations: 0, stop_light_violations: 0, illegal_u_turns: 0,
    cdf_dpmo: 220, dcr: 0.998, dsb: 0.002, swc_pod: 0.995, swc_cc: 0.001, swc_ad: 0.001,
    dnrs: 2, shipments_per_on_zone_hour: 34.007, pod_opps: 515, cc_opps: 0, customer_escalation_defect: 0,
    customer_delivery_feedback: 0,
  },
  {
    week_code: '2025-29', station_code: 'DYY5', transporter_id: 'A2MPQ47UJLPALK',
    delivered_packages: 659, overall_standing: 'Fantastic', key_focus_area: 'Delivery Completion Rate',
    on_road_safety_score: 'Coming Soon', overall_quality_score: 'Fantastic',
    seatbelt_off_rate: 0.001, speeding_event_rate: 0.001, distractions_rate: 0.001,
    sign_signal_violations_rate: 0, stop_sign_violations: 0, stop_light_violations: 0, illegal_u_turns: 0,
    cdf_dpmo: 150, dcr: 0.997, dsb: 0.001, swc_pod: 0.993, swc_cc: 0.001, swc_ad: 0.001,
    dnrs: 0, shipments_per_on_zone_hour: 19.972, pod_opps: 455, cc_opps: 0, customer_escalation_defect: 0,
    customer_delivery_feedback: 0,
  },
];

const safetyEvents: SafetyEvent[] = [
  { transporter_id: 'A1UPD0VQ5XF9L', station_code: 'VNY1', route_id: 'RT2025-07-19-001', type: 'seatbelt', severity: 3, occurred_at: new Date(Date.now()-3*86400000).toISOString(), source: 'camera', location: { lat: 40.74, lng: -73.98 } },
  { transporter_id: 'A1UPD0VQ5XF9L', station_code: 'VNY1', route_id: 'RT2025-07-19-001', type: 'speeding', severity: 2, occurred_at: new Date(Date.now()-2*86400000).toISOString(), source: 'camera', location: { lat: 40.73, lng: -73.99 } },
  { transporter_id: 'A1TYMBVD1U5VKQ', station_code: 'DYY5', route_id: 'RT2025-07-19-007', type: 'distraction', severity: 2, occurred_at: new Date(Date.now()-4*86400000).toISOString(), source: 'camera', location: { lat: 34.05, lng: -118.24 } },
];

const rules: ComplianceRule[] = [
  { metric_key: 'seatbelt_off_rate', operator: '>', threshold_value: 0, window: 'weekly', severity: 'high', active: true, description: 'Any seatbelt-off events trigger a violation' },
  { metric_key: 'speeding_event_rate', operator: '>', threshold_value: 0, window: 'weekly', severity: 'high', active: true, description: 'Any speeding events trigger a violation' },
  { metric_key: 'distractions_rate', operator: '>', threshold_value: 0, window: 'weekly', severity: 'high', active: true, description: 'Any distraction events trigger a violation' },
  { metric_key: 'cdf_dpmo', operator: '>', threshold_value: 0, window: 'weekly', severity: 'high', active: true, description: 'Any CDF defects create a violation' },
  { metric_key: 'customer_escalation_defect', operator: '>', threshold_value: 0, window: 'weekly', severity: 'high', active: true, description: 'Any escalations should be reviewed' },
  { metric_key: 'variance_hours', operator: '>', threshold_value: 1.0, window: 'daily', severity: 'medium', active: true, description: 'Daily hours variance exceeds 1 hour' },
];

const violations: Violation[] = [
  { transporter_id: 'A1UPD0VQ5XF9L', station_code: 'VNY1', metric_key: 'speeding_event_rate', observed_value: 0.008, threshold_value: 0, severity: 'high', occurred_week: '2025-29', status: 'open' },
  { transporter_id: 'A1TYMBVD1U5VKQ', station_code: 'DYY5', metric_key: 'customer_escalation_defect', observed_value: 2.0, threshold_value: 0, severity: 'high', occurred_week: '2025-29', status: 'open' },
];

export class ComplianceService {
  static async getStations(): Promise<string[]> {
    return stations as unknown as string[];
  }

  static async getDriverIdentifiers(): Promise<DriverIdentifiers[]> {
    return identifiers;
  }

  static async getWeeklyMetrics(filter?: { station_code?: string; week_code?: string }): Promise<DspDriverWeeklyMetric[]> {
    let data = weeklyMetrics;
    if (filter?.station_code) {
      data = data.filter(m => m.station_code === filter.station_code);
    }
    if (filter?.week_code) {
      data = data.filter(m => m.week_code === filter.week_code);
    }
    return data;
  }

  static async getSafetyEvents(filter?: { station_code?: string; transporter_id?: string }): Promise<SafetyEvent[]> {
    let data = safetyEvents;
    if (filter?.station_code) {
      data = data.filter(e => e.station_code === filter.station_code);
    }
    if (filter?.transporter_id) {
      data = data.filter(e => e.transporter_id === filter.transporter_id);
    }
    return data;
  }

  static async getRules(): Promise<ComplianceRule[]> {
    return rules;
  }

  static async getViolations(filter?: { station_code?: string; status?: Violation['status'] }): Promise<Violation[]> {
    let data = violations;
    if (filter?.station_code) data = data.filter(v => v.station_code === filter.station_code);
    if (filter?.status) data = data.filter(v => v.status === filter.status);
    return data;
  }

  static async updateRule(updated: ComplianceRule): Promise<void> {
    const idx = rules.findIndex(r => r.metric_key === updated.metric_key && r.window === updated.window);
    if (idx >= 0) rules[idx] = { ...rules[idx], ...updated };
  }

  static async acknowledgeViolation(idOrComposite: { transporter_id: string; metric_key: string }): Promise<void> {
    await fetch(`/api/violations/${idOrComposite.transporter_id}/ack`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(idOrComposite)
    }).catch(() => {});
  }

  static async resolveViolation(idOrComposite: { transporter_id: string; metric_key: string; reason_code?: string }): Promise<void> {
    await fetch(`/api/violations/${idOrComposite.transporter_id}/resolve`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(idOrComposite)
    }).catch(() => {});
  }

  static async escalateViolation(idOrComposite: { transporter_id: string; metric_key: string; level?: string }): Promise<void> {
    await fetch(`/api/violations/${idOrComposite.transporter_id}/escalate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(idOrComposite)
    }).catch(() => {});
  }
} 