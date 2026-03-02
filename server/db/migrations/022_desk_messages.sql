CREATE TABLE IF NOT EXISTS desk_messages (
  id CHAR(36) PRIMARY KEY,
  desk_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  mensaje TEXT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (desk_id) REFERENCES desks(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_desk_created (desk_id, created_at)
);
