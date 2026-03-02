-- Add tipo_entregable_id column to tasks table
ALTER TABLE tasks ADD COLUMN tipo_entregable_id CHAR(36) NULL;
ALTER TABLE tasks ADD CONSTRAINT fk_tasks_tipo_entregable
  FOREIGN KEY (tipo_entregable_id) REFERENCES deliverable_types(id)
  ON DELETE SET NULL;
