-- Permiso: quién puede borrar tareas (roles separados por coma)
-- Default: admin,ops
INSERT IGNORE INTO site_settings (`key`, value) VALUES ('can_delete_tasks_roles', 'admin,ops');
