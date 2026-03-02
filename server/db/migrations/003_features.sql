-- Features (características/épicas) para Scrum
-- Run: mysql -u root -p tiusdei < server/db/migrations/003_features.sql

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS features (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  brand_id CHAR(36),
  status ENUM('backlog','en_progreso','completado') NOT NULL DEFAULT 'backlog',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE SET NULL
);

ALTER TABLE tasks ADD COLUMN feature_id CHAR(36) NULL;
