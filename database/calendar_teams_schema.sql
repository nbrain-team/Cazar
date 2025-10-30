-- Calendar Events and Teams Messages Schema
-- Stores Microsoft 365 calendar and Teams data in PostgreSQL for faster queries

-- Calendar Events Table
CREATE TABLE IF NOT EXISTS calendar_events (
  event_id VARCHAR(255) PRIMARY KEY,
  subject TEXT,
  organizer_email VARCHAR(255),
  organizer_name VARCHAR(255),
  attendees JSONB, -- Array of attendee objects
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  location TEXT,
  body_preview TEXT,
  body_content TEXT,
  is_all_day BOOLEAN DEFAULT FALSE,
  is_cancelled BOOLEAN DEFAULT FALSE,
  is_online_meeting BOOLEAN DEFAULT FALSE,
  online_meeting_url TEXT,
  importance VARCHAR(20), -- normal, high, low
  sensitivity VARCHAR(20), -- normal, personal, private, confidential
  show_as VARCHAR(20), -- free, tentative, busy, oof, workingElsewhere
  
  -- Claude AI Analysis
  category VARCHAR(50), -- Meeting, Review, Planning, Training, etc.
  priority VARCHAR(20), -- high, medium, low
  meeting_type VARCHAR(50), -- one-on-one, team, all-hands, client, vendor
  key_topics JSONB, -- Array of main topics discussed
  action_items JSONB, -- Array of action items from meeting
  participants_count INTEGER,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  analyzed_at TIMESTAMPTZ,
  
  CONSTRAINT valid_time_range CHECK (end_time > start_time)
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_calendar_start ON calendar_events(start_time);
CREATE INDEX IF NOT EXISTS idx_calendar_end ON calendar_events(end_time);
CREATE INDEX IF NOT EXISTS idx_calendar_organizer ON calendar_events(organizer_email);
CREATE INDEX IF NOT EXISTS idx_calendar_category ON calendar_events(category);
CREATE INDEX IF NOT EXISTS idx_calendar_priority ON calendar_events(priority);
CREATE INDEX IF NOT EXISTS idx_calendar_synced ON calendar_events(synced_at);

-- Teams Messages Table
CREATE TABLE IF NOT EXISTS teams_messages (
  message_id VARCHAR(255) PRIMARY KEY,
  team_id VARCHAR(255),
  team_name VARCHAR(255),
  channel_id VARCHAR(255),
  channel_name VARCHAR(255),
  from_user_id VARCHAR(255),
  from_name VARCHAR(255),
  from_email VARCHAR(255),
  content TEXT,
  content_type VARCHAR(50), -- text, html
  created_date TIMESTAMPTZ NOT NULL,
  last_modified TIMESTAMPTZ,
  message_type VARCHAR(50), -- message, reply, systemEventMessage
  importance VARCHAR(20), -- normal, high, urgent
  
  -- Message metadata
  mentions JSONB, -- Array of mentioned users
  attachments JSONB, -- Array of attachments
  reactions JSONB, -- Array of reactions
  reply_to_id VARCHAR(255), -- Parent message ID if this is a reply
  
  -- Claude AI Analysis
  category VARCHAR(50), -- Announcement, Question, Update, Decision, etc.
  sentiment VARCHAR(20), -- positive, neutral, negative
  priority VARCHAR(20), -- high, medium, low
  key_topics JSONB, -- Array of main topics
  action_items JSONB, -- Array of action items mentioned
  people_mentioned JSONB, -- Array of people mentioned
  urgency_level VARCHAR(20), -- urgent, normal, low
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  analyzed_at TIMESTAMPTZ
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_teams_created ON teams_messages(created_date);
CREATE INDEX IF NOT EXISTS idx_teams_team ON teams_messages(team_id);
CREATE INDEX IF NOT EXISTS idx_teams_channel ON teams_messages(channel_id);
CREATE INDEX IF NOT EXISTS idx_teams_from ON teams_messages(from_email);
CREATE INDEX IF NOT EXISTS idx_teams_category ON teams_messages(category);
CREATE INDEX IF NOT EXISTS idx_teams_priority ON teams_messages(priority);
CREATE INDEX IF NOT EXISTS idx_teams_synced ON teams_messages(synced_at);
CREATE INDEX IF NOT EXISTS idx_teams_reply ON teams_messages(reply_to_id);

-- Views for common queries

-- Upcoming meetings view
CREATE OR REPLACE VIEW upcoming_meetings AS
SELECT 
  event_id,
  subject,
  organizer_name,
  organizer_email,
  start_time,
  end_time,
  location,
  online_meeting_url,
  attendees,
  category,
  priority,
  key_topics
FROM calendar_events
WHERE start_time >= NOW()
  AND is_cancelled = FALSE
ORDER BY start_time ASC;

-- Recent Teams activity view
CREATE OR REPLACE VIEW recent_teams_activity AS
SELECT 
  message_id,
  team_name,
  channel_name,
  from_name,
  content,
  created_date,
  category,
  priority,
  action_items,
  urgency_level
FROM teams_messages
WHERE created_date >= NOW() - INTERVAL '7 days'
ORDER BY created_date DESC;

-- High priority calendar events
CREATE OR REPLACE VIEW high_priority_meetings AS
SELECT 
  event_id,
  subject,
  organizer_name,
  start_time,
  end_time,
  attendees,
  category,
  key_topics,
  action_items
FROM calendar_events
WHERE priority = 'high'
  AND start_time >= NOW()
  AND is_cancelled = FALSE
ORDER BY start_time ASC;

-- Urgent Teams messages
CREATE OR REPLACE VIEW urgent_teams_messages AS
SELECT 
  message_id,
  team_name,
  channel_name,
  from_name,
  from_email,
  content,
  created_date,
  action_items,
  urgency_level
FROM teams_messages
WHERE urgency_level = 'urgent'
  AND created_date >= NOW() - INTERVAL '7 days'
ORDER BY created_date DESC;

-- Meeting summary by category
CREATE OR REPLACE VIEW meeting_summary_by_category AS
SELECT 
  category,
  COUNT(*) as total_meetings,
  COUNT(CASE WHEN start_time >= NOW() THEN 1 END) as upcoming_meetings,
  COUNT(CASE WHEN priority = 'high' THEN 1 END) as high_priority_meetings,
  AVG(EXTRACT(EPOCH FROM (end_time - start_time))/3600) as avg_duration_hours
FROM calendar_events
WHERE is_cancelled = FALSE
GROUP BY category
ORDER BY total_meetings DESC;

-- Teams activity by channel
CREATE OR REPLACE VIEW teams_activity_by_channel AS
SELECT 
  team_name,
  channel_name,
  COUNT(*) as message_count,
  COUNT(DISTINCT from_email) as unique_participants,
  MAX(created_date) as last_activity,
  COUNT(CASE WHEN urgency_level = 'urgent' THEN 1 END) as urgent_messages
FROM teams_messages
WHERE created_date >= NOW() - INTERVAL '30 days'
GROUP BY team_name, channel_name
ORDER BY message_count DESC;

-- Comments
COMMENT ON TABLE calendar_events IS 'Synced calendar events from Microsoft 365 with Claude AI analysis';
COMMENT ON TABLE teams_messages IS 'Synced Teams messages from Microsoft 365 with Claude AI analysis';
COMMENT ON COLUMN calendar_events.category IS 'AI-categorized meeting type';
COMMENT ON COLUMN calendar_events.key_topics IS 'AI-extracted main topics from meeting';
COMMENT ON COLUMN teams_messages.sentiment IS 'AI-analyzed sentiment of message';
COMMENT ON COLUMN teams_messages.action_items IS 'AI-extracted action items from message';

