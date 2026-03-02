SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS project_templates (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_by CHAR(36),
  is_public TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS template_tasks (
  id CHAR(36) PRIMARY KEY,
  template_id CHAR(36) NOT NULL,
  titulo_tarea VARCHAR(500) NOT NULL,
  detalle TEXT,
  prioridad ENUM('alta','media','baja') NOT NULL DEFAULT 'media',
  departamento VARCHAR(255),
  cantidad_entregables INT NOT NULL DEFAULT 1,
  story_points INT,
  relative_start_days INT DEFAULT 0,
  relative_due_days INT NOT NULL DEFAULT 7,
  parent_template_task_id CHAR(36),
  sort_order INT NOT NULL DEFAULT 0,
  FOREIGN KEY (template_id) REFERENCES project_templates(id) ON DELETE CASCADE
);
