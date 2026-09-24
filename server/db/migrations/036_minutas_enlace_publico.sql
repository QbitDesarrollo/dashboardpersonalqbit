-- Enlace público de una minuta: el cliente ve los puntos visibles, solo lectura.
SET NAMES utf8mb4;

ALTER TABLE minutas
  ADD COLUMN share_token VARCHAR(64) NULL,
  ADD COLUMN share_activo TINYINT(1) NOT NULL DEFAULT 0,
  ADD UNIQUE KEY uq_minuta_share_token (share_token);

-- Evidencia con imagen subida a Tiusdei (capturas).
ALTER TABLE minuta_item_evidencias
  MODIFY COLUMN tipo ENUM('archivo','enlace','drive','imagen') NOT NULL;
