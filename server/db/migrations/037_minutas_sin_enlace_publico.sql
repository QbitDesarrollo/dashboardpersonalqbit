-- Se descarta el enlace público de minutas (riesgo de exponer evidencias de proyectos).
-- La revisión con el cliente se hace en el modo presentación, dentro de Tiusdei.
SET NAMES utf8mb4;

ALTER TABLE minutas
  DROP INDEX uq_minuta_share_token,
  DROP COLUMN share_token,
  DROP COLUMN share_activo;
