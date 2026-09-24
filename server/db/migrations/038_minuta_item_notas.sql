-- Notas de un punto: lo que dice el cliente en la reunión (modo presentación)
-- y los ajustes que pide sobre algo ya entregado.
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS minuta_item_notas (
  id             CHAR(36) NOT NULL,
  item_id        CHAR(36) NOT NULL,
  tipo           ENUM('nota','ajuste') NOT NULL DEFAULT 'nota',
  texto          TEXT NOT NULL,
  autor_user_id  CHAR(36) NULL COMMENT 'Quién la registró en Tiusdei',
  created_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_nota_item (item_id),
  CONSTRAINT fk_nota_item FOREIGN KEY (item_id) REFERENCES minuta_items (id) ON DELETE CASCADE,
  CONSTRAINT fk_nota_autor FOREIGN KEY (autor_user_id) REFERENCES profiles (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
