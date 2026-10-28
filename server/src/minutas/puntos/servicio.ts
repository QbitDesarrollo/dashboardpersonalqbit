import type { PoolConnection } from 'mysql2/promise';
import type { z } from 'zod';
import { aplicarAccion, MENSAJE_ULTIMA_EVIDENCIA, puedeQuitarEvidencia, type AccionPunto, type DatosAccion } from '../domain.js';
import { insertarNota } from '../consultas.js';
import { editarItemSchema, esArchivoPropio, esImagenPropia, evidenciaSchema } from '../esquemas.js';
import { ErrorMinuta } from '../servicio.js';
import { enTransaccion } from '../transaccion.js';
import * as repo from './consultas.js';

/** Único mapa de errores del dominio al contrato MCP; la web conserva sus mensajes y su status 422. */
function errorAccion(mensaje: string): ErrorMinuta {
  if (mensaje === 'Falta al menos una evidencia.') return new ErrorMinuta(422, mensaje, 'TIUSDEI_EVIDENCE_REQUIRED');
  if (mensaje === 'Explica qué se hizo (mínimo 10 caracteres).' || mensaje.startsWith('Indica ')) {
    return new ErrorMinuta(400, mensaje, 'TIUSDEI_VALIDATION');
  }
  return new ErrorMinuta(422, mensaje, 'TIUSDEI_INVALID_STATE');
}

export async function exigirPunto(conn: PoolConnection, id: string) {
  const item = await repo.cargarPunto(conn, id);
  if (!item) throw new ErrorMinuta(404, 'Punto no encontrado', 'TIUSDEI_NOT_FOUND');
  return item;
}

/** La misma transición y rastro para la interfaz y el MCP, dentro de la transacción del llamador. */
export async function accionarPunto(conn: PoolConnection, id: string, accion: string, datos: DatosAccion, userId: string) {
  const item = await exigirPunto(conn, id);
  const r = aplicarAccion({ estado: item.estado, responsableCliente: !!item.responsable_cliente, evidencias: Number(item.evidencias) }, accion as AccionPunto, datos);
  if (!r.ok) throw errorAccion(r.error);
  await repo.guardarAccion(conn, id, r.estado, accion, datos, userId);
  if (accion === 'pedir_ajuste') await insertarNota(id, 'ajuste', datos.motivo!.trim(), { userId }, conn);
  return item.minuta_id;
}

/** Las dos superficies comparten la exclusión cliente/equipo. MCP además exige un responsable activo interno. */
export async function editarPunto(conn: PoolConnection, id: string, cambios: z.infer<typeof editarItemSchema>, validarResponsable = false) {
  const item = await exigirPunto(conn, id);
  const b = { ...cambios };
  if (b.responsable_cliente === true) b.responsable_user_id = null;
  else if (b.responsable_user_id) b.responsable_cliente = false;
  if (validarResponsable && b.responsable_user_id && !await repo.responsableValido(conn, b.responsable_user_id)) {
    throw new ErrorMinuta(400, 'El responsable debe ser una persona activa del equipo.', 'TIUSDEI_INVALID_ASSIGNEE');
  }
  await repo.guardarEdicion(conn, id, b);
  return item.minuta_id;
}

export async function adjuntarEvidencia(conn: PoolConnection, id: string, datos: z.infer<typeof evidenciaSchema>, userId: string, evidenciaId?: string) {
  const e = evidenciaSchema.safeParse(datos);
  if (!e.success) throw new ErrorMinuta(400, 'Evidencia inválida', 'TIUSDEI_VALIDATION');
  if (e.data.tipo === 'imagen' && !esImagenPropia(e.data.url)) throw new ErrorMinuta(400, 'La imagen debe subirse a Tiusdei.', 'TIUSDEI_VALIDATION');
  if (e.data.tipo === 'archivo' && !esArchivoPropio(e.data.url)) throw new ErrorMinuta(400, 'El PDF debe subirse a Tiusdei.', 'TIUSDEI_VALIDATION');
  const item = await exigirPunto(conn, id);
  const evidenceId = await repo.insertarEvidencia(conn, id, e.data, userId, evidenciaId);
  return { minutaId: item.minuta_id, evidenceId };
}

export async function reordenarEnTransaccion(conn: PoolConnection, id: string, nuevo: string[]) {
  const actuales = await repo.cargarOrden(conn, id);
  if (!actuales) throw new ErrorMinuta(404, 'Minuta no encontrada', 'TIUSDEI_NOT_FOUND');
  const conjunto = new Set(actuales);
  if (nuevo.length !== conjunto.size || new Set(nuevo).size !== nuevo.length || !nuevo.every((i) => conjunto.has(i))) {
    throw new ErrorMinuta(400, 'La lista de puntos no coincide con la minuta.', 'TIUSDEI_VALIDATION');
  }
  await repo.guardarOrden(conn, id, nuevo);
}

export const reordenarPuntos = (id: string, nuevo: string[]) => enTransaccion((conn) => reordenarEnTransaccion(conn, id, nuevo));

/** Quitar evidencia: misma regla para la interfaz y el MCP, dentro de la transacción del llamador. */
export async function quitarEvidenciaEnTransaccion(conn: PoolConnection, evidenciaId: string) {
  const ev = await repo.evidenciaPorId(conn, evidenciaId);
  if (!ev) throw new ErrorMinuta(404, 'Evidencia no encontrada', 'TIUSDEI_NOT_FOUND');
  const item = await exigirPunto(conn, ev.item_id);
  if (!puedeQuitarEvidencia(item.estado, Number(item.evidencias))) {
    throw new ErrorMinuta(422, MENSAJE_ULTIMA_EVIDENCIA, 'TIUSDEI_EVIDENCE_REQUIRED');
  }
  await repo.borrarEvidencia(conn, evidenciaId);
  return item.minuta_id;
}

export const quitarEvidencia = (evidenciaId: string) => enTransaccion((conn) => quitarEvidenciaEnTransaccion(conn, evidenciaId));
