SET NAMES utf8mb4;

-- Extend time_entries with activity tracking columns
ALTER TABLE time_entries
  ADD COLUMN activity_level TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Percentage 0-100',
  ADD COLUMN screenshot_count INT NOT NULL DEFAULT 0,
  ADD COLUMN idle_seconds INT NOT NULL DEFAULT 0,
  ADD COLUMN status ENUM('active','paused','completed') NOT NULL DEFAULT 'active',
  ADD INDEX idx_te_status (status),
  ADD INDEX idx_te_start_date (start_time);

-- Screenshots metadata
CREATE TABLE IF NOT EXISTS screenshots (
  id CHAR(36) PRIMARY KEY,
  time_entry_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  task_id CHAR(36) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  thumbnail_path VARCHAR(500),
  activity_percent TINYINT UNSIGNED NOT NULL DEFAULT 0,
  captured_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_ss_user_date (user_id, captured_at),
  INDEX idx_ss_time_entry (time_entry_id),
  INDEX idx_ss_task (task_id),
  FOREIGN KEY (time_entry_id) REFERENCES time_entries(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

-- Activity snapshots (every ~60 seconds)
CREATE TABLE IF NOT EXISTS activity_snapshots (
  id CHAR(36) PRIMARY KEY,
  time_entry_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  keyboard_events INT NOT NULL DEFAULT 0,
  mouse_events INT NOT NULL DEFAULT 0,
  scroll_events INT NOT NULL DEFAULT 0,
  click_events INT NOT NULL DEFAULT 0,
  activity_percent TINYINT UNSIGNED NOT NULL DEFAULT 0,
  is_idle TINYINT(1) NOT NULL DEFAULT 0,
  snapshot_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_as_time_entry (time_entry_id),
  INDEX idx_as_user_date (user_id, snapshot_at),
  FOREIGN KEY (time_entry_id) REFERENCES time_entries(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Attendance (check-in / check-out)
CREATE TABLE IF NOT EXISTS attendance (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  check_in DATETIME(3) NOT NULL,
  check_out DATETIME(3),
  total_seconds INT NOT NULL DEFAULT 0,
  notes TEXT,
  auto_checked_out TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_att_user_date (user_id, check_in),
  INDEX idx_att_date (check_in),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Time Doctor settings
INSERT IGNORE INTO site_settings (`key`, value) VALUES
  ('timedoctor_screenshot_interval', '5'),
  ('timedoctor_idle_threshold', '5'),
  ('timedoctor_auto_pause_idle', '0'),
  ('timedoctor_require_attendance', '0');
