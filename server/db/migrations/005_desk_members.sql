-- Equipo de trabajo por mesa (desk_members)
-- Run: mysql -u root -p tiusdei < server/db/migrations/005_desk_members.sql

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS desk_members (
  id CHAR(36) PRIMARY KEY,
  desk_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_desk_user (desk_id, user_id),
  FOREIGN KEY (desk_id) REFERENCES desks(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
