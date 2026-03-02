SET NAMES utf8mb4;

ALTER TABLE tasks ADD COLUMN parent_task_id CHAR(36) NULL;
ALTER TABLE tasks ADD INDEX idx_parent (parent_task_id);

CREATE TABLE IF NOT EXISTS task_dependencies (
  id CHAR(36) PRIMARY KEY,
  task_id CHAR(36) NOT NULL,
  depends_on_task_id CHAR(36) NOT NULL,
  dependency_type ENUM('blocks','blocked_by') NOT NULL DEFAULT 'blocks',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_dep (task_id, depends_on_task_id),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (depends_on_task_id) REFERENCES tasks(id) ON DELETE CASCADE
);
