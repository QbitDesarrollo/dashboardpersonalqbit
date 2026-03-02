SET NAMES utf8mb4;

ALTER TABLE comments ADD COLUMN edited_at DATETIME(3) NULL;
ALTER TABLE comments ADD COLUMN parent_comment_id CHAR(36) NULL;
ALTER TABLE comments ADD INDEX idx_task_created (task_id, created_at);
