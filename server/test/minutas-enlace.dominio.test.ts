import { describe, it, expect } from 'vitest';
import {
  ALFABETO_CODIGO, evaluarIntento, resumenValido, generarCodigo, mensajeCliente, minutaParaCliente, nombresDeEnvios, normalizarCodigo,
} from '../src/minutas/enlace/dominio.js';

describe('generarCodigo', () => {
  it('son 6 caracteres sin los que se confunden al copiarlos (0/O, 1/I/L)', () => {
    expect(ALFABETO_CODIGO).not.toMatch(/[01OIL]/);
    const codigo = generarCodigo();
    expect(codigo).toMatch(new RegExp(`^[${ALFABETO_CODIGO}]{6}$`));
  });

  it('usa el azar que recibe (para poder probarlo)', () => {
    let i = 0;
    expect(generarCodigo(() => i++)).toBe(ALFABETO_CODIGO.slice(0, 6));
  });
});

describe('normalizarCodigo', () => {
  it('acepta minúsculas, espacios y guiones al escribirlo', () => {
    expect(normalizarCodigo(' k7p-2 qx ')).toBe('K7P2QX');
  });
});

describe('evaluarIntento', () => {
  const ahora = new Date('2026-09-28T15:00:00Z');
  const base = { codigo: 'K7P2QX', intentos: 0, bloqueadoHasta: null as Date | null };

  it('el código correcto entra, escrito como sea', () => {
    expect(evaluarIntento(base, 'k7p2qx', ahora)).toEqual({ ok: true });
  });

  it('un código errado suma un intento', () => {
    expect(evaluarIntento({ ...base, intentos: 3 }, 'AAAAAA', ahora)).toEqual({ ok: false, motivo: 'codigo', intentos: 4, bloqueadoHasta: null });
  });

  it('al quinto errado se bloquea 15 minutos y el contador vuelve a cero', () => {
    expect(evaluarIntento({ ...base, intentos: 4 }, 'AAAAAA', ahora))
      .toEqual({ ok: false, motivo: 'bloqueado', intentos: 0, bloqueadoHasta: new Date('2026-09-28T15:15:00Z') });
  });

  it('mientras está bloqueado no deja entrar ni con el código correcto', () => {
    const bloqueadoHasta = new Date('2026-09-28T15:10:00Z');
    expect(evaluarIntento({ ...base, bloqueadoHasta }, 'K7P2QX', ahora)).toEqual({ ok: false, motivo: 'bloqueado', intentos: 0, bloqueadoHasta });
  });

  it('pasado el bloqueo vuelve a aceptar el código', () => {
    expect(evaluarIntento({ ...base, bloqueadoHasta: new Date('2026-09-28T14:59:00Z') }, 'K7P2QX', ahora)).toEqual({ ok: true });
  });

  it('sin código guardado nadie entra', () => {
    expect(evaluarIntento({ ...base, codigo: null }, '', ahora)).toMatchObject({ ok: false, motivo: 'codigo' });
  });
});

describe('minutaParaCliente', () => {
  const punto = (p: Record<string, unknown>) => ({
    id: 'i1', numero: 1, titulo: 'Punto', descripcion: 'Qué se pidió', estado: 'completado', visible_cliente: true, responsable_cliente: false,
    fecha_compromiso: '2026-09-30', resolucion: 'Listo', aprobado_via: null, aprobado_por_nombre: null, aprobado_en: null,
    responsable: { id: 'u1', nombre: 'Even Fierro', avatar_url: null }, completado_por: { id: 'u1', nombre: 'Even Fierro' }, completado_en: '2026-09-27',
    motivo_descarte: null, tareas: [{ id: 't1', titulo_tarea: 'Interna' }],
    evidencias: [
      { id: 'e1', tipo: 'imagen', nombre: 'captura.png', url: 'https://tiusdei.qbit.ec/uploads/editor/abc.png', drive_file_id: null, origen_task_id: 't1' },
      { id: 'e2', tipo: 'enlace', nombre: 'Sitio', url: 'https://proyecta.ec/', drive_file_id: null, origen_task_id: null },
    ],
    notas: [
      { id: 'n1', tipo: 'nota', texto: 'Dicha en la reunión', created_at: '2026-09-27', autor: { id: 'u1', nombre: 'Even Fierro' }, autor_nombre: null, via: 'interno' },
      { id: 'n2', tipo: 'ajuste', texto: 'Cambiar el color', created_at: '2026-09-28', autor: null, autor_nombre: 'Antonio', via: 'enlace' },
    ],
    ...p,
  });
  const detalle = {
    id: 'm1', brand_id: 'b1', brand_nombre: 'Alba del Bosque', project_id: 'p1', project_nombre: 'Bot', numero: 1, codigo: 'M-01',
    titulo: 'Seguimiento', fecha: '2026-09-24', resumen: 'Acuerdos', enlaces: [], estado: 'publicada',
    owner: { id: 'u1', nombre: 'Even Fierro', avatar_url: null }, miembros: [{ id: 'u1', nombre: 'Even Fierro' }],
    progreso: { total: 3, cerrados: 1, enCurso: 1 }, created_at: '2026-09-24',
    items: [punto({}), punto({ id: 'i2', visible_cliente: false }), punto({ id: 'i3', estado: 'descartado' })],
  };

  it('solo los puntos visibles y no descartados, sin tareas ni gente del equipo', () => {
    const m = minutaParaCliente(detalle, (e) => `/firmada/${e.id}`);
    expect(m).toEqual({
      id: 'm1', numero: 1, codigo: 'M-01', titulo: 'Seguimiento', fecha: '2026-09-24', resumen: 'Acuerdos',
      brand_nombre: 'Alba del Bosque', project_nombre: 'Bot',
      items: [{
        id: 'i1', numero: 1, titulo: 'Punto', descripcion: 'Qué se pidió', estado: 'completado', visible_cliente: true, responsable_cliente: false,
        fecha_compromiso: '2026-09-30', resolucion: 'Listo', aprobado_via: null, aprobado_por_nombre: null, aprobado_en: null,
        evidencias: [
          { id: 'e1', tipo: 'imagen', nombre: 'captura.png', url: '/firmada/e1' },
          { id: 'e2', tipo: 'enlace', nombre: 'Sitio', url: 'https://proyecta.ec/' },
        ],
        notas: [
          { id: 'n1', tipo: 'nota', texto: 'Dicha en la reunión', created_at: '2026-09-27', autor_nombre: null },
          { id: 'n2', tipo: 'ajuste', texto: 'Cambiar el color', created_at: '2026-09-28', autor_nombre: 'Antonio' },
        ],
      }],
    });
    expect(JSON.stringify(m)).not.toContain('Even Fierro');
    expect(JSON.stringify(m)).not.toContain('uploads/editor');
  });
});

