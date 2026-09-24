import { describe, it, expect } from 'vitest';
import {
  armarPayload, cambioDeFecha, horasEstimadas, recordables, validarEntregables, valoresDeTarea, valoresNuevos,
  type TareaFormValues,
} from './tareaForm';

const base = (v: Partial<TareaFormValues> = {}): TareaFormValues => ({ ...valoresNuevos({}), ...v });

describe('valoresNuevos', () => {
  it('arranca vacío, con prioridad media, estado pendiente y un tipo de entregable por llenar', () => {
    expect(valoresNuevos({})).toEqual({
      titulo_tarea: '', detalle: '', fecha_cliente: '', brand_id: '', project_id: '', desk_id: '',
      responsable_user_id: '', responsable_ids: [], departamento: '', department_id: '',
      prioridad: 'media', estado: 'backlog', fecha_inicio: '', fecha_entrega: '', cantidad_entregables: 1, enlaces: '',
      task_type_id: '', tipo_entregable_id: '', entregables: [{ tipo_entregable_id: '', cantidad: 1 }],
      estimated_hours: '', recurrence_type: 'none', recurrence_interval: 7, recurrence_end_date: '',
    });
  });

  it('usa la selección recordada y la mesa del filtro gana a la recordada', () => {
    const v = valoresNuevos({
      recordados: { brand_id: 'b2', desk_id: 'd9', departamento: 'x', department_id: 'dep', project_id: 'p1', task_type_id: 'tt', prioridad: 'alta' },
      mesaPorDefecto: 'd1',
    });
    expect(v).toMatchObject({ brand_id: 'b2', desk_id: 'd1', departamento: 'x', department_id: 'dep', project_id: 'p1', task_type_id: 'tt', prioridad: 'alta' });
  });

  it('aplica lo que viene prellenado por encima de lo recordado', () => {
    const v = valoresNuevos({
      recordados: { brand_id: 'b2', project_id: 'p9' },
      prellenado: { brand_id: 'b1', project_id: '', titulo_tarea: 'Filtro por marca', fecha_entrega: '2026-10-01' },
    });
    expect(v).toMatchObject({ brand_id: 'b1', project_id: '', titulo_tarea: 'Filtro por marca', fecha_entrega: '2026-10-01' });
  });
});

describe('valoresDeTarea', () => {
  const tarea = {
    titulo_tarea: 'Carrusel', detalle: null, brand_id: 'b1', desk_id: 'd1', responsable_user_id: 'u3',
    responsables: [{ user_id: 'u3' }, { user_id: 'u4' }], departamento: null, department_id: 'dep', project_id: null,
    prioridad: 'alta' as const, estado: 'en_proceso' as const, fecha_inicio: '2026-09-20T05:00:00.000Z', fecha_entrega: '2026-09-30T05:00:00.000Z',
    fecha_cliente: '2026-10-02', cantidad_entregables: 3, enlaces: ['https://a.com', 'https://b.com'], task_type_id: null,
    tipo_entregable_id: 'dt1', deliverable_types_list: [{ tipo_entregable_id: 'dt1', cantidad: 2 }, { tipo_entregable_id: 'dt2', cantidad: 1 }],
    estimated_hours: 4, recurrence_type: 'weekly', recurrence_interval: null, recurrence_end_date: '2026-12-31T05:00:00.000Z',
  };

  it('lleva la tarea al formulario con fechas cortas, enlaces por línea y sus entregables', () => {
    expect(valoresDeTarea(tarea)).toEqual({
      titulo_tarea: 'Carrusel', detalle: '', brand_id: 'b1', desk_id: 'd1', responsable_user_id: 'u3', responsable_ids: ['u3', 'u4'],
      departamento: '', department_id: 'dep', project_id: '', prioridad: 'alta', estado: 'en_proceso',
      fecha_inicio: '2026-09-20', fecha_entrega: '2026-09-30', fecha_cliente: '2026-10-02', cantidad_entregables: 3,
      enlaces: 'https://a.com\nhttps://b.com', task_type_id: '', tipo_entregable_id: 'dt1',
      entregables: [{ tipo_entregable_id: 'dt1', cantidad: 2 }, { tipo_entregable_id: 'dt2', cantidad: 1 }],
      estimated_hours: '4', recurrence_type: 'weekly', recurrence_interval: 7, recurrence_end_date: '2026-12-31',
    });
  });

  it('usa el tipo de entregable antiguo cuando la tarea no tiene lista', () => {
    const v = valoresDeTarea({ ...tarea, deliverable_types_list: [], responsables: undefined });
    expect(v.entregables).toEqual([{ tipo_entregable_id: 'dt1', cantidad: 3 }]);
    expect(v.responsable_ids).toEqual(['u3']);
  });

  it('sin ningún tipo deja uno por llenar', () => {
    const v = valoresDeTarea({ ...tarea, deliverable_types_list: undefined, tipo_entregable_id: null, estimated_hours: null });
    expect(v.entregables).toEqual([{ tipo_entregable_id: '', cantidad: 1 }]);
    expect(v.estimated_hours).toBe('');
  });
});

