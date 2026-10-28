import { ESTADOS_CERRADOS, exigirDepartamento, validarArchivo, validarEliminacion, siguienteTrasArchivo, type DepartamentoArchivo, type Referencias } from './dominio.js';
import * as SQL from './consultas.js';

export interface Ejecutor {
  query<T>(sql: string, params?: unknown[]): Promise<T>;
}
export type ConTransaccion = <T>(trabajo: (tx: Ejecutor) => Promise<T>) => Promise<T>;
interface Cambio { affectedRows: number }
interface Tarea { id: string; responsable_user_id: string | null }

export function crearServicioArchivo(conTransaccion: ConTransaccion, uuid: () => string) {
  async function departamentos(tx: Ejecutor, id: string) {
    const filas = await tx.query<DepartamentoArchivo[]>(SQL.BLOQUEAR_DEPARTAMENTOS);
    const origen = filas.find(d => d.id === id) ?? null;
    exigirDepartamento(origen);
    return { filas, origen };
  }

  async function contarReferencias(tx: Ejecutor, id: string): Promise<Referencias> {
    const referencias: Referencias = { tareas: 0, historial: 0, traspasos: 0, plantillas: 0, personas: 0, mesas: 0, etapas: 0 };
    for (const clave of Object.keys(SQL.REFERENCIAS) as (keyof Referencias)[]) {
      const filas = await tx.query<{ id: string }[]>(SQL.REFERENCIAS[clave], clave === 'traspasos' ? [id, id] : [id]);
      referencias[clave] = filas.length;
    }
    return referencias;
  }

  return {
    archivar: (id: string, destinoId: string | null) => conTransaccion(async tx => {
      const { filas, origen } = await departamentos(tx, id);
      validarArchivo(origen, destinoId, filas.find(d => d.id === destinoId) ?? null);
      const tareas = await tx.query<Tarea[]>(SQL.TAREAS_ABIERTAS, [id, ...ESTADOS_CERRADOS]);
      for (const tarea of tareas) {
        await tx.query(SQL.MOVER_TAREA, [destinoId, tarea.id]);
        // Misma semántica de PATCH /tasks: cerrar el tramo previo y abrir solo si hay destino.
        await tx.query(SQL.CERRAR_HISTORIAL, [tarea.id]);
        if (destinoId) await tx.query(SQL.ABRIR_HISTORIAL, [uuid(), tarea.id, destinoId, tarea.responsable_user_id]);
      }
      const personas = await tx.query<Cambio>(SQL.MOVER_PERSONAS, [destinoId, id]);
      const mesas = await tx.query<Cambio>(SQL.MOVER_MESAS, [destinoId, id]);
      const etapas = await tx.query<{ id: string }[]>(SQL.ETAPAS_ENTRANTES, [id]);
      for (const etapa of etapas) {
        await tx.query(SQL.REENCADENAR_ETAPA, [siguienteTrasArchivo(etapa.id, origen.next_department_id, id), etapa.id]);
      }
      await tx.query(SQL.ARCHIVAR, [id]);
      return { tareas: tareas.length, personas: personas.affectedRows, mesas: mesas.affectedRows, etapas: etapas.length };
    }),
    restaurar: (id: string) => conTransaccion(async tx => {
      await departamentos(tx, id);
      await tx.query(SQL.RESTAURAR, [id]);
      return { ok: true };
    }),
    referencias: (id: string) => conTransaccion(async tx => {
      await departamentos(tx, id);
      return contarReferencias(tx, id);
    }),
    eliminar: (id: string, confirmacion: string) => conTransaccion(async tx => {
      const { origen } = await departamentos(tx, id);
      const vacias: Referencias = { tareas: 0, historial: 0, traspasos: 0, plantillas: 0, personas: 0, mesas: 0, etapas: 0 };
      validarEliminacion(origen, confirmacion, vacias);
      const referencias = await contarReferencias(tx, id);
      validarEliminacion(origen, confirmacion, referencias);
      await tx.query(SQL.ELIMINAR, [id]);
      return { ok: true };
    }),
  };
}
