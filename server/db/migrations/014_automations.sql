SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS automations (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  brand_id CHAR(36),
  desk_id CHAR(36),
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  trigger_type ENUM('status_change','date_reached','assignment_change','task_created','priority_change','comment_added') NOT NULL,
  trigger_config JSON NOT NULL,
  action_type ENUM('change_status','send_notification','send_email','assign_user','change_priority','add_comment','create_subtask') NOT NULL,
  action_config JSON NOT NULL,
  created_by CHAR(36),
  last_triggered_at DATETIME(3),
  trigger_count INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS automation_log (
  id CHAR(36) PRIMARY KEY,
  automation_id CHAR(36) NOT NULL,
  task_id CHAR(36),
  trigger_data JSON,
  action_result JSON,
  success TINYINT(1) NOT NULL DEFAULT 1,
  error_message TEXT,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (automation_id) REFERENCES automations(id) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
);
