-- Tokens de API personales para la integración MCP.
-- Cada usuario genera sus tokens desde la sección "Integración MCP" del frontend.
-- Solo se guarda el hash SHA-256 del token; el prefijo sirve para mostrarlo en la UI.
CREATE TABLE IF NOT EXISTS api_tokens (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  token_hash VARCHAR(64) NOT NULL,
  token_prefix VARCHAR(16) NOT NULL,
  label VARCHAR(100) NULL,
  last_used_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  revoked_at DATETIME(3) NULL,
  UNIQUE KEY uq_api_token_hash (token_hash),
  KEY idx_api_tokens_user (user_id),
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
