import { describe, it, expect } from 'vitest';
import { colorResultado, generarPdf, limpiarPdf, nombreArchivoPdf } from '../src/reportes/pdf.js';
import type { ContenidoReporte } from '../src/reportes/generador.js';

const fila = (id: string, titulo: string, responsable: string | null, vence: string | null, resultado: string) => ({ id, titulo, responsable, vence, resultado });
const contenido: ContenidoReporte = {
  version: 3,
  proyecto: { id: 'p1', nombre: 'Asistente Proyecta · Bot', marca: 'Alba del Bosque', lider: 'Even Fierro', salud: 'verde', salud_manual: 'verde', estado: 'en_curso', fecha_fin: '2026-10-02' },
  periodo: { desde: '2026-09-14', hasta: '2026-09-20', parcial: false },
  semana: { desde: '2026-09-14', hasta: '2026-09-20' },
  proxima: { desde: '2026-09-21', hasta: '2026-09-27' },
  semaforo: { color: 'rojo', frase: 'En riesgo: 1 tarea vencida sin entregar.', nota: 'En Tiusdei el proyecto está marcado en verde a mano.' },
  indicadores: { previstas: 3, cumplidas: 2, atrasadas: 2, postergadas: 1, proxima_semana: 1, bloqueadas: 0, entregadas_semana: 3, abiertas: 50, por_vencer: 1 },
  avance: { listas: 33, total: 92, porcentaje: 36, porcentaje_inicio: 16 },
  resumen_ejecutivo: 'Semana productiva: se entregaron 2 de las 3 tareas previstas → la ficha de ingresos preocupa.',
  destacados: {
    logros: [{ texto: 'Se entregaron los roles del panel.', task_ids: ['t2'] }],
    decisiones: [{ texto: 'La cita solo se ofrece con presupuesto.', task_ids: ['t1'] }],
    riesgos: [{ texto: 'La ficha de ingresos va tarde.', task_ids: ['t3'] }],
  },
  entregas: [
    fila('t2', 'Cargar modelos y precios', 'Oriana Barcia', '2026-09-18', 'Entregada el 16 sep · 2 días antes'),
    fila('t3', 'Ficha de ingresos', 'Diego', '2026-09-17', 'En proceso · 4 días de atraso'),
  ],
  atrasadas_anteriores: [fila('t4', 'Contrato de integración', null, '2026-09-10', 'Pendiente · 11 días de atraso')],
  otras_entregas: [fila('t5', 'Menú de incidencias', 'Ana', '2026-09-25', 'Entregada el 18 sep · 7 días antes')],
  cambios_fecha: [{ id: 't1', titulo: 'Momento de ofrecer cita', responsable: 'Jonathan Vera', antes: '2026-09-20', ahora: '2026-09-27', motivo: 'Pedido del cliente', postergada: true }],
  proxima_semana: [fila('t1', 'Momento de ofrecer cita', 'Jonathan Vera', '2026-09-27', 'En proceso')],
  otras_abiertas: [fila('t9', 'Pruebas de carga', 'Ana', null, 'Pendiente')],
  mensaje_correo: 'El proyecto avanza con un atraso.',
  generado_en: '2026-09-21T10:40:00.000Z',
};

describe('generarPdf', () => {
  it('primero lo que se ve de un vistazo, después una tabla por pregunta, cada una con lo que significa', () => {
    const texto = generarPdf(contenido, { aprobadoPor: 'Even Fierro' }).toString('latin1');
    expect(texto.startsWith('%PDF-')).toBe(true);
    for (const esperado of [
      'Asistente Proyecta', 'En riesgo: 1 tarea vencida sin entregar.', 'marcado en verde a mano', '36%', '33 de 92 tareas', 'al empezar la semana: 16%',
      '2 de 3', 'Entregas de la semana', 'Tareas que vencían esta semana y cómo terminaron.', 'Entregada el 16 sep', '4 días de atraso',
      'Atrasadas de semanas anteriores', 'Otras entregas de la semana', 'Cambios de fecha', 'Pedido del cliente',
      'Próxima semana', 'Otras tareas abiertas', 'Pruebas de carga', 'Sin fecha', 'Sin responsable', 'Aprobado por Even Fierro',
    ]) expect(texto, esperado).toContain(esperado);
    expect(texto).not.toContain('Entregadas antes de esta semana');
  });

  it('las secciones vacías no ocupan espacio, salvo las entregas de la semana y la próxima, que lo dicen', () => {
    const texto = generarPdf({ ...contenido, entregas: [], atrasadas_anteriores: [], otras_entregas: [], cambios_fecha: [], proxima_semana: [], otras_abiertas: [] }).toString('latin1');
    expect(texto).toContain('Ninguna tarea vencía esta semana.');
    expect(texto).toContain('No vence ninguna tarea la próxima semana.');
    for (const ausente of ['Atrasadas de semanas anteriores', 'Otras entregas de la semana', 'Cambios de fecha', 'Otras tareas abiertas']) expect(texto, ausente).not.toContain(ausente);
  });

  it('una semana en curso lo dice en el encabezado', () => {
    const texto = generarPdf({ ...contenido, periodo: { ...contenido.periodo, parcial: true } }).toString('latin1');
    expect(texto).toContain('semana en curso');
  });

  it('un reporte con un formato anterior pide regenerarse', () => {
    expect(() => generarPdf({ ...contenido, version: 2 } as unknown as ContenidoReporte)).toThrow('Regenera este reporte para verlo con el formato nuevo.');
  });
});

describe('colorResultado', () => {
  it('rojo lo vencido sin entregar, ámbar lo entregado tarde, verde lo entregado a tiempo o antes', () => {
    expect(colorResultado('En proceso · 4 días de atraso')).toBe('rojo');
    expect(colorResultado('Entregada el 23 sep · 2 días tarde')).toBe('ambar');
    expect(colorResultado('Entregada el 22 sep · a tiempo')).toBe('verde');
    expect(colorResultado('Entregada (sin fecha registrada)')).toBe('verde');
    expect(colorResultado('Pendiente')).toBeNull();
  });
});

describe('limpiarPdf', () => {
  it('cambia lo que la fuente del PDF no puede dibujar, sin tocar tildes, eñes ni signos del español', () => {
    expect(limpiarPdf('Citas → ficha ✅ ¿listo? ¡sí! ñandú — “ok” • ítem')).toBe('Citas › ficha ¿listo? ¡sí! ñandú — “ok” • ítem');
  });
});

describe('nombreArchivoPdf', () => {
  it('nombra el archivo con el proyecto y el periodo', () => {
    expect(nombreArchivoPdf(contenido)).toBe('Reporte Asistente Proyecta · Bot 2026-09-14 a 2026-09-20.pdf');
  });
});
