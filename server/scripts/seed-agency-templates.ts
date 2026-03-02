/**
 * Seed de plantillas de agencia.
 * No duplica si la plantilla ya existe por nombre.
 * Ejecutar: cd server && npx tsx scripts/seed-agency-templates.ts
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';
import { randomUUID } from 'crypto';

const TEMPLATES: Array<{
  name: string;
  description: string;
  tasks: string[];
}> = [
  {
    name: 'Diseño — Identidad visual express',
    description: 'Branding rápido (logo + mini guía)',
    tasks: ['Brief y moodboard', 'Exploración de logo', 'Selección de ruta', 'Ajustes finales', 'Entrega de archivos + kit'],
  },
  {
    name: 'Diseño — Pack redes mensual (diseño)',
    description: '12–20 piezas al mes',
    tasks: ['Plan de piezas', 'Diseño lote 1', 'Revisión interna', 'Ajustes', 'Export + entrega'],
  },
  {
    name: 'Diseño — Landing page UI',
    description: 'Diseño de landing completa',
    tasks: ['Wireframe', 'Diseño UI', 'Diseño mobile', 'Revisión con cuentas/cliente', 'Hand-off a dev'],
  },
  {
    name: 'Creatividad — Campaña 360 (concepto)',
    description: 'Concepto + copies + piezas base',
    tasks: ['Research/insight', 'Concepto creativo', 'Key visual + slogan', 'Copies', 'Presentación final', 'Entrega'],
  },
  {
    name: 'Creatividad — Calendario de contenido (mensual)',
    description: 'Ideas + guiones cortos + copies',
    tasks: ['Reunión de arranque', 'Propuesta de temas', 'Copies por pieza', 'Aprobación cliente', 'Ajustes', 'Entrega final'],
  },
  {
    name: 'Creatividad — Naming + tagline',
    description: 'Nombres para marcas/productos',
    tasks: ['Brief + competencia', 'Opciones de naming', 'Validación legal básica', 'Selección + tagline', 'Entrega'],
  },
  {
    name: 'Desarrollo — MVP (4–6 semanas)',
    description: 'Producto mínimo con releases semanales',
    tasks: ['Discovery + alcance', 'UX/UI', 'Setup repo + CI/CD', 'Backend API v1', 'Frontend v1', 'QA + bugs', 'Deploy + handover'],
  },
  {
    name: 'Desarrollo — Feature nueva (Sprint)',
    description: 'Una feature grande',
    tasks: ['Requerimientos + criterios', 'Diseño técnico', 'Implementación', 'Pruebas', 'Deploy'],
  },
  {
    name: 'Desarrollo — Mantenimiento mensual (soporte + mejoras)',
    description: 'Bugs, performance y cambios menores',
    tasks: ['Triage semanal', 'Corrección bugs críticos', 'Mejoras menores', 'Release semanal', 'Reporte mensual'],
  },
  {
    name: 'Comercial — Prospección B2B (semanal)',
    description: 'Pipeline de leads',
    tasks: ['Lista de leads', 'Contacto inicial', 'Seguimiento 1', 'Reunión agendada', 'Propuesta enviada', 'Cierre/Lost'],
  },
  {
    name: 'Comercial — Propuesta / cotización',
    description: 'Armar oferta completa',
    tasks: ['Levantamiento', 'Alcance + entregables', 'Costeo + tiempos', 'PDF propuesta', 'Envío + seguimiento', 'Cierre'],
  },
  {
    name: 'Comercial — Onboarding nuevo cliente (comercial → cuentas)',
    description: 'Transición sin fricción',
    tasks: ['Contrato + anticipo', 'Kickoff', 'Accesos y materiales', 'Definir KPIs', 'Hand-off a cuentas'],
  },
  {
    name: 'Cuentas — Gestión mensual de cuenta (agencia)',
    description: 'Operación mensual por cliente',
    tasks: ['Plan del mes', 'Reunión semanal cliente', 'Coordinación con equipos', 'Control tiempos/budget', 'Reporte mensual'],
  },
  {
    name: 'Cuentas — Gestión de cambios (change request)',
    description: 'Cuando el cliente pide extras',
    tasks: ['Levantar requerimiento', 'Evaluación impacto', 'Aprobación presupuesto', 'Ejecución', 'Entrega + cierre'],
  },
  {
    name: 'Cuentas — Crisis / incidente',
    description: 'Urgente (reputación/sistema)',
    tasks: ['Diagnóstico', 'Plan de respuesta', 'Ejecución', 'Aprobación cliente', 'Post-mortem + prevención'],
  },
  {
    name: 'Administración — Facturación mensual',
    description: 'Cobros recurrentes',
    tasks: ['Revisión servicios y extras', 'Emisión factura', 'Envío', 'Seguimiento pago', 'Confirmación/archivo'],
  },
  {
    name: 'Administración — Compras / proveedores',
    description: 'Adquisiciones y pagos',
    tasks: ['Solicitud interna', 'Cotizaciones', 'Aprobación', 'Compra', 'Pago y registro'],
  },
  {
    name: 'Administración — RRHH: contratación (perfil creativo/dev)',
    description: 'Proceso completo',
    tasks: ['Perfil + publicación', 'Filtro CV', 'Entrevistas', 'Prueba técnica', 'Oferta + onboarding'],
  },
  {
    name: 'Audiovisual — Video corto redes (Reels/TikTok)',
    description: '4–12 piezas mensuales',
    tasks: ['Guion', 'Preproducción', 'Grabación', 'Edición', 'Motion + subtítulos', 'Aprobación cliente', 'Export + entrega'],
  },
  {
    name: 'Audiovisual — Spot publicitario (30–60s)',
    description: 'Producción completa',
    tasks: ['Concepto/guion', 'Storyboard', 'Casting + locación', 'Rodaje', 'Edición offline', 'Color + audio', 'Aprobaciones', 'Master final'],
  },
  {
    name: 'Audiovisual — Podcast (episodio)',
    description: 'Producción recurrente',
    tasks: ['Agenda/guion', 'Grabación', 'Edición', 'Limpieza audio + mezcla', 'Portada + clips', 'Publicación'],
  },
  {
    name: 'Multi-área — Lanzamiento de marca (pack completo)',
    description: 'Creatividad + diseño + social + web',
    tasks: ['Brief + estrategia', 'Identidad', 'Key visual + copies', 'Piezas RRSS', 'Landing', 'QA + checklist lanzamiento', 'Lanzamiento'],
  },
  {
    name: 'Multi-área — Evento (campaña + cobertura)',
    description: 'Cuentas + creatividad + audiovisual',
    tasks: ['Plan del evento', 'Piezas promo', 'Guion cobertura', 'Producción día evento', 'Edición resumen + clips', 'Reporte resultados'],
  },
];

async function main() {
  const url = process.env.DATABASE_URL || 'mysql://root@localhost:3306/tiusdei';
  const conn = await mysql.createConnection(url);

  let created = 0;
  let skipped = 0;

  for (const tpl of TEMPLATES) {
    const [rows] = await conn.query<any[]>('SELECT id FROM project_templates WHERE name = ?', [tpl.name]);
    if (rows.length > 0) {
      skipped++;
      continue;
    }

    const id = randomUUID();
    await conn.query(
      'INSERT INTO project_templates (id, name, description, created_by, is_public) VALUES (?, ?, ?, NULL, 1)',
      [id, tpl.name, tpl.description]
    );

    let sortOrder = 0;
    for (const titulo of tpl.tasks) {
      const taskId = randomUUID();
      const startDays = sortOrder * 3;
      const dueDays = (sortOrder + 1) * 3;
      await conn.query(
        `INSERT INTO template_tasks (id, template_id, titulo_tarea, prioridad, relative_start_days, relative_due_days, sort_order)
         VALUES (?, ?, ?, 'media', ?, ?, ?)`,
        [taskId, id, titulo, startDays, Math.max(1, dueDays), sortOrder]
      );
      sortOrder++;
    }
    created++;
  }

  console.log(`Plantillas creadas: ${created}, omitidas (ya existían): ${skipped}`);
  await conn.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
