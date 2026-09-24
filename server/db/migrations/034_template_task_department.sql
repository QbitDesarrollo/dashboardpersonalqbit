SET NAMES utf8mb4;

ALTER TABLE template_tasks ADD COLUMN department_id CHAR(36) NULL COMMENT 'Departamento (etapa de pipeline) al aplicar la plantilla';
ALTER TABLE template_tasks ADD CONSTRAINT fk_template_tasks_dept FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL;
