-- Email Analytics Schema for Claude 4.5-Powered Email Analysis
-- This schema stores processed emails with AI-extracted metadata

CREATE TABLE IF NOT EXISTS email_analytics (
  id SERIAL PRIMARY KEY,
  message_id VARCHAR(500) UNIQUE NOT NULL,
  thread_id VARCHAR(500),
  conversation_id VARCHAR(500),
  
  -- Email metadata
  from_email VARCHAR(500),
  from_name VARCHAR(500),
  to_emails TEXT[],
  cc_emails TEXT[],
  subject TEXT,
  body_preview TEXT,
  body_content TEXT,
  received_date TIMESTAMP NOT NULL,
  sent_date TIMESTAMP,
  
  -- AI-extracted categories
  category VARCHAR(100),  -- Operations, Payroll, Fleet, HR, Uniform, PTO, etc.
  sub_category VARCHAR(100),  -- More specific categorization
  request_type VARCHAR(100),  -- PTO, Scheduling, Payroll, Uniform, Incident, Vehicle, etc.
  
  -- Email classification
  is_request BOOLEAN DEFAULT false,
  is_response BOOLEAN DEFAULT false,
  is_forward BOOLEAN DEFAULT false,
  is_internal BOOLEAN DEFAULT false,
  
  -- Response tracking
  parent_message_id VARCHAR(500),  -- Links to original request
  response_to_message_id VARCHAR(500),
  responded_by VARCHAR(500),
  response_time_hours DECIMAL(10,2),
  first_response_date TIMESTAMP,
  
  -- Attachment info
  has_attachment BOOLEAN DEFAULT false,
  attachment_count INTEGER DEFAULT 0,
  attachment_types TEXT[],
  attachment_names TEXT[],
  is_incident_related BOOLEAN DEFAULT false,
  
  -- Forwarding tracking
  forwarded_to TEXT[],
  forwarded_by VARCHAR(500),
  forward_count INTEGER DEFAULT 0,
  
  -- Handler tracking
  handled_by VARCHAR(500),
  assigned_to VARCHAR(500),
  
  -- Status management
  status VARCHAR(50) DEFAULT 'pending',  -- pending, responded, escalated, closed, ignored
  priority VARCHAR(20),  -- low, medium, high, urgent
  sentiment VARCHAR(20),  -- positive, neutral, negative, frustrated
  urgency VARCHAR(20),  -- low, medium, high, critical
  
  -- AI analysis results
  key_entities TEXT[],  -- Names, locations, dates extracted by Claude
  action_items TEXT[],  -- Action items identified
  topics TEXT[],  -- Main topics discussed
  mentioned_drivers TEXT[],  -- Driver names mentioned
  ai_summary TEXT,  -- Claude's summary of the email
  ai_confidence DECIMAL(3,2),  -- Confidence score 0-1
  
  -- Compliance & tracking
  requires_action BOOLEAN DEFAULT false,
  deadline_date TIMESTAMP,
  follow_up_needed BOOLEAN DEFAULT false,
  is_compliant BOOLEAN,
  violation_type VARCHAR(100),
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  processed_at TIMESTAMP,
  last_analyzed_at TIMESTAMP,
  
  -- Indexes for fast querying
  CONSTRAINT fk_parent_message FOREIGN KEY (parent_message_id) REFERENCES email_analytics(message_id) ON DELETE SET NULL
);

-- Create indexes for fast querying
CREATE INDEX IF NOT EXISTS idx_email_received_date ON email_analytics(received_date DESC);
CREATE INDEX IF NOT EXISTS idx_email_category ON email_analytics(category);
CREATE INDEX IF NOT EXISTS idx_email_request_type ON email_analytics(request_type);
CREATE INDEX IF NOT EXISTS idx_email_status ON email_analytics(status);
CREATE INDEX IF NOT EXISTS idx_email_from_email ON email_analytics(from_email);
CREATE INDEX IF NOT EXISTS idx_email_thread_id ON email_analytics(thread_id);
CREATE INDEX IF NOT EXISTS idx_email_conversation_id ON email_analytics(conversation_id);
CREATE INDEX IF NOT EXISTS idx_email_handled_by ON email_analytics(handled_by);
CREATE INDEX IF NOT EXISTS idx_email_is_request ON email_analytics(is_request) WHERE is_request = true;
CREATE INDEX IF NOT EXISTS idx_email_pending ON email_analytics(status, received_date) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_email_needs_response ON email_analytics(is_request, response_to_message_id, received_date) 
  WHERE is_request = true AND response_to_message_id IS NULL;

