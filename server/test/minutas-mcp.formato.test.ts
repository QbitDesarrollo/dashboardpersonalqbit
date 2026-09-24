import { describe, it, expect } from 'vitest';
import { etiquetaEstadoPunto, horaEcuador, minutaParaAgente, resumenParaAgente } from '../src/minutas/formatoMcp.js';

describe('horaEcuador', () => {
  it('muestra un instante UTC en hora de Guayaquil', () => {
    expect(horaEcuador(new Date('2026-09-24T15:07:00Z'))).toBe('2026-09-24 10:07');
    expect(horaEcuador('2026-09-24T03:30:00.000Z')).toBe('2026-09-23 22:30');
    expect(horaEcuador(null)).toBeNull();
  });
});

describe('etiquetaEstadoPunto', () => {
  it('nombra el estado como en la pantalla, distinguiendo lo que espera al cliente', () => {
    expect(etiquetaEstadoPunto('pendiente', false)).toBe('Pendiente');
    expect(etiquetaEstadoPunto('pendiente', true)).toBe('Esperando al cliente');
    expect(etiquetaEstadoPunto('en_curso', false)).toBe('En curso');
    expect(etiquetaEstadoPunto('completado', false)).toBe('Completado');
    expect(etiquetaEstadoPunto('completado', true)).toBe('Recibido');
    expect(etiquetaEstadoPunto('aprobado', false)).toBe('Aprobado por el cliente');
    expect(etiquetaEstadoPunto('descartado', false)).toBe('Descartado');
  });
});

const detalle = {
  id: 'm1', brand_id: 'b1', brand_nombre: 'Alba del Bosque', project_id: 'p1', project_nombre: 'Portal', numero: 1, codigo: 'M-01',
  titulo: 'Revisión', fecha: '2026-09-24', resumen: 'Acuerdos.', enlaces: [], estado: 'publicada',
  owner: { id: 'u1', nombre: 'Even Fierro', avatar_url: null }, miembros: [{ id: 'u2', nombre: 'Diego Ruiz', avatar_url: null }],
  progreso: { total: 2, cerrados: 1, enCurso: 0 },
  items: [
    {
      id: 'i1', numero: 1, titulo: 'Video en el home', descripcion: 'Sin sonido.', responsable: { id: 'u2', nombre: 'Diego Ruiz', avatar_url: null },
      responsable_cliente: false, fecha_compromiso: '2026-09-30', estado: 'completado', visible_cliente: true,
      resolucion: 'Se subió a staging.', completado_por: { id: 'u2', nombre: 'Diego Ruiz' }, completado_en: new Date('2026-09-25T20:00:00Z'),
      aprobado_via: null, aprobado_por_nombre: null, aprobado_en: null, motivo_descarte: null,
      evidencias: [
        { id: 'e1', tipo: 'imagen', nombre: 'home.png', url: 'https://tiusdei.qbit.ec/uploads/editor/abc.png', drive_file_id: null, origen_task_id: null },
        { id: 'e2', tipo: 'drive', nombre: 'Video.mp4', url: 'https://drive.google.com/x', drive_file_id: 'x', origen_task_id: null },
      ],
      tareas: [{ id: 't1', titulo_tarea: 'Editar video', estado: 'en_proceso', fecha_entrega: '2026-09-28', responsable: { id: 'u2', nombre: 'Diego Ruiz', avatar_url: null } }],
      notas: [{ id: 'n1', tipo: 'ajuste', texto: 'Más corto.', created_at: new Date('2026-09-26T14:00:00Z'), autor: { id: 'u1', nombre: 'Even Fierro' } }],
    },
    {
      id: 'i2', numero: 2, titulo: 'Fichas técnicas', descripcion: null, responsable: null, responsable_cliente: true,
      fecha_compromiso: null, estado: 'pendiente', visible_cliente: false, resolucion: null, completado_por: null, completado_en: null,
      aprobado_via: null, aprobado_por_nombre: null, aprobado_en: null, motivo_descarte: null, evidencias: [], tareas: [], notas: [],
    },
  ],
};

describe('minutaParaAgente', () => {
  it('entrega la minuta completa, legible y con horas de Ecuador', () => {
    expect(minutaParaAgente(detalle, 'https://tiusdei.qbit.ec')).toEqual({
      id: 'm1', code: 'M-01', brand: 'Alba del Bosque', project: 'Portal', title: 'Revisión', date: '2026-09-24', status: 'Publicada',
      owner: 'Even Fierro', members: ['Diego Ruiz'], summary: 'Acuerdos.', progress: { total: 2, closed: 1, inProgress: 0 },
      url: 'https://tiusdei.qbit.ec/minutas/m1', timezone: 'America/Guayaquil',
      points: [
        {
          id: 'i1', code: '1.1', title: 'Video en el home', description: 'Sin sonido.', status: 'Completado', assignee: 'Diego Ruiz',
          dueDate: '2026-09-30', visibleToClient: true, whatWasDone: 'Se subió a staging.', closedBy: 'Diego Ruiz', closedAt: '2026-09-25 15:00',
          approvedAt: null, discardReason: null,
          evidence: [{ type: 'imagen', name: 'home.png', url: 'https://tiusdei.qbit.ec/uploads/editor/abc.png' }, { type: 'drive', name: 'Video.mp4', url: 'https://drive.google.com/x' }],
          tasks: [{ id: 't1', title: 'Editar video', status: 'En proceso', dueDate: '2026-09-28', assignee: 'Diego Ruiz' }],
          notes: [{ type: 'ajuste', text: 'Más corto.', at: '2026-09-26 09:00', author: 'Even Fierro' }],
        },
        {
          id: 'i2', code: '1.2', title: 'Fichas técnicas', description: null, status: 'Esperando al cliente', assignee: 'Cliente',
          dueDate: null, visibleToClient: false, whatWasDone: null, closedBy: null, closedAt: null, approvedAt: null, discardReason: null,
          evidence: [], tasks: [], notes: [],
        },
      ],
    });
  });
});

describe('resumenParaAgente', () => {
  it('resume una minuta de la lista', () => {
    const fila = {
      id: 'm1', brand_id: 'b1', brand_nombre: 'Alba del Bosque', project_id: null, project_nombre: null, numero: 3, codigo: 'M-03',
      titulo: 'Kickoff', fecha: '2026-09-20', estado: 'borrador', owner: { id: 'u1', nombre: 'Even Fierro', avatar_url: null },
      progreso: { total: 5, cerrados: 2, enCurso: 1 },
    };
    expect(resumenParaAgente(fila, 'https://tiusdei.qbit.ec')).toEqual({
      id: 'm1', code: 'M-03', brand: 'Alba del Bosque', project: null, title: 'Kickoff', date: '2026-09-20', status: 'Borrador',
      owner: 'Even Fierro', progress: { total: 5, closed: 2, inProgress: 1 }, url: 'https://tiusdei.qbit.ec/minutas/m1',
    });
  });
});
