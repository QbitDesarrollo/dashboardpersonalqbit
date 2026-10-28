-- Identifica la actividad creada desde el MCP sin modificar las notas existentes.
SET NAMES utf8mb4;

ALTER TABLE minuta_item_notas
  MODIFY COLUMN via ENUM('interno','enlace','mcp') NOT NULL DEFAULT 'interno';