-- View for unanswered requests
CREATE OR REPLACE VIEW unanswered_requests AS
SELECT 
  id,
  message_id,
  from_name,
  from_email,
  subject,
  request_type,
  category,
  received_date,
  EXTRACT(EPOCH FROM (NOW() - received_date))/3600 as hours_waiting,
  priority,
  urgency
FROM email_analytics
WHERE is_request = true
  AND response_to_message_id IS NULL
  AND status NOT IN ('closed', 'ignored')
ORDER BY received_date ASC;

-- View for email volume by category
CREATE OR REPLACE VIEW email_volume_by_category AS
SELECT 
  category,
  DATE(received_date) as day,
  COUNT(*) as email_count,
  SUM(CASE WHEN is_request THEN 1 ELSE 0 END) as request_count,
  SUM(CASE WHEN is_response THEN 1 ELSE 0 END) as response_count
FROM email_analytics
WHERE received_date >= NOW() - INTERVAL '30 days'
GROUP BY category, DATE(received_date)
ORDER BY day DESC, category;

-- View for response metrics
CREATE OR REPLACE VIEW response_metrics AS
SELECT 
  responded_by,
  category,
  DATE(received_date) as day,
  COUNT(*) as responses_sent,
  AVG(response_time_hours) as avg_response_hours,
  MIN(response_time_hours) as min_response_hours,
  MAX(response_time_hours) as max_response_hours
FROM email_analytics
WHERE is_response = true
  AND responded_by IS NOT NULL
  AND received_date >= NOW() - INTERVAL '30 days'
GROUP BY responded_by, category, DATE(received_date)
ORDER BY day DESC, responded_by;

-- View for driver requests summary
CREATE OR REPLACE VIEW driver_requests_summary AS
SELECT 
  from_name as driver_name,
  from_email,
  request_type,
  COUNT(*) as total_requests,
  SUM(CASE WHEN status = 'responded' THEN 1 ELSE 0 END) as responded_count,
  SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_count,
  AVG(response_time_hours) as avg_response_hours,
  MAX(received_date) as last_request_date
FROM email_analytics
WHERE is_request = true
  AND category IN ('Driver Request', 'PTO', 'Scheduling', 'Payroll')
  AND received_date >= NOW() - INTERVAL '90 days'
GROUP BY from_name, from_email, request_type
ORDER BY last_request_date DESC;

-- Function to update response tracking
CREATE OR REPLACE FUNCTION update_response_tracking()
RETURNS TRIGGER AS $$
BEGIN
  -- When a response is created, update the original request
  IF NEW.is_response = true AND NEW.parent_message_id IS NOT NULL THEN
    UPDATE email_analytics
    SET 
      response_to_message_id = NEW.message_id,
      responded_by = NEW.from_email,
      response_time_hours = EXTRACT(EPOCH FROM (NEW.received_date - received_date))/3600,
      first_response_date = LEAST(COALESCE(first_response_date, NEW.received_date), NEW.received_date),
      status = CASE WHEN status = 'pending' THEN 'responded' ELSE status END,
      updated_at = NOW()
    WHERE message_id = NEW.parent_message_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update response tracking
DROP TRIGGER IF EXISTS trigger_update_response_tracking ON email_analytics;
CREATE TRIGGER trigger_update_response_tracking
  AFTER INSERT OR UPDATE ON email_analytics
  FOR EACH ROW
  EXECUTE FUNCTION update_response_tracking();

-- Function to update timestamps
CREATE OR REPLACE FUNCTION update_email_analytics_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS trigger_update_email_analytics_updated_at ON email_analytics;
CREATE TRIGGER trigger_update_email_analytics_updated_at
  BEFORE UPDATE ON email_analytics
  FOR EACH ROW
  EXECUTE FUNCTION update_email_analytics_updated_at();

