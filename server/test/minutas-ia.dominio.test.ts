import { describe, it, expect } from 'vitest';
import { inicioDelDiaEcuador, limiteDiario, listaDeMesas, normalizarBorrador, tieneAcceso } from '../src/minutas/ia/dominio.js';

describe('acceso por mesa', () => {
  it('lee la lista de mesas permitidas del ajuste', () => {
    expect(listaDeMesas(' d1, d2 ,,d3 ')).toEqual(['d1', 'd2', 'd3']);
    expect(listaDeMesas('')).toEqual([]);
    expect(listaDeMesas(null)).toEqual([]);
  });

  it('solo tiene acceso quien es miembro de alguna mesa permitida', () => {
    expect(tieneAcceso(['d1', 'd2'], ['d9', 'd2'])).toBe(true);
    expect(tieneAcceso(['d1'], ['d9'])).toBe(false);
    expect(tieneAcceso([], ['d1'])).toBe(false);
  });
});

describe('limiteDiario', () => {
  it('usa 10 por defecto y respeta lo configurado entre 0 y 100', () => {
    expect(limiteDiario(null)).toBe(10);
    expect(limiteDiario('abc')).toBe(10);
    expect(limiteDiario('3')).toBe(3);
    expect(limiteDiario('0')).toBe(0);
    expect(limiteDiario('-4')).toBe(0);
    expect(limiteDiario('500')).toBe(100);
  });
});

describe('inicioDelDiaEcuador', () => {
  it('es la medianoche de Guayaquil (05:00 UTC) del día en curso allá', () => {
    expect(inicioDelDiaEcuador(new Date('2026-09-24T15:00:00Z')).toISOString()).toBe('2026-09-24T05:00:00.000Z');
  });

  it('antes de las 05:00 UTC en Ecuador todavía es el día anterior', () => {
    expect(inicioDelDiaEcuador(new Date('2026-09-24T03:00:00Z')).toISOString()).toBe('2026-09-23T05:00:00.000Z');
  });
});

describe('normalizarBorrador', () => {
  const punto = (p: Record<string, unknown> = {}) => ({
    titulo: 'Video en el home', descripcion: 'Sin sonido.', responsable: 'agencia', fecha: null, cita: 'que no suene', tareas_sugeridas: [], ...p,
  });

  it('convierte la salida de la IA en un borrador de minuta', () => {
    const b = normalizarBorrador({
      titulo: ' Revisión de avance ', resumen: 'Lanzamiento el 26.',
      puntos: [
        punto({ fecha: '2026-10-03', tareas_sugeridas: [{ titulo: 'Editar video', departamento: 'Audiovisual' }] }),
        punto({ titulo: 'Fichas técnicas', responsable: 'cliente' }),
      ],
    });
    expect(b).toEqual({
      titulo: 'Revisión de avance', resumen: 'Lanzamiento el 26.',
      puntos: [
        { titulo: 'Video en el home', descripcion: 'Sin sonido.', responsable_cliente: false, origen: 'reunion', fecha_compromiso: '2026-10-03', cita: 'que no suene',
          tareas_sugeridas: [{ titulo: 'Editar video', departamento: 'Audiovisual' }] },
        { titulo: 'Fichas técnicas', descripcion: 'Sin sonido.', responsable_cliente: true, origen: 'reunion', fecha_compromiso: null, cita: 'que no suene', tareas_sugeridas: [] },
      ],
    });
  });

  it('conserva de dónde salió cada punto; si falta o no es válido, lo da por dicho en la reunión', () => {
    const b = normalizarBorrador({ titulo: 'X', resumen: '', puntos: [
      punto({ origen: 'cliente' }), punto({ origen: 'ambos' }), punto({ origen: 'correo' }), punto({}),
    ] });
    expect(b.puntos.map((p) => p.origen)).toEqual(['cliente', 'ambos', 'reunion', 'reunion']);
  });

  it('descarta fechas que no existen o no tienen formato y puntos sin título', () => {
    const b = normalizarBorrador({ titulo: 'X', resumen: '', puntos: [punto({ fecha: '2026-02-30' }), punto({ fecha: 'el viernes' }), punto({ titulo: '  ' })] });
    expect(b.puntos.map((p) => p.fecha_compromiso)).toEqual([null, null]);
  });

  it('recorta textos largos y no acepta más de 50 puntos ni 3 tareas por punto', () => {
    const b = normalizarBorrador({
      titulo: 'T'.repeat(500), resumen: 'R', puntos: Array.from({ length: 60 }, (_, i) => punto({
        titulo: `Punto ${i}`, descripcion: 'd'.repeat(9000),
        tareas_sugeridas: Array.from({ length: 5 }, (_, j) => ({ titulo: `Tarea ${j}`, departamento: 'Diseño' })),
      })),
    });
    expect(b.titulo).toHaveLength(200);
    expect(b.puntos).toHaveLength(50);
    expect(b.puntos[0].descripcion).toHaveLength(5000);
    expect(b.puntos[0].tareas_sugeridas).toHaveLength(3);
  });

  it('rechaza una salida que no tiene la forma esperada', () => {
    expect(() => normalizarBorrador('texto suelto')).toThrow('La IA devolvió un formato inesperado.');
    expect(() => normalizarBorrador({ titulo: 'X', resumen: 'Y', puntos: 'no' })).toThrow('La IA devolvió un formato inesperado.');
  });
});
