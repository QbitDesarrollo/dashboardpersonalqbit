-- Scrum: Sprints + story points
-- Run once: mysql -u root -p tiusdei < server/db/migrations/001_scrum.sql

SET NAMES utf8mb4;

-- Sprints (por marca/proyecto)
CREATE TABLE IF NOT EXISTS sprints (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  goal TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status ENUM('planned','active','completed') NOT NULL DEFAULT 'planned',
  brand_id CHAR(36),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE SET NULL
);

-- Tasks: sprint + story points (ejecutar una sola vez; si falla "Duplicate column", ya está aplicada)
ALTER TABLE tasks ADD COLUMN sprint_id CHAR(36) NULL;
ALTER TABLE tasks ADD COLUMN story_points INT NULL;
-- Opcional: ALTER TABLE tasks ADD CONSTRAINT fk_tasks_sprint FOREIGN KEY (sprint_id) REFERENCES sprints(id) ON DELETE SET NULL;
