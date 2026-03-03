SET NAMES utf8mb4;

ALTER TABLE tasks ADD COLUMN estimated_hours DECIMAL(6,2) NULL COMMENT 'Estimated hours for the task';
