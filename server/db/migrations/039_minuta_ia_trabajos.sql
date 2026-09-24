-- Minutas drafted by AI (Codex runner). The transcript itself is never stored:
-- only its length, the resulting draft and the outcome, to enforce the daily cap per person.
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS minuta_ia_trabajos (
  id            CHAR(36) NOT NULL,
  user_id       CHAR(36) NOT NULL,
  estado        ENUM('procesando','listo','error') NOT NULL DEFAULT 'procesando',
  caracteres    INT NOT NULL COMMENT 'Largo de la transcripción; el texto no se guarda',
  borrador      JSON NULL,
  error         VARCHAR(300) NULL,
  created_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  terminado_at  DATETIME(3) NULL,
  PRIMARY KEY (id),
  KEY idx_ia_usuario_fecha (user_id, created_at),
  CONSTRAINT fk_ia_usuario FOREIGN KEY (user_id) REFERENCES profiles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
