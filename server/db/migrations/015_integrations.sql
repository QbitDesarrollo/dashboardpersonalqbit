SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS integrations (
  id CHAR(36) PRIMARY KEY,
  type ENUM('slack','google_calendar','github','gitlab') NOT NULL,
  name VARCHAR(255) NOT NULL,
  config JSON NOT NULL,
  brand_id CHAR(36),
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by CHAR(36),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS integration_events (
  id CHAR(36) PRIMARY KEY,
  integration_id CHAR(36) NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  payload JSON,
  task_id CHAR(36),
  status ENUM('pending','sent','failed') NOT NULL DEFAULT 'pending',
  error_message TEXT,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (integration_id) REFERENCES integrations(id) ON DELETE CASCADE
);
