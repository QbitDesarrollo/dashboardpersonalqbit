SET NAMES utf8mb4;

-- Plantillas de ejemplo (solo si no existen)
INSERT IGNORE INTO project_templates (id, name, description, created_by, is_public) VALUES
  ('11111111-1111-4111-8111-111111111111', 'Proyecto Web', 'Desarrollo de sitios web, landing pages y portales corporativos', NULL, 1),
  ('22222222-2222-4222-8222-222222222222', 'App Móvil', 'Desarrollo de aplicaciones móviles iOS y Android', NULL, 1),
  ('33333333-3333-4333-8333-333333333333', 'Community Management', 'Gestión de redes sociales y contenido digital', NULL, 1);

-- Tareas: Proyecto Web
INSERT INTO template_tasks (id, template_id, titulo_tarea, detalle, prioridad, relative_start_days, relative_due_days, sort_order) VALUES
  ('tweb-0001', '11111111-1111-4111-8111-111111111111', 'Brief y kickoff', 'Reunión de inicio, alcance y requerimientos', 'alta', 0, 3, 0),
  ('tweb-0002', '11111111-1111-4111-8111-111111111111', 'Diseño UX/UI', 'Wireframes, mockups y diseño visual', 'alta', 3, 10, 1),
  ('tweb-0003', '11111111-1111-4111-8111-111111111111', 'Desarrollo frontend', 'Maquetación, componentes e integración', 'alta', 10, 21, 2),
  ('tweb-0004', '11111111-1111-4111-8111-111111111111', 'Desarrollo backend', 'API, base de datos y lógica de negocio', 'alta', 10, 21, 3),
  ('tweb-0005', '11111111-1111-4111-8111-111111111111', 'Testing y QA', 'Pruebas funcionales y correcciones', 'media', 21, 28, 4),
  ('tweb-0006', '11111111-1111-4111-8111-111111111111', 'Lanzamiento y entrega', 'Deploy, DNS, documentación', 'alta', 28, 31, 5)
;

-- Tareas: App Móvil
INSERT INTO template_tasks (id, template_id, titulo_tarea, detalle, prioridad, relative_start_days, relative_due_days, sort_order) VALUES
  ('tapp-0001', '22222222-2222-4222-8222-222222222222', 'Brief y especificación', 'Requisitos, user stories y alcance', 'alta', 0, 5, 0),
  ('tapp-0002', '22222222-2222-4222-8222-222222222222', 'Diseño UX/UI móvil', 'Flujos, wireframes y diseño visual', 'alta', 5, 14, 1),
  ('tapp-0003', '22222222-2222-4222-8222-222222222222', 'Desarrollo (iOS/Android)', 'Implementación nativa o cross-platform', 'alta', 14, 42, 2),
  ('tapp-0004', '22222222-2222-4222-8222-222222222222', 'Backend y API', 'Servicios, autenticación y sincronización', 'alta', 14, 35, 3),
  ('tapp-0005', '22222222-2222-4222-8222-222222222222', 'Testing en dispositivos', 'QA en iOS y Android', 'media', 42, 49, 4),
  ('tapp-0006', '22222222-2222-4222-8222-222222222222', 'Publicación en stores', 'App Store y Google Play', 'alta', 49, 56, 5)
;

-- Tareas: Community Management
INSERT INTO template_tasks (id, template_id, titulo_tarea, detalle, prioridad, relative_start_days, relative_due_days, sort_order) VALUES
  ('tcm-0001', '33333333-3333-4333-8333-333333333333', 'Estrategia y briefing', 'Objetivos, audiencia y tono de voz', 'alta', 0, 5, 0),
  ('tcm-0002', '33333333-3333-4333-8333-333333333333', 'Creación de contenido', 'Piezas gráficas, copy y videos', 'media', 5, 12, 1),
  ('tcm-0003', '33333333-3333-4333-8333-333333333333', 'Calendario editorial', 'Planificación de publicaciones', 'media', 10, 15, 2),
  ('tcm-0004', '33333333-3333-4333-8333-333333333333', 'Publicación y monitorización', 'Publicar y responder en redes', 'alta', 15, 22, 3),
  ('tcm-0005', '33333333-3333-4333-8333-333333333333', 'Reporte de resultados', 'Métricas, insights y recomendaciones', 'media', 22, 28, 4)
;
