// Amazon Logistics Types
export interface Driver {
  driver_id: string;
  driver_name: string;
  driver_status: string;
  employment_status: string;
  job_title?: string;
  pay_type?: string;
  pay_rate?: number;
  department?: string;
  location?: string;
  email?: string;
  phone?: string;
  hire_date?: string;
  license_number?: string;
  license_expiry?: string;
}

export interface Route {
  route_id: string;
  route_date: string;
  driver_id: string;
  route_start_time: string;
  route_end_time: string;
  route_completion_status: string;  // Changed from specific union type
  route_location_id?: string;
  vehicle_type?: string;
  total_stops?: number;
  total_packages?: number;
  packages_delivered?: number;
  packages_undelivered?: number;
  flex_app_check_in_time?: string;
  flex_app_check_out_time?: string;
}

export interface Scorecard {
  scorecard_week: string;
  driver_id: string;
  on_time_delivery_rate?: number;
  delivery_attempt_rate?: number;
  safe_driving_score?: number;
  customer_feedback_score?: number;
  route_completion_rate?: number;
  bonus_eligibility: boolean;
  bonus_amount_potential?: number;
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
  shift_id?: string;
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
  assigned_vehicle?: string;
  assigned_route?: string;
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
  id?: string;
  driver_id: string;
  driver_name?: string;
  date: string;
  type: string;  // Changed from specific union type to string
  severity: 'low' | 'medium' | 'high';
  description?: string;
  adp_hours?: number;
  amazon_hours?: number;
  variance?: number;
  status: string;  // Changed from specific union type to string
  resolved_by?: string;
  resolved_at?: string;
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