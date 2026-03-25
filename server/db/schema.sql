-- TIUSDEI MySQL Schema
-- Run: mysql -u user -p tiusdei < server/db/schema.sql

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- Users (replaces auth.users)
CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  nombre VARCHAR(255) NOT NULL,
  rol ENUM('admin', 'ejecutivo', 'equipo', 'cliente') NOT NULL DEFAULT 'equipo',
  activo TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);

-- Profiles (synced with users, kept for compatibility)
CREATE TABLE IF NOT EXISTS profiles (
  id CHAR(36) PRIMARY KEY,
  nombre VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  rol ENUM('admin', 'ejecutivo', 'equipo', 'cliente') NOT NULL DEFAULT 'equipo',
  activo TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (id) REFERENCES users(id) ON DELETE CASCADE
);

-- User roles (for RLS-like checks)
CREATE TABLE IF NOT EXISTS user_roles (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  role ENUM('admin', 'ejecutivo', 'equipo', 'cliente') NOT NULL,
  UNIQUE KEY uq_user_role (user_id, role),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Clients
CREATE TABLE IF NOT EXISTS clients (
  id CHAR(36) PRIMARY KEY,
  nombre VARCHAR(255) NOT NULL,
  email_contacto VARCHAR(255),
  activo TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);

-- Brands
CREATE TABLE IF NOT EXISTS brands (
  id CHAR(36) PRIMARY KEY,
  nombre VARCHAR(255) NOT NULL,
  cliente_id CHAR(36),
  activo TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (cliente_id) REFERENCES clients(id) ON DELETE CASCADE
);

-- Desks
CREATE TABLE IF NOT EXISTS desks (
  id CHAR(36) PRIMARY KEY,
  nombre VARCHAR(255) NOT NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);

-- Task types
CREATE TABLE IF NOT EXISTS task_types (
  id CHAR(36) PRIMARY KEY,
  nombre VARCHAR(255) NOT NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);

-- Deliverable types
CREATE TABLE IF NOT EXISTS deliverable_types (
  id CHAR(36) PRIMARY KEY,
  nombre VARCHAR(255) NOT NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);

-- Tasks
CREATE TABLE IF NOT EXISTS tasks (
  id CHAR(36) PRIMARY KEY,
  check_done TINYINT(1) NOT NULL DEFAULT 0,
  brand_id CHAR(36) NOT NULL,
  desk_id CHAR(36),
  titulo_tarea VARCHAR(500) NOT NULL,
  detalle TEXT,
  cantidad_entregables INT NOT NULL DEFAULT 1,
  responsable_user_id CHAR(36),
  departamento VARCHAR(255),
  prioridad ENUM('alta', 'media', 'baja') NOT NULL DEFAULT 'media',
  estado ENUM('backlog', 'en_proceso', 'en_revision', 'aprobado', 'entregado', 'bloqueado') NOT NULL DEFAULT 'backlog',
  fecha_inicio DATE,
  fecha_entrega DATE NOT NULL,
  enlaces JSON,
  estado_envio ENUM('pendiente', 'enviado') NOT NULL DEFAULT 'pendiente',
  qa_checklist JSON DEFAULT ('[]'),
  tiempo_trabajado INT NOT NULL DEFAULT 0,
  timer_activo TINYINT(1) NOT NULL DEFAULT 0,
  timer_inicio DATETIME(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  created_by CHAR(36) NULL,
  FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE,
  FOREIGN KEY (desk_id) REFERENCES desks(id) ON DELETE SET NULL,
  FOREIGN KEY (responsable_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Deliverables
CREATE TABLE IF NOT EXISTS deliverables (
  id CHAR(36) PRIMARY KEY,
  task_id CHAR(36) NOT NULL,
  tipo_entregable_id CHAR(36),
  version VARCHAR(50) NOT NULL DEFAULT 'v1',
  estado ENUM('borrador', 'en_revision', 'aprobado', 'rechazado', 'final') NOT NULL DEFAULT 'borrador',
  link_final VARCHAR(500),
  aprobado_por CHAR(36),
  aprobado_en DATETIME(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (tipo_entregable_id) REFERENCES deliverable_types(id) ON DELETE SET NULL,
  FOREIGN KEY (aprobado_por) REFERENCES users(id) ON DELETE SET NULL
);

-- Files
CREATE TABLE IF NOT EXISTS files (
  id CHAR(36) PRIMARY KEY,
  task_id CHAR(36),
  deliverable_id CHAR(36),
  nombre_archivo VARCHAR(255) NOT NULL,
  url_storage VARCHAR(500) NOT NULL,
  subido_por CHAR(36),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (deliverable_id) REFERENCES deliverables(id) ON DELETE CASCADE,
  FOREIGN KEY (subido_por) REFERENCES users(id) ON DELETE SET NULL
);

-- Comments
CREATE TABLE IF NOT EXISTS comments (
  id CHAR(36) PRIMARY KEY,
  task_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  comentario TEXT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Approvals
CREATE TABLE IF NOT EXISTS approvals (
  id CHAR(36) PRIMARY KEY,
  task_id CHAR(36) NOT NULL,
  paso ENUM('qa', 'cliente', 'ops') NOT NULL,
  estado ENUM('aprobado', 'rechazado') NOT NULL,
  nota TEXT,
  user_id CHAR(36),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Client brands (user-brand assignments for client role)
CREATE TABLE IF NOT EXISTS client_brands (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  brand_id CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_user_brand (user_id, brand_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE
);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  task_id CHAR(36),
  mensaje TEXT NOT NULL,
  leida TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
);

SET FOREIGN_KEY_CHECKS = 1;
