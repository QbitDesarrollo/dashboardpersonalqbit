import { describe, it, expect } from 'vitest';
import { generarPdf, limpiarPdf, nombreArchivoPdf } from '../src/reportes/pdf.js';
import type { ContenidoReporte } from '../src/reportes/generador.js';

const contenido: ContenidoReporte = {
  version: 2,
  proyecto: { id: 'p1', nombre: 'Bot Proyecta', marca: 'Alba del Bosque', lider: 'Even Fierro', salud: 'amarillo' },
  periodo: { desde: '2026-09-14', hasta: '2026-09-20', parcial: false },
  semaforo: { color: 'rojo', frase: 'En riesgo: 1 entrega atrasada.' },
  indicadores: { entregadas: 6, atrasadas: 1, bloqueadas: 0, fechas_movidas: 2, proximas: 4, abiertas: 50, avance: 36, avance_semana: 4 },
  resumen_ejecutivo: 'Semana productiva: se entregaron 6 tareas → la ficha de ingresos preocupa.',
  destacados: {
    logros: [{ texto: 'Se entregaron los roles del panel.', task_ids: ['t2'] }],
    decisiones: [{ texto: 'La cita solo se ofrece con presupuesto.', task_ids: ['t1'] }],
    riesgos: [{ texto: 'La ficha de ingresos va tarde.', task_ids: ['t3'] }],
  },
  movidas: [
    { id: 't2', titulo: 'Cargar modelos y precios', responsable: 'Oriana Barcia', estado_texto: 'Entregado', eventos: ['Entregada el 18 sep por Oriana Barcia · 7 días antes de lo previsto'], avance: null },
    { id: 't1', titulo: 'Momento de ofrecer cita', responsable: 'Jonathan Vera', estado_texto: 'En proceso', eventos: ['Fecha movida del 20 sep al 27 sep · por pedido del cliente'], avance: 'Se acordó ofrecer la cita solo con presupuesto.' },
  ],
  riesgos: [{ id: 't3', titulo: 'Ficha de ingresos', responsable: 'Diego', estado_texto: 'En proceso', fecha_entrega: '2026-09-17', dias_atraso: 4 }],
  proximas: [{ id: 't1', titulo: 'Momento de ofrecer cita', responsable: 'Jonathan Vera', estado_texto: 'En proceso', fecha_entrega: '2026-09-27' }],
  resto: [{ id: 't9', titulo: 'Pruebas de carga', responsable: 'Ana', estado_texto: 'Pendiente', fecha_entrega: null }],
  entregadas_antes: 5,
  mensaje_correo: 'El proyecto avanza con un atraso.',
  generado_en: '2026-09-21T10:40:00.000Z',
};

describe('generarPdf', () => {
  it('primero lo que se ve de un vistazo, después el detalle de la semana y el resto compacto', () => {
    const texto = generarPdf(contenido, { aprobadoPor: 'Even Fierro' }).toString('latin1');
    expect(texto.startsWith('%PDF-')).toBe(true);
    for (const esperado of [
      'Bot Proyecta', 'En riesgo: 1 entrega atrasada.', '36%', '+4 esta semana', 'Resumen ejecutivo', 'Riesgos',
      'Esta semana', 'Entregada el 18 sep por Oriana Barcia', 'por pedido del cliente', '4 días de atraso',
      'Próxima semana', 'Resto del proyecto', 'Pruebas de carga', 'Entregadas antes de esta semana: 5', 'Aprobado por Even Fierro',
    ]) expect(texto, esperado).toContain(esperado);
  });

  it('una semana en curso lo dice en el encabezado', () => {
    const texto = generarPdf({ ...contenido, periodo: { ...contenido.periodo, parcial: true } }).toString('latin1');
    expect(texto).toContain('semana en curso');
  });

  it('un reporte con el formato anterior pide regenerarse', () => {
    expect(() => generarPdf({ ...contenido, version: 1 } as unknown as ContenidoReporte)).toThrow('Regenera este reporte para verlo con el formato nuevo.');
  });
});

describe('limpiarPdf', () => {
  it('cambia lo que la fuente del PDF no puede dibujar, sin tocar tildes, eñes ni signos del español', () => {
    expect(limpiarPdf('Citas → ficha ✅ ¿listo? ¡sí! ñandú — “ok” • ítem')).toBe('Citas › ficha ¿listo? ¡sí! ñandú — “ok” • ítem');
  });
});

describe('nombreArchivoPdf', () => {
  it('nombra el archivo con el proyecto y el periodo', () => {
    expect(nombreArchivoPdf(contenido)).toBe('Reporte Bot Proyecta 2026-09-14 a 2026-09-20.pdf');
  });
});
