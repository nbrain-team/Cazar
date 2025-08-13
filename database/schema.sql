-- Cazar AI Ops Hub Database Schema
-- PostgreSQL Database Schema

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drivers table
CREATE TABLE drivers (
    driver_id VARCHAR(50) PRIMARY KEY,
    driver_name VARCHAR(100) NOT NULL,
    driver_status VARCHAR(20) CHECK (driver_status IN ('active', 'inactive')),
    employment_status VARCHAR(20) CHECK (employment_status IN ('active', 'terminated')),
    job_title VARCHAR(50),
    pay_type VARCHAR(20) CHECK (pay_type IN ('hourly', 'salary')),
    pay_rate DECIMAL(10, 2),
    department VARCHAR(50),
    location VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Routes table
CREATE TABLE routes (
    route_id VARCHAR(50) PRIMARY KEY,
    route_date DATE NOT NULL,
    driver_id VARCHAR(50) REFERENCES drivers(driver_id),
    route_start_time TIME NOT NULL,
    route_end_time TIME NOT NULL,
    route_completion_status VARCHAR(20) CHECK (route_completion_status IN ('completed', 'partial', 'failed')),
    route_location_id VARCHAR(50),
    vehicle_type VARCHAR(20) CHECK (vehicle_type IN ('van', 'e-bike', 'car')),
    total_stops INTEGER,
    total_packages INTEGER,
    packages_delivered INTEGER,
    packages_undelivered INTEGER,
    flex_app_check_in_time TIME,
    flex_app_check_out_time TIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Timecards table
CREATE TABLE timecards (
    timecard_id VARCHAR(50) PRIMARY KEY,
    employee_id VARCHAR(50) REFERENCES drivers(driver_id),
    clock_in_time TIMESTAMP NOT NULL,
    clock_out_time TIMESTAMP,
    break_start_time TIMESTAMP,
    break_end_time TIMESTAMP,
    total_hours_worked DECIMAL(5, 2),
    overtime_hours DECIMAL(5, 2),
    shift_id VARCHAR(50),
    scheduled_shift_start TIMESTAMP,
    scheduled_shift_end TIMESTAMP,
    date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Schedules table
CREATE TABLE schedules (
    schedule_id VARCHAR(50) PRIMARY KEY,
    driver_id VARCHAR(50) REFERENCES drivers(driver_id),
    shift_date DATE NOT NULL,
    shift_start TIME NOT NULL,
    shift_end TIME NOT NULL,
    assigned_vehicle VARCHAR(50),
    assigned_route VARCHAR(50),
    scheduled_breaks TEXT[], -- Array of break times
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Scorecards table
CREATE TABLE scorecards (
    scorecard_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    scorecard_week DATE NOT NULL,
    driver_id VARCHAR(50) REFERENCES drivers(driver_id),
    on_time_delivery_rate DECIMAL(5, 2),
    delivery_attempt_rate DECIMAL(5, 2),
    safe_driving_score DECIMAL(5, 2),
    customer_feedback_score DECIMAL(3, 2),
    route_completion_rate DECIMAL(5, 2),
    bonus_eligibility BOOLEAN DEFAULT FALSE,
    bonus_amount_potential DECIMAL(10, 2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Timecard Discrepancies table
CREATE TABLE timecard_discrepancies (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    driver_id VARCHAR(50) REFERENCES drivers(driver_id),
    driver_name VARCHAR(100),
    date DATE NOT NULL,
    type VARCHAR(50) CHECK (type IN ('missing_punch', 'time_mismatch', 'overtime_alert', 'break_violation')),
    severity VARCHAR(20) CHECK (severity IN ('low', 'medium', 'high')),
    description TEXT,
    adp_hours DECIMAL(5, 2),
    amazon_hours DECIMAL(5, 2),
    variance DECIMAL(5, 2),
    status VARCHAR(20) CHECK (status IN ('pending', 'resolved', 'escalated')) DEFAULT 'pending',
    resolved_by VARCHAR(50),
    resolved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Schedule Optimizations table (for AI recommendations)
CREATE TABLE schedule_optimizations (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    optimization_date DATE NOT NULL,
    recommended_changes JSONB,
    coverage_gaps JSONB,
    overtime_risks JSONB,
    applied BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- API Sync Log table
CREATE TABLE api_sync_log (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    api_source VARCHAR(50) CHECK (api_source IN ('amazon_logistics', 'adp', 'dsp_workplace')),
    sync_type VARCHAR(50),
    sync_status VARCHAR(20) CHECK (sync_status IN ('success', 'failed', 'partial')),
    records_synced INTEGER,
    error_message TEXT,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Users table (for authentication)
CREATE TABLE users (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(100) NOT NULL,
    role VARCHAR(50) CHECK (role IN ('admin', 'manager', 'dispatcher')) DEFAULT 'dispatcher',
    is_active BOOLEAN DEFAULT TRUE,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX idx_routes_date ON routes(route_date);
CREATE INDEX idx_routes_driver ON routes(driver_id);
CREATE INDEX idx_timecards_date ON timecards(date);
CREATE INDEX idx_timecards_employee ON timecards(employee_id);
CREATE INDEX idx_discrepancies_status ON timecard_discrepancies(status);
CREATE INDEX idx_discrepancies_date ON timecard_discrepancies(date);
CREATE INDEX idx_schedules_date ON schedules(shift_date);
CREATE INDEX idx_schedules_driver ON schedules(driver_id);

-- Create update trigger for updated_at columns
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_drivers_updated_at BEFORE UPDATE ON drivers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_timecards_updated_at BEFORE UPDATE ON timecards
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_schedules_updated_at BEFORE UPDATE ON schedules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_discrepancies_updated_at BEFORE UPDATE ON timecard_discrepancies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- COMPLIANCE MODULE TABLES

-- Driver Identifiers: links drivers to Amazon Transporter ID and station
CREATE TABLE IF NOT EXISTS driver_identifiers (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    driver_id VARCHAR(50) REFERENCES drivers(driver_id),
    transporter_id VARCHAR(50),
    station_code VARCHAR(20),
    delivery_associate_name VARCHAR(150),
    adp_position_id VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_driver_identifiers_transporter ON driver_identifiers(transporter_id);
CREATE INDEX IF NOT EXISTS idx_driver_identifiers_station ON driver_identifiers(station_code);

-- Weekly DSP metrics at driver granularity (per station, per week)
CREATE TABLE IF NOT EXISTS dsp_driver_weekly_metrics (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    week_code VARCHAR(20) NOT NULL, -- e.g., 2025-29
    station_code VARCHAR(20) NOT NULL,
    transporter_id VARCHAR(50) NOT NULL,
    delivered_packages INTEGER,
    overall_standing VARCHAR(50),
    key_focus_area VARCHAR(100),
    on_road_safety_score VARCHAR(50),
    overall_quality_score VARCHAR(50),
    fico VARCHAR(50),
    acceleration VARCHAR(50),
    braking VARCHAR(50),
    cornering VARCHAR(50),
    distraction VARCHAR(50),
    seatbelt_off_rate DECIMAL(6,3),
    speeding VARCHAR(50),
    speeding_event_rate DECIMAL(6,3),
    distractions_rate DECIMAL(6,3),
    looking_at_phone VARCHAR(50),
    talking_on_phone VARCHAR(50),
    looking_down VARCHAR(50),
    following_distance_rate DECIMAL(6,3),
    sign_signal_violations_rate DECIMAL(6,3),
    stop_sign_violations INTEGER,
    stop_light_violations INTEGER,
    illegal_u_turns INTEGER,
    cdf_dpmo DECIMAL(10,3),
    dcr DECIMAL(10,3),
    dsb DECIMAL(10,3),
    swc_pod DECIMAL(10,3),
    swc_cc DECIMAL(10,3),
    swc_ad DECIMAL(10,3),
    dnrs INTEGER,
    shipments_per_on_zone_hour DECIMAL(10,3),
    pod_opps INTEGER,
    cc_opps INTEGER,
    customer_escalation_defect DECIMAL(10,3),
    customer_delivery_feedback DECIMAL(10,3),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dsp_weekly_metrics_week ON dsp_driver_weekly_metrics(week_code);
CREATE INDEX IF NOT EXISTS idx_dsp_weekly_metrics_station ON dsp_driver_weekly_metrics(station_code);
CREATE INDEX IF NOT EXISTS idx_dsp_weekly_metrics_transporter ON dsp_driver_weekly_metrics(transporter_id);

-- Safety Events (normalized telemetry/camera events)
CREATE TABLE IF NOT EXISTS safety_events (
    event_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    transporter_id VARCHAR(50) NOT NULL,
    station_code VARCHAR(20) NOT NULL,
    route_id VARCHAR(50),
    type VARCHAR(20) CHECK (type IN ('seatbelt','speeding','distraction','hard_brake','collision')),
    severity INTEGER CHECK (severity BETWEEN 1 AND 5),
    occurred_at TIMESTAMP NOT NULL,
    source VARCHAR(50),
    location JSONB,
    video_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_safety_events_time ON safety_events(occurred_at);
CREATE INDEX IF NOT EXISTS idx_safety_events_type ON safety_events(type);
CREATE INDEX IF NOT EXISTS idx_safety_events_transporter ON safety_events(transporter_id);

-- Compliance Rules (thresholds editable in UI)
CREATE TABLE IF NOT EXISTS compliance_rules (
    rule_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    metric_key VARCHAR(100) NOT NULL, -- e.g., seatbelt_off_rate, speeding_event_rate
    operator VARCHAR(5) CHECK (operator IN ('>','>=','=','<','<=')) NOT NULL,
    threshold_value DECIMAL(12,4) NOT NULL,
    rule_window VARCHAR(20) CHECK (rule_window IN ('daily','weekly')) NOT NULL,
    severity VARCHAR(10) CHECK (severity IN ('low','medium','high')) NOT NULL,
    active BOOLEAN DEFAULT TRUE,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Violations detected from metrics vs. rules
CREATE TABLE IF NOT EXISTS driver_violations (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    transporter_id VARCHAR(50) NOT NULL,
    station_code VARCHAR(20) NOT NULL,
    metric_key VARCHAR(100) NOT NULL,
    observed_value DECIMAL(12,4) NOT NULL,
    threshold_value DECIMAL(12,4) NOT NULL,
    severity VARCHAR(10) CHECK (severity IN ('low','medium','high')) NOT NULL,
    occurred_week VARCHAR(20),
    occurred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) CHECK (status IN ('open','acknowledged','resolved','escalated')) DEFAULT 'open',
    rule_id UUID REFERENCES compliance_rules(rule_id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_driver_violations_status ON driver_violations(status);
CREATE INDEX IF NOT EXISTS idx_driver_violations_transporter ON driver_violations(transporter_id);
CREATE INDEX IF NOT EXISTS idx_driver_violations_week ON driver_violations(occurred_week);

-- Optional raw parity tables for ADP/variance (future ingestion)
CREATE TABLE IF NOT EXISTS timecards_raw (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    position_id VARCHAR(50),
    in_time TIMESTAMP,
    out_time TIMESTAMP,
    hours DECIMAL(6,2),
    pay_code VARCHAR(50),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS hours_variance_daily (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    position_id VARCHAR(50),
    pay_date DATE,
    actual_hours DECIMAL(6,2),
    scheduled_hours DECIMAL(6,2),
    variance DECIMAL(6,2),
    worked_type VARCHAR(50),
    payroll_hours DECIMAL(6,2),
    payroll_earnings VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payroll_adjustments (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    position_id VARCHAR(50),
    batch_id VARCHAR(50),
    earnings_code VARCHAR(20),
    amount DECIMAL(10,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- End COMPLIANCE MODULE TABLES 

-- WORK HOURS (WHC) GUARD TABLES
CREATE TABLE IF NOT EXISTS work_hours_policy_profiles (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    station_code VARCHAR(20) NOT NULL,
    state_code VARCHAR(10) NOT NULL,
    min_meal_minutes INTEGER NOT NULL,
    meal_window_start_minute INTEGER NOT NULL, -- minutes after shift start when meal window opens
    meal_window_end_minute INTEGER NOT NULL,   -- minutes after shift start when meal window closes
    min_rest_hours_between_shifts DECIMAL(5,2) NOT NULL,
    max_daily_on_duty_hours DECIMAL(5,2) NOT NULL,
    max_weekly_hours DECIMAL(5,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_whc_policy_station ON work_hours_policy_profiles(station_code);

CREATE TABLE IF NOT EXISTS work_hours_audit_daily (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    work_date DATE NOT NULL,
    station_code VARCHAR(20) NOT NULL,
    position_id VARCHAR(50),
    transporter_id VARCHAR(50),
    driver_name VARCHAR(150),
    shift_start TIMESTAMP,
    shift_end TIMESTAMP,
    on_duty_hours DECIMAL(6,2),
    meal_minutes DECIMAL(6,2),
    meal_within_window BOOLEAN,
    short_rest_flag BOOLEAN,
    daily_max_exceeded BOOLEAN,
    fifth_sixth_day_flag BOOLEAN,
    weekly_hours DECIMAL(6,2),
    weekly_ot_flag BOOLEAN,
    verdict VARCHAR(20) CHECK (verdict IN ('PASS','WARN','FAIL')),
    reasons TEXT[],
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_whc_audit_date ON work_hours_audit_daily(work_date);
CREATE INDEX IF NOT EXISTS idx_whc_audit_station ON work_hours_audit_daily(station_code);
-- END WORK HOURS (WHC) GUARD TABLES 