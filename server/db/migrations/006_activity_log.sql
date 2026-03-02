SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS activity_log (
  id CHAR(36) PRIMARY KEY,
  entity_type ENUM('task','deliverable','comment','sprint','feature','brand','client') NOT NULL,
  entity_id CHAR(36) NOT NULL,
  action ENUM('create','update','delete','status_change','assign','comment') NOT NULL,
  field_name VARCHAR(100),
  old_value TEXT,
  new_value TEXT,
  user_id CHAR(36),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_entity (entity_type, entity_id),
  INDEX idx_user (user_id),
  INDEX idx_created (created_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);
