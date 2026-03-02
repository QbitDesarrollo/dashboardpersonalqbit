-- Author of the task (who created it). Used to notify when assignee changes status or marks done.
ALTER TABLE tasks ADD COLUMN created_by CHAR(36) NULL;
ALTER TABLE tasks ADD CONSTRAINT fk_tasks_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
