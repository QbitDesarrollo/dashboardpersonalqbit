SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS custom_field_definitions (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  field_type ENUM('text','number','date','select','checkbox','url') NOT NULL,
  options JSON NULL COMMENT 'For select type: array of option strings',
  brand_id CHAR(36) NULL COMMENT 'NULL = global field, set = brand-specific',
  is_required TINYINT(1) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE,
  INDEX idx_brand (brand_id),
  INDEX idx_active_sort (is_active, sort_order)
);

CREATE TABLE IF NOT EXISTS custom_field_values (
  id CHAR(36) PRIMARY KEY,
  task_id CHAR(36) NOT NULL,
  field_id CHAR(36) NOT NULL,
  value_text TEXT NULL,
  value_number DECIMAL(15,4) NULL,
  value_date DATE NULL,
  value_boolean TINYINT(1) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_task_field (task_id, field_id),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (field_id) REFERENCES custom_field_definitions(id) ON DELETE CASCADE,
  INDEX idx_task (task_id),
  INDEX idx_field (field_id)
);
