-- Track when users view/read a task detail
CREATE TABLE IF NOT EXISTS task_reads (
  id CHAR(36) PRIMARY KEY,
  task_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  read_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_task_reads_task_user (task_id, user_id),
  CONSTRAINT fk_task_reads_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  CONSTRAINT fk_task_reads_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
