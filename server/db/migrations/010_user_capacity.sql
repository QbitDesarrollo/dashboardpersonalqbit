SET NAMES utf8mb4;

ALTER TABLE profiles ADD COLUMN weekly_capacity_hours INT NOT NULL DEFAULT 40;
