SET NAMES utf8mb4;

ALTER TABLE tasks ADD COLUMN recurrence_type ENUM('none','daily','weekly','biweekly','monthly','custom') NOT NULL DEFAULT 'none';
ALTER TABLE tasks ADD COLUMN recurrence_interval INT NULL COMMENT 'For custom: every N days';
ALTER TABLE tasks ADD COLUMN recurrence_end_date DATE NULL COMMENT 'Optional end date for recurrence';
ALTER TABLE tasks ADD COLUMN recurrence_parent_id CHAR(36) NULL COMMENT 'Links to original recurring task';

ALTER TABLE tasks ADD INDEX idx_recurrence_parent (recurrence_parent_id);
