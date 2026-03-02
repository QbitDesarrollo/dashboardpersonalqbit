-- Control de registro de usuarios (admin)
-- Run: mysql -u root -p tiusdei < server/db/migrations/004_registration_settings.sql

SET NAMES utf8mb4;

-- Habilitar registro público (true/false). Si false, no se muestra el formulario de registro
INSERT IGNORE INTO site_settings (`key`, value) VALUES ('registration_enabled', 'false');

-- Dominios permitidos separados por coma (ej: qbit.com.ec). Solo emails con estos dominios pueden registrarse. Vacío = cualquier dominio
INSERT IGNORE INTO site_settings (`key`, value) VALUES ('registration_allowed_domains', 'qbit.com.ec');

-- Límite máximo de usuarios (0 = sin límite)
INSERT IGNORE INTO site_settings (`key`, value) VALUES ('registration_max_users', '0');
