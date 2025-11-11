-- Add meal_breaks table for tracking multiple breaks per shift
-- This captures detailed break data from ADP API

CREATE TABLE IF NOT EXISTS meal_breaks (
    break_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    timecard_id VARCHAR(50) REFERENCES timecards(timecard_id) ON DELETE CASCADE,
    employee_id VARCHAR(50) REFERENCES drivers(driver_id),
    break_code VARCHAR(20), -- 'MEAL', 'REST', etc.
    break_type VARCHAR(50), -- Full description from ADP
    break_start TIMESTAMP NOT NULL,
    break_end TIMESTAMP NOT NULL,
    break_duration_minutes INTEGER,
    is_paid BOOLEAN DEFAULT FALSE,
    date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_meal_breaks_timecard ON meal_breaks(timecard_id);
CREATE INDEX IF NOT EXISTS idx_meal_breaks_employee ON meal_breaks(employee_id);
CREATE INDEX IF NOT EXISTS idx_meal_breaks_date ON meal_breaks(date);
CREATE INDEX IF NOT EXISTS idx_meal_breaks_type ON meal_breaks(break_code);

-- Update trigger for updated_at
CREATE TRIGGER update_meal_breaks_updated_at
    BEFORE UPDATE ON meal_breaks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- NOTES:
-- Run this migration on Render:
-- psql $DATABASE_URL -f database/add_meal_breaks_table.sql

