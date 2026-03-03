-- Task-Drive file attachments
CREATE TABLE IF NOT EXISTS task_drive_files (
  id CHAR(36) PRIMARY KEY,
  task_id CHAR(36) NOT NULL,
  drive_file_id VARCHAR(255) NOT NULL,
  name VARCHAR(500) NOT NULL,
  mime_type VARCHAR(255),
  icon_url VARCHAR(500),
  web_view_link VARCHAR(1000),
  thumbnail_url VARCHAR(1000),
  size_bytes BIGINT,
  attached_by CHAR(36) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_tdf_task (task_id),
  UNIQUE KEY uniq_task_drive (task_id, drive_file_id)
);

-- Gemini AI conversation history
CREATE TABLE IF NOT EXISTS gemini_conversations (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  title VARCHAR(255) DEFAULT 'Nueva conversación',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_gc_user (user_id)
);

CREATE TABLE IF NOT EXISTS gemini_messages (
  id CHAR(36) PRIMARY KEY,
  conversation_id CHAR(36) NOT NULL,
  role ENUM('user', 'model') NOT NULL,
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_gm_conv (conversation_id),
  FOREIGN KEY (conversation_id) REFERENCES gemini_conversations(id) ON DELETE CASCADE
);
