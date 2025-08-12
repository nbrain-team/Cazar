// Amazon Logistics Types
export interface Driver {
  driver_id: string;
  driver_name: string;
  driver_status: 'active' | 'inactive';
  employment_status: 'active' | 'terminated';
  job_title: string;
  pay_type: 'hourly' | 'salary';
  pay_rate: number;
  department: string;
  location: string;
}

export interface Route {
  route_id: string;
  route_date: string;
  driver_id: string;
  route_start_time: string;
  route_end_time: string;
  route_completion_status: 'completed' | 'partial' | 'failed';
  route_location_id: string;
  vehicle_type: 'van' | 'e-bike' | 'car';
  total_stops: number;
  total_packages: number;
  packages_delivered: number;
  packages_undelivered: number;
  flex_app_check_in_time: string;
  flex_app_check_out_time: string;
}

export interface Scorecard {
  scorecard_week: string;
  driver_id: string;
  on_time_delivery_rate: number;
  delivery_attempt_rate: number;
  safe_driving_score: number;
  customer_feedback_score: number;
  route_completion_rate: number;
  bonus_eligibility: boolean;
  bonus_amount_potential: number;
}

// ADP Types
export interface Timecard {
  timecard_id: string;
  employee_id: string;
  clock_in_time: string;
  clock_out_time: string;
  break_start_time: string;
  break_end_time: string;
  total_hours_worked: number;
  overtime_hours: number;
  shift_id: string;
  scheduled_shift_start: string;
  scheduled_shift_end: string;
  date: string;
}

export interface Payroll {
  employee_id: string;
  gross_pay: number;
  overtime_pay: number;
  deductions: number;
  net_pay: number;
  pay_period_start: string;
  pay_period_end: string;
}

// DSP Workplace Types
export interface Schedule {
  schedule_id: string;
  driver_id: string;
  shift_date: string;
  shift_start: string;
  shift_end: string;
  assigned_vehicle: string;
  assigned_route: string;
  scheduled_breaks: string[];
}

export interface AttendanceEvent {
  driver_id: string;
  shift_date: string;
  actual_clock_in: string;
  actual_clock_out: string;
  shift_variance: number; // in minutes
  missed_shift_flag: boolean;
  no_show_flag: boolean;
  late_start_flag: boolean;
}

// Reconciliation Types
export interface TimecardDiscrepancy {
  id: string;
  driver_id: string;
  driver_name: string;
  date: string;
  type: 'missing_punch' | 'time_mismatch' | 'overtime_alert' | 'break_violation';
  severity: 'low' | 'medium' | 'high';
  description: string;
  adp_hours: number;
  amazon_hours: number;
  variance: number;
  status: 'pending' | 'resolved' | 'escalated';
}

export interface ScheduleOptimization {
  date: string;
  recommended_changes: {
    driver_id: string;
    current_shift: string;
    recommended_shift: string;
    reason: string;
  }[];
  coverage_gaps: {
    time_slot: string;
    drivers_needed: number;
    priority: 'low' | 'medium' | 'high';
  }[];
  overtime_risks: {
    driver_id: string;
    projected_hours: number;
    recommendation: string;
  }[];
} 

// COMPLIANCE TYPES
export interface DriverIdentifiers {
  id?: string;
  driver_id?: string; // optional until backfilled
  transporter_id: string;
  station_code: string;
  delivery_associate_name?: string;
  adp_position_id?: string;
}

export interface DspDriverWeeklyMetric {
  id?: string;
  week_code: string; // e.g., 2025-29
  station_code: string;
  transporter_id: string;
  delivered_packages?: number;
  overall_standing?: string;
  key_focus_area?: string;
  on_road_safety_score?: string;
  overall_quality_score?: string;
  fico?: string;
  acceleration?: string;
  braking?: string;
  cornering?: string;
  distraction?: string;
  seatbelt_off_rate?: number;
  speeding?: string;
  speeding_event_rate?: number;
  distractions_rate?: number;
  looking_at_phone?: string;
  talking_on_phone?: string;
  looking_down?: string;
  following_distance_rate?: number;
  sign_signal_violations_rate?: number;
  stop_sign_violations?: number;
  stop_light_violations?: number;
  illegal_u_turns?: number;
  cdf_dpmo?: number;
  dcr?: number;
  dsb?: number;
  swc_pod?: number;
  swc_cc?: number;
  swc_ad?: number;
  dnrs?: number;
  shipments_per_on_zone_hour?: number;
  pod_opps?: number;
  cc_opps?: number;
  customer_escalation_defect?: number;
  customer_delivery_feedback?: number;
}

export interface SafetyEvent {
  event_id?: string;
  transporter_id: string;
  station_code: string;
  route_id?: string;
  type: 'seatbelt' | 'speeding' | 'distraction' | 'hard_brake' | 'collision';
  severity: 1 | 2 | 3 | 4 | 5;
  occurred_at: string;
  source?: string;
  location?: { lat?: number; lng?: number } | Record<string, unknown>;
  video_url?: string | null;
}

export interface ComplianceRule {
  rule_id?: string;
  metric_key: string;
  operator: '>' | '>=' | '=' | '<' | '<=';
  threshold_value: number;
  window: 'daily' | 'weekly';
  severity: 'low' | 'medium' | 'high';
  active: boolean;
  description?: string;
}

export interface Violation {
  id?: string;
  transporter_id: string;
  station_code: string;
  metric_key: string;
  observed_value: number;
  threshold_value: number;
  severity: 'low' | 'medium' | 'high';
  occurred_week?: string;
  occurred_at?: string;
  status: 'open' | 'acknowledged' | 'resolved' | 'escalated';
  rule_id?: string;
} 