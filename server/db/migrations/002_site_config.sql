-- Configuración del sitio y correos (editable desde admin)
-- Run: mysql -u root -p tiusdei < server/db/migrations/002_site_config.sql

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS site_settings (
  `key` VARCHAR(64) PRIMARY KEY,
  value TEXT,
  updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
);

INSERT IGNORE INTO site_settings (`key`, value) VALUES
  ('logo_url', NULL),
  ('logo_email_url', NULL),
  ('favicon_url', NULL),
  ('site_name', 'TIUSDEI'),
  ('email_from_name', 'TIUSDEI'),
  ('email_footer_text', 'TIUSDEI Portal · Notificación automática');

CREATE TABLE IF NOT EXISTS email_templates (
  id CHAR(36) PRIMARY KEY,
  type VARCHAR(64) NOT NULL UNIQUE,
  subject_template VARCHAR(500) NOT NULL,
  html_template MEDIUMTEXT,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
);

-- Plantillas por defecto (solo si no existen)
INSERT INTO email_templates (id, type, subject_template, html_template)
SELECT UUID(), 'task_assignment', 'Nueva Tarea Asignada: {{taskTitle}}', NULL
WHERE NOT EXISTS (SELECT 1 FROM email_templates WHERE type = 'task_assignment');

INSERT INTO email_templates (id, type, subject_template, html_template)
SELECT UUID(), 'deadline_warning', '⏰ Aviso: Deadline próximo - {{taskTitle}}', NULL
WHERE NOT EXISTS (SELECT 1 FROM email_templates WHERE type = 'deadline_warning');

INSERT INTO email_templates (id, type, subject_template, html_template)
SELECT UUID(), 'status_change', 'Cambio de estado: {{taskTitle}}', NULL
WHERE NOT EXISTS (SELECT 1 FROM email_templates WHERE type = 'status_change');

INSERT INTO email_templates (id, type, subject_template, html_template)
SELECT UUID(), 'deliverable_approved', 'Entregable aprobado: {{taskTitle}}', NULL
WHERE NOT EXISTS (SELECT 1 FROM email_templates WHERE type = 'deliverable_approved');
