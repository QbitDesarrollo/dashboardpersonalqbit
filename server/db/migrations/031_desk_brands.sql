-- Relación muchos-a-muchos entre mesas y marcas
-- Una mesa puede tener varias marcas, y una marca puede estar en varias mesas
CREATE TABLE IF NOT EXISTS desk_brands (
  id CHAR(36) NOT NULL PRIMARY KEY,
  desk_id CHAR(36) NOT NULL,
  brand_id CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_desk_brand (desk_id, brand_id),
  FOREIGN KEY (desk_id) REFERENCES desks(id) ON DELETE CASCADE,
  FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
