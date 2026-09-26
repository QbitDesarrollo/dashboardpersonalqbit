import { describe, it, expect } from 'vitest';
import { generarPdf, limpiarPdf, nombreArchivoPdf } from '../src/reportes/pdf.js';
import type { ContenidoReporte } from '../src/reportes/generador.js';

const contenido: ContenidoReporte = {
  version: 1,
  proyecto: { id: 'p1', nombre: 'Bot Proyecta', marca: 'Alba del Bosque', lider: 'Even Fierro', salud: 'amarillo' },
  periodo: { desde: '2026-09-21', hasta: '2026-09-27' },
  indicadores: { completadas: 1, atrasadas: 1, bloqueadas: 0, en_curso: 1, pendientes: 0, avance: 40, total_proyecto: 10, listas_proyecto: 4 },
  resumen_ejecutivo: 'Semana con avances en la lógica de citas → falta la ficha.',
  destacados: {
    logros: [{ texto: 'Se entregó el menú de incidencias.', task_ids: ['t2'] }],
    decisiones: [{ texto: 'La cita solo se ofrece con presupuesto.', task_ids: ['t1'] }],
    riesgos: [{ texto: 'La ficha de ingresos está atrasada.', task_ids: ['t3'] }],
  },
  grupos: [
    { clave: 'completadas', titulo: 'Completadas en el periodo', tareas: [{ id: 't2', titulo: 'Menú de incidencias', responsable: 'Oriana', estado: 'entregado', estado_texto: 'Entregado', fecha_entrega: '2026-09-24', dias_atraso: null, subtareas: null, comentarios: 0, linea: 'No tiene descripción.', fuente: 'plantilla' }] },
    { clave: 'atrasadas', titulo: 'Atrasadas', tareas: [{ id: 't3', titulo: 'Ficha de ingresos', responsable: 'Diego', estado: 'en_proceso', estado_texto: 'En proceso', fecha_entrega: '2026-09-25', dias_atraso: 3, subtareas: '1/2', comentarios: 0, linea: 'Consiste en tomar los ingresos.', fuente: 'plantilla' }] },
    { clave: 'bloqueadas', titulo: 'Bloqueadas', tareas: [] },
    { clave: 'en_curso', titulo: 'En curso', tareas: [{ id: 't1', titulo: 'Momento de ofrecer cita', responsable: 'Jonathan', estado: 'en_proceso', estado_texto: 'En proceso', fecha_entrega: '2026-10-02', dias_atraso: null, subtareas: null, comentarios: 2, linea: 'Se definió cuándo ofrecer la cita.', fuente: 'ia' }] },
    { clave: 'pendientes', titulo: 'Pendientes', tareas: [] },
  ],
  proximo_periodo: [{ id: 't1', titulo: 'Momento de ofrecer cita', responsable: 'Jonathan', fecha_entrega: '2026-10-02' }],
  sin_actualizacion: [{ id: 't3', titulo: 'Ficha de ingresos', responsable: 'Diego' }],
  mensaje_correo: 'El proyecto avanza.',
  generado_en: '2026-09-28T10:40:00.000Z',
};

describe('generarPdf', () => {
  it('arma un PDF con el encabezado, el resumen, los destacados, el detalle y lo que viene', () => {
    const pdf = generarPdf(contenido, { aprobadoPor: 'Even Fierro' });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    const texto = pdf.toString('latin1');
    for (const esperado of [
      'Bot Proyecta', 'Alba del Bosque', 'Resumen ejecutivo', 'Logros', 'Decisiones', 'Riesgos', 'Atrasadas',
      'Ficha de ingresos', '3 días de atraso', 'Próximo periodo', 'Sin actualización', 'Aprobado por Even Fierro',
    ]) expect(texto, esperado).toContain(esperado);
    expect(texto).not.toContain('Bloqueadas (0)');
  });
});

describe('limpiarPdf', () => {
  it('cambia lo que la fuente del PDF no puede dibujar, sin tocar tildes, eñes ni signos del español', () => {
    expect(limpiarPdf('Citas → ficha ✅ ¿listo? ¡sí! ñandú — “ok” • ítem')).toBe('Citas -> ficha ¿listo? ¡sí! ñandú — “ok” • ítem');
  });
});

describe('nombreArchivoPdf', () => {
  it('nombra el archivo con el proyecto y el periodo', () => {
    expect(nombreArchivoPdf(contenido)).toBe('Reporte Bot Proyecta 2026-09-21 a 2026-09-27.pdf');
  });
});
