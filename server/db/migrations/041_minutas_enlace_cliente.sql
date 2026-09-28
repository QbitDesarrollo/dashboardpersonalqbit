-- Enlace público de una minuta para el cliente (MINUTAS-ENLACE-PLAN.md).
-- La 037 había quitado el enlace por el riesgo de exponer evidencias; vuelve con código de acceso,
-- sesión firmada y las imágenes servidas con firma de corta duración, nunca con su URL directa.
SET NAMES utf8mb4;

ALTER TABLE minutas
  ADD COLUMN share_token VARCHAR(64) NULL,
  ADD COLUMN share_activo TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN share_codigo CHAR(6) NULL COMMENT 'Visible para el equipo: se copia en el mensaje al cliente',
  ADD COLUMN share_version INT NOT NULL DEFAULT 0 COMMENT 'Sube al apagar el enlace o cambiar el código: invalida sesiones e imágenes firmadas',
  ADD COLUMN share_intentos INT NOT NULL DEFAULT 0,
  ADD COLUMN share_bloqueado_hasta DATETIME(3) NULL,
  ADD UNIQUE KEY uq_minuta_share_token (share_token);

-- Las notas del cliente no tienen usuario de Tiusdei.
ALTER TABLE minuta_item_notas
  ADD COLUMN autor_nombre VARCHAR(120) NULL,
  ADD COLUMN via ENUM('interno','enlace') NOT NULL DEFAULT 'interno';

CREATE TABLE IF NOT EXISTS marca_contactos (
  id          CHAR(36) NOT NULL,
  brand_id    CHAR(36) NOT NULL,
  nombre      VARCHAR(120) NOT NULL,
  email       VARCHAR(255) NOT NULL,
  created_by  CHAR(36) NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_contacto_marca_email (brand_id, email),
  CONSTRAINT fk_contacto_marca FOREIGN KEY (brand_id) REFERENCES brands (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS minuta_envios (
  id           CHAR(36) NOT NULL,
  minuta_id    CHAR(36) NOT NULL,
  medio        ENUM('correo','copiado') NOT NULL,
  para         JSON NOT NULL COMMENT '[{nombre, email}]; puede ir vacío si se copió',
  mensaje      TEXT NOT NULL,
  enviado_por  CHAR(36) NULL,
  enviado_en   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_envio_minuta (minuta_id, enviado_en),
  CONSTRAINT fk_envio_minuta FOREIGN KEY (minuta_id) REFERENCES minutas (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS minuta_accesos (
  id         CHAR(36) NOT NULL,
  minuta_id  CHAR(36) NOT NULL,
  nombre     VARCHAR(120) NOT NULL,
  entro_en   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_acceso_minuta (minuta_id, entro_en),
  CONSTRAINT fk_acceso_minuta FOREIGN KEY (minuta_id) REFERENCES minutas (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