describe('validarEntregables', () => {
  it('exige al menos un tipo de entregable', () => {
    expect(validarEntregables([{ tipo_entregable_id: '', cantidad: 1 }])).toEqual({
      titulo: 'Indica el tipo de entregable', descripcion: 'El tipo y el número de entregables son obligatorios.',
    });
  });

  it('exige la cantidad de cada tipo', () => {
    expect(validarEntregables([{ tipo_entregable_id: 'dt1', cantidad: 0 }])).toEqual({
      titulo: 'Indica el número de entregables', descripcion: 'Cada tipo de entregable necesita su cantidad.',
    });
  });

  it('acepta tipos con cantidad e ignora filas vacías', () => {
    expect(validarEntregables([{ tipo_entregable_id: 'dt1', cantidad: 2 }, { tipo_entregable_id: '', cantidad: 1 }])).toBeNull();
  });
});

describe('armarPayload', () => {
  it('convierte vacíos en null, suma entregables, separa enlaces y toma el primer responsable', () => {
    const p = armarPayload(base({
      titulo_tarea: 'Banner', brand_id: 'b1', fecha_entrega: '2026-10-01', responsable_ids: ['u2', 'u3'], responsable_user_id: 'u2',
      entregables: [{ tipo_entregable_id: 'dt1', cantidad: 2 }, { tipo_entregable_id: '', cantidad: 1 }, { tipo_entregable_id: 'dt2', cantidad: 3 }],
      enlaces: 'https://a.com\n\nhttps://b.com', estimated_hours: '4.5',
    }), { conFechaCliente: false });
    expect(p).toEqual({
      titulo_tarea: 'Banner', detalle: null, brand_id: 'b1', desk_id: null, responsable_user_id: 'u2', responsable_ids: ['u2', 'u3'],
      departamento: null, department_id: null, project_id: null, prioridad: 'media', estado: 'backlog', fecha_inicio: null,
      fecha_entrega: '2026-10-01', cantidad_entregables: 5, enlaces: ['https://a.com', 'https://b.com'], task_type_id: null,
      tipo_entregable_id: 'dt1', entregables: [{ tipo_entregable_id: 'dt1', cantidad: 2 }, { tipo_entregable_id: 'dt2', cantidad: 3 }],
      estimated_hours: 4.5, recurrence_type: 'none', recurrence_interval: null, recurrence_end_date: null,
    });
  });

  it('solo manda la fecha del cliente cuando corresponde', () => {
    expect(armarPayload(base({ fecha_cliente: '' }), { conFechaCliente: true })).toHaveProperty('fecha_cliente', null);
    expect(armarPayload(base({ fecha_cliente: '2026-10-03' }), { conFechaCliente: true })).toHaveProperty('fecha_cliente', '2026-10-03');
    expect(armarPayload(base({ fecha_cliente: '2026-10-03' }), { conFechaCliente: false })).not.toHaveProperty('fecha_cliente');
  });

  it('solo manda el intervalo en la recurrencia personalizada', () => {
    expect(armarPayload(base({ recurrence_type: 'custom', recurrence_interval: 10 }), { conFechaCliente: false }).recurrence_interval).toBe(10);
    expect(armarPayload(base({ recurrence_type: 'weekly', recurrence_interval: 10 }), { conFechaCliente: false }).recurrence_interval).toBeNull();
  });
});

describe('cambioDeFecha', () => {
  it('detecta el cambio de fecha de entrega comparando solo el día', () => {
    expect(cambioDeFecha('2026-09-30T05:00:00.000Z', '2026-10-05')).toEqual({ oldFecha: '2026-09-30', newFecha: '2026-10-05' });
    expect(cambioDeFecha('2026-09-30T05:00:00.000Z', '2026-09-30')).toBeNull();
    expect(cambioDeFecha(null, '2026-09-30')).toEqual({ oldFecha: null, newFecha: '2026-09-30' });
  });
});

describe('horasEstimadas', () => {
  const tipos = [{ id: 'dt1', minutos_estimados: null }, { id: 'dt2', minutos_estimados: 90 }, { id: 'dt3', minutos_estimados: 20 }];

  it('suma cantidad × minutos de cada tipo y redondea a cuartos de hora', () => {
    expect(horasEstimadas([{ tipo_entregable_id: 'dt2', cantidad: 2 }, { tipo_entregable_id: 'dt3', cantidad: 1 }], tipos)).toBe(3.25);
  });

  it('no calcula nada si ningún tipo tiene tiempo estándar', () => {
    expect(horasEstimadas([{ tipo_entregable_id: 'dt1', cantidad: 4 }], tipos)).toBeNull();
  });
});

describe('recordables', () => {
  it('guarda solo la selección que conviene repetir en la próxima tarea', () => {
    expect(recordables(base({ titulo_tarea: 'X', brand_id: 'b1', desk_id: 'd1', department_id: 'dep', project_id: 'p1', task_type_id: 'tt', prioridad: 'alta' }))).toEqual({
      brand_id: 'b1', desk_id: 'd1', departamento: '', department_id: 'dep', project_id: 'p1', task_type_id: 'tt', prioridad: 'alta',
    });
  });
});
