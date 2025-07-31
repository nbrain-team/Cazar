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