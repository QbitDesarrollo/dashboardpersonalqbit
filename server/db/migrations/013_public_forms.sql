SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS public_forms (
  id CHAR(36) PRIMARY KEY,
  brand_id CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  slug VARCHAR(100) NOT NULL UNIQUE,
  fields_config JSON NOT NULL,
  default_desk_id CHAR(36),
  default_prioridad ENUM('alta','media','baja') NOT NULL DEFAULT 'media',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by CHAR(36),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE,
  FOREIGN KEY (default_desk_id) REFERENCES desks(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS form_submissions (
  id CHAR(36) PRIMARY KEY,
  form_id CHAR(36) NOT NULL,
  data JSON NOT NULL,
  task_id CHAR(36),
  ip_address VARCHAR(45),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (form_id) REFERENCES public_forms(id) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
);
