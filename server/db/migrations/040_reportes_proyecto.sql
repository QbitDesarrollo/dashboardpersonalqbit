-- Weekly project reports (see REPORTES-PLAN.md): Tiusdei gathers the facts, Codex writes them up,
-- the project leader reviews, approves and sends the PDF to Tiusdei users.
SET NAMES utf8mb4;

-- When each project wants its report. Delivery day and time are in Ecuador time.
CREATE TABLE IF NOT EXISTS proyecto_reportes_config (
  project_id          CHAR(36) NOT NULL,
  activo              TINYINT(1) NOT NULL DEFAULT 0,
  dia_entrega         TINYINT NOT NULL DEFAULT 1 COMMENT '1 = lunes … 7 = domingo',
  hora_entrega        CHAR(5) NOT NULL DEFAULT '08:00' COMMENT 'HH:MM, hora de Ecuador',
  anticipacion_horas  TINYINT NOT NULL DEFAULT 3,
  updated_by          CHAR(36) NULL,
  updated_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (project_id),
  CONSTRAINT fk_rep_config_proyecto FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One report per project and period. `contenido` holds the facts and the write-up used by the screen and the PDF.
CREATE TABLE IF NOT EXISTS proyecto_reportes (
  id                  CHAR(36) NOT NULL,
  project_id          CHAR(36) NOT NULL,
  periodo_desde       DATE NOT NULL,
  periodo_hasta       DATE NOT NULL,
  entregar_en         DATETIME(3) NOT NULL COMMENT 'UTC',
  estado              ENUM('programado','generando','borrador','aprobado','fallido') NOT NULL DEFAULT 'programado',
  intentos            TINYINT NOT NULL DEFAULT 0,
  proximo_intento_en  DATETIME(3) NULL,
  error               VARCHAR(300) NULL,
  contenido           JSON NULL,
  indicaciones        VARCHAR(500) NULL,
  generado_en         DATETIME(3) NULL,
  generando_desde     DATETIME(3) NULL,
  notificado_en       DATETIME(3) NULL,
  aprobado_por        CHAR(36) NULL,
  aprobado_en         DATETIME(3) NULL,
  pdf_path            VARCHAR(255) NULL,
  created_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_rep_periodo (project_id, periodo_desde),
  KEY idx_rep_estado (estado, proximo_intento_en),
  CONSTRAINT fk_rep_proyecto FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Every time an approved report is sent (it can be sent more than once).
CREATE TABLE IF NOT EXISTS proyecto_reporte_envios (
  id           CHAR(36) NOT NULL,
  reporte_id   CHAR(36) NOT NULL,
  enviado_por  CHAR(36) NOT NULL,
  para         JSON NOT NULL,
  cc           JSON NOT NULL,
  enviado_en   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_envio_reporte (reporte_id),
  CONSTRAINT fk_envio_reporte FOREIGN KEY (reporte_id) REFERENCES proyecto_reportes (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- "What this task is about" in one or two lines, written once and reused until the description changes.
CREATE TABLE IF NOT EXISTS tarea_resumenes_ia (
  task_id       CHAR(36) NOT NULL,
  hash_detalle  CHAR(64) NOT NULL,
  resumen       VARCHAR(600) NOT NULL,
  updated_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (task_id),
  CONSTRAINT fk_resumen_tarea FOREIGN KEY (task_id) REFERENCES tasks (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Progress line of one task for one exact input (comments and status changes of the period):
-- regenerating a report does not ask Codex again for tasks whose input did not change.
CREATE TABLE IF NOT EXISTS reporte_avances_ia (
  hash_entrada  CHAR(64) NOT NULL,
  salida        JSON NOT NULL,
  created_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (hash_entrada)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