describe('minutaParaCliente · aprobaciones', () => {
  const base = {
    id: 'm1', numero: 1, codigo: 'M-01', titulo: 'T', fecha: '2026-09-24', resumen: null, brand_nombre: 'Alba', project_nombre: null,
  };
  const punto = (aprobado_via: string, aprobado_por_nombre: string) => ({
    id: 'i1', numero: 1, titulo: 'P', descripcion: null, estado: 'aprobado', visible_cliente: true, responsable_cliente: false, fecha_compromiso: null,
    resolucion: null, aprobado_via, aprobado_por_nombre, aprobado_en: '2026-09-25', evidencias: [], notas: [],
  });
  it('lo aprobado en la reunión no muestra el nombre de quien presentaba; lo aprobado por el enlace sí muestra al cliente', () => {
    expect(minutaParaCliente({ ...base, items: [punto('reunion', 'Even Fierro')] }, () => '').items[0].aprobado_por_nombre).toBeNull();
    expect(minutaParaCliente({ ...base, items: [punto('enlace', 'Antonio Pérez')] }, () => '').items[0].aprobado_por_nombre).toBe('Antonio Pérez');
  });
});

describe('mensajeCliente', () => {
  const datos = {
    nombres: ['Antonio'], fecha: '2026-09-24', titulo: 'Inconsistencias del panel de alertas', marca: 'Alba del Bosque',
    resumen: 'Se revisaron las alertas y quedan dos ajustes.', enlace: 'https://tiusdei.qbit.ec/m/abc', codigo: 'K7P2QX',
  };

  it('habla la plataforma, con el resumen, el enlace y el código', () => {
    expect(mensajeCliente(datos)).toBe([
      'Hola Antonio:',
      '',
      'Te enviamos la minuta de la reunión del 24 sep, «Inconsistencias del panel de alertas» (Alba del Bosque).',
      '',
      'En resumen: Se revisaron las alertas y quedan dos ajustes.',
      '',
      'Para revisarla, aprobar puntos o dejar tus comentarios, entra a este enlace:',
      'https://tiusdei.qbit.ec/m/abc',
      'Código de acceso: K7P2QX',
    ].join('\n'));
  });

  it('a varias personas les habla en plural; sin nombres saluda sin nombre; sin resumen no lo menciona', () => {
    const varios = mensajeCliente({ ...datos, nombres: ['Antonio', 'María', 'Luis'] });
    expect(varios).toMatch(/^Hola Antonio, María y Luis:\n\nLes enviamos/);
    expect(varios).toContain('dejar sus comentarios');
    expect(mensajeCliente({ ...datos, nombres: [] })).toMatch(/^Hola:\n\nTe enviamos/);
    expect(mensajeCliente({ ...datos, resumen: '  ' })).not.toContain('En resumen');
  });
});

describe('nombresDeEnvios', () => {
  it('las personas a quienes se les mandó, sin repetir, en el orden en que se agregaron', () => {
    expect(nombresDeEnvios([
      { para: [{ nombre: 'Antonio', email: 'a@x.ec' }, { nombre: 'María', email: 'm@x.ec' }] },
      { para: [] },
      { para: [{ nombre: 'antonio ', email: 'a@x.ec' }, { nombre: 'Luis', email: 'l@x.ec' }] },
    ])).toEqual(['Antonio', 'María', 'Luis']);
  });
});

describe('resumenValido', () => {
  it('acepta español normal con sus signos', () => {
    expect(resumenValido('En la reunión acordamos corregir «mis alertas», revisar las llamadas (entrantes) y el 30% de las fichas; ¿listo? ¡Sí!')).toBe(true);
  });

  it('rechaza la basura que a veces agrega el modelo, llaves, etiquetas y caracteres de control', () => {
    expect(resumenValido('Revisamos el panel.} dake\u{5F154}-vesm} (oops)')).toBe(false);
    expect(resumenValido('Revisamos <b>el panel</b>.')).toBe(false);
    expect(resumenValido('Revisamos\u0007 el panel.')).toBe(false);
    expect(resumenValido('   ')).toBe(false);
    expect(resumenValido('a'.repeat(1501))).toBe(false);
  });
});
