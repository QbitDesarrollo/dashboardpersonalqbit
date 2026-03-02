-- Multiple deliverable types per task
-- Run: mysql -u root -p tiusdei < server/db/migrations/021_task_deliverable_types.sql

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS task_deliverable_types (
  id CHAR(36) PRIMARY KEY,
  task_id CHAR(36) NOT NULL,
  tipo_entregable_id CHAR(36) NOT NULL,
  cantidad INT NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (tipo_entregable_id) REFERENCES deliverable_types(id) ON DELETE CASCADE,
  UNIQUE KEY uq_task_deliverable (task_id, tipo_entregable_id)
);
