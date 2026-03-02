-- Add is_favorite to tasks (Monday-style star/favorite)
-- Run once; if column exists, ignore error or skip.
ALTER TABLE tasks ADD COLUMN is_favorite TINYINT(1) NOT NULL DEFAULT 0;
