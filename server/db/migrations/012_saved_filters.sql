SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS saved_filters (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  entity_type ENUM('tasks','deliverables','all') NOT NULL DEFAULT 'tasks',
  filter_config JSON NOT NULL,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
