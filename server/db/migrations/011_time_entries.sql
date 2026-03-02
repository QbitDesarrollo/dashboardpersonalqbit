SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS time_entries (
  id CHAR(36) PRIMARY KEY,
  task_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  start_time DATETIME(3) NOT NULL,
  end_time DATETIME(3),
  duration_seconds INT NOT NULL DEFAULT 0,
  description TEXT,
  billable TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_task (task_id),
  INDEX idx_user_date (user_id, start_time),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
