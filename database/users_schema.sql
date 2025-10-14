-- User Management and Permissions Schema

-- Users table already exists, just add missing column if needed
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'username') THEN
    ALTER TABLE users ADD COLUMN username VARCHAR(255) UNIQUE;
  END IF;
END $$;

-- User data source permissions
CREATE TABLE IF NOT EXISTS user_data_source_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  data_source VARCHAR(50) NOT NULL, -- 'pinecone', 'microsoft', 'adp', 'web', 'postgres'
  enabled BOOLEAN DEFAULT true,
  granted_by UUID REFERENCES users(id), -- Admin who granted permission
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, data_source)
);

-- Audit log for user management actions
CREATE TABLE IF NOT EXISTS user_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID REFERENCES users(id),
  target_user_id UUID REFERENCES users(id),
  action VARCHAR(100) NOT NULL, -- 'create_user', 'update_user', 'delete_user', 'grant_permission', 'revoke_permission'
  details JSONB,
  ip_address VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_user_permissions ON user_data_source_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_user ON user_audit_log(target_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_admin ON user_audit_log(admin_user_id);

-- Create default admin user (password: Admin123! - CHANGE THIS!)
-- Password hash for 'Admin123!' using bcrypt
INSERT INTO users (username, email, name, password_hash, role)
VALUES (
  'admin',
  'admin@cazar.com',
  'System Administrator',
  '$2b$10$rQ6jN8yP7kE5YxZ9vL4wZuFQJ8X3mK2nP1sT6wR9vD5eH7fG3bC4a', -- Admin123!
  'admin'
)
ON CONFLICT (email) DO NOTHING;

-- Grant admin user all data source permissions
INSERT INTO user_data_source_permissions (user_id, data_source, enabled)
SELECT 
  (SELECT id FROM users WHERE email = 'admin@cazar.com'),
  data_source,
  true
FROM (
  VALUES ('pinecone'), ('microsoft'), ('adp'), ('web'), ('postgres')
) AS sources(data_source)
ON CONFLICT (user_id, data_source) DO NOTHING;

