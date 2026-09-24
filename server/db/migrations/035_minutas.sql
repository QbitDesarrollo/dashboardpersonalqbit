-- Minutas de reunión: lo que se habló con el cliente, punto por punto.
-- Una minuta cuelga de la marca (proyecto opcional). Cada punto puede tener
-- tareas vinculadas y se cierra con evidencia.
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS minutas (
  id             CHAR(36) NOT NULL,
  brand_id       CHAR(36) NOT NULL,
  project_id     CHAR(36) NULL,
  numero         INT NOT NULL COMMENT 'Correlativo por marca: M-01, M-02...',
  titulo         VARCHAR(200) NOT NULL,
  fecha          DATE NOT NULL,
  owner_user_id  CHAR(36) NOT NULL COMMENT 'Responsable de la minuta',
  resumen        TEXT NULL COMMENT 'Contexto y acuerdos generales',
  enlaces        JSON NULL,
  estado         ENUM('borrador','publicada') NOT NULL DEFAULT 'borrador',
  created_by     CHAR(36) NULL,
  created_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_minuta_numero (brand_id, numero),
  KEY idx_minuta_project (project_id),
  KEY idx_minuta_fecha (fecha),
  CONSTRAINT fk_minuta_brand FOREIGN KEY (brand_id) REFERENCES brands (id) ON DELETE CASCADE,
  CONSTRAINT fk_minuta_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE SET NULL,
  CONSTRAINT fk_minuta_owner FOREIGN KEY (owner_user_id) REFERENCES profiles (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS minuta_miembros (
  minuta_id  CHAR(36) NOT NULL,
  user_id    CHAR(36) NOT NULL,
  PRIMARY KEY (minuta_id, user_id),
  KEY idx_miembro_user (user_id),
  CONSTRAINT fk_miembro_minuta FOREIGN KEY (minuta_id) REFERENCES minutas (id) ON DELETE CASCADE,
  CONSTRAINT fk_miembro_user FOREIGN KEY (user_id) REFERENCES profiles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS minuta_items (
  id                   CHAR(36) NOT NULL,
  minuta_id            CHAR(36) NOT NULL,
  numero               INT NOT NULL COMMENT '1..n dentro de la minuta',
  titulo               VARCHAR(300) NOT NULL,
  descripcion          TEXT NULL,
  responsable_user_id  CHAR(36) NULL,
  responsable_cliente  TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Lo debe hacer o enviar el cliente',
  fecha_compromiso     DATE NULL,
  estado               ENUM('pendiente','en_curso','completado','aprobado','descartado') NOT NULL DEFAULT 'pendiente',
  resolucion           TEXT NULL COMMENT 'Qué se hizo; obligatorio al completar',
  motivo_descarte      TEXT NULL,
  completado_por       CHAR(36) NULL,
  completado_en        DATETIME(3) NULL,
  aprobado_por_nombre  VARCHAR(120) NULL,
  aprobado_via         ENUM('enlace','reunion') NULL,
  aprobado_en          DATETIME(3) NULL,
  visible_cliente      TINYINT(1) NOT NULL DEFAULT 1,
  origen               ENUM('manual','ia') NOT NULL DEFAULT 'manual',
  cita_transcripcion   TEXT NULL,
  tareas_sugeridas     JSON NULL,
  sort_order           INT NOT NULL DEFAULT 0,
  created_at           DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at           DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_item_numero (minuta_id, numero),
  KEY idx_item_responsable (responsable_user_id),
  CONSTRAINT fk_item_minuta FOREIGN KEY (minuta_id) REFERENCES minutas (id) ON DELETE CASCADE,
  CONSTRAINT fk_item_responsable FOREIGN KEY (responsable_user_id) REFERENCES profiles (id) ON DELETE SET NULL,
  CONSTRAINT fk_item_completado_por FOREIGN KEY (completado_por) REFERENCES profiles (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS minuta_item_evidencias (
  id              CHAR(36) NOT NULL,
  item_id         CHAR(36) NOT NULL,
  tipo            ENUM('archivo','enlace','drive') NOT NULL,
  nombre          VARCHAR(500) NOT NULL,
  url             VARCHAR(1000) NOT NULL,
  drive_file_id   VARCHAR(255) NULL,
  origen_task_id  CHAR(36) NULL COMMENT 'Si se tomó de una tarea vinculada',
  subido_por      CHAR(36) NULL,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_evidencia_item (item_id),
  CONSTRAINT fk_evidencia_item FOREIGN KEY (item_id) REFERENCES minuta_items (id) ON DELETE CASCADE,
  CONSTRAINT fk_evidencia_task FOREIGN KEY (origen_task_id) REFERENCES tasks (id) ON DELETE SET NULL,
  CONSTRAINT fk_evidencia_user FOREIGN KEY (subido_por) REFERENCES profiles (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Las tareas creadas o vinculadas desde un punto guardan el vínculo.
ALTER TABLE tasks
  ADD COLUMN minuta_item_id CHAR(36) NULL,
  ADD KEY idx_tasks_minuta_item (minuta_item_id),
  ADD CONSTRAINT fk_tasks_minuta_item FOREIGN KEY (minuta_item_id) REFERENCES minuta_items (id) ON DELETE SET NULL;
