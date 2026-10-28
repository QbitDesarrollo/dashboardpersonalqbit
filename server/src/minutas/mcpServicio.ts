import type { z } from 'zod';
import { moverPunto } from './domain.js';
import { cargarDetalle, insertarNota } from './consultas.js';
import { guardarEvidencia, leerPendiente, quitarArchivoPendiente } from './archivos.js';
import type { cerrarMcpSchema, editarMcpSchema, subirEvidenciaMcpSchema } from './esquemas.js';
import { minutaParaAgente } from './formatoMcp.js';
import { ErrorMinuta } from './servicio.js';
import { enTransaccion } from './transaccion.js';
import { accionarPunto, adjuntarEvidencia, editarPunto, exigirPunto, reordenarEnTransaccion } from './puntos/servicio.js';
import { cargarOrden, evidenciaPorId } from './puntos/consultas.js';

const frontend = () => process.env.FRONTEND_URL || 'https://tiusdei.qbit.ec';
async function puntoParaAgente(minutaId: string, pointId: string) {
  const detalle = await cargarDetalle(minutaId);
  return minutaParaAgente(detalle!, frontend()).points.find((p: { id: string }) => p.id === pointId)!;
}

export async function subirEvidencia(b: z.infer<typeof subirEvidenciaMcpSchema>, userId: string) {
  // No se escribe un archivo si el destino no existe.
  if (b.pointId) await enTransaccion((conn) => exigirPunto(conn, b.pointId!));
  const archivo = await guardarEvidencia(b.fileBase64, b.fileName, b.mimeType, userId);
  try {
    if (b.pointId) await enTransaccion((conn) => adjuntarEvidencia(conn, b.pointId!, {
      tipo: archivo.type, nombre: archivo.name, url: archivo.url,
    }, userId, archivo.id));
  } catch (e) {
    await quitarArchivoPendiente(archivo);
    throw e;
  }
  return { evidenceId: archivo.id, url: archivo.url, type: archivo.type, name: archivo.name, pointId: b.pointId ?? null };
}

export async function cerrarPuntoMcp(id: string, b: z.infer<typeof cerrarMcpSchema>, userId: string) {
  const minutaId = await enTransaccion(async (conn) => {
    await exigirPunto(conn, id);
    for (const e of b.evidence) {
      if ('evidenceId' in e) {
        const vinculada = await evidenciaPorId(conn, e.evidenceId);
        if (vinculada) {
          if (vinculada.item_id !== id) throw new ErrorMinuta(400, 'La evidencia pertenece a otro punto.', 'TIUSDEI_VALIDATION');
          continue;
        }
        const archivo = await leerPendiente(e.evidenceId, userId);
        await adjuntarEvidencia(conn, id, { tipo: archivo.type, nombre: archivo.name, url: archivo.url }, userId, archivo.id);
      } else {
        const drive = 'driveFileId' in e;
        const url = e.url ?? (drive ? `https://drive.google.com/file/d/${encodeURIComponent(e.driveFileId)}/view` : '');
        await adjuntarEvidencia(conn, id, {
          tipo: drive ? 'drive' : 'enlace', nombre: e.name ?? (drive ? e.driveFileId : url), url,
          drive_file_id: drive ? e.driveFileId : null,
        }, userId);
      }
    }
    const minuta = await accionarPunto(conn, id, 'completar', { resolucion: b.whatWasDone }, userId);
    await insertarNota(id, 'nota', 'Cerrado vía MCP', { userId, via: 'mcp' }, conn);
    return minuta;
  }).catch((e: unknown) => {
    // Dos cierres pueden competir por el mismo id antes de que exista su fila.
    if (e && typeof e === 'object' && 'code' in e && ['ER_DUP_ENTRY', 'ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(String(e.code))) {
      throw new ErrorMinuta(400, 'La evidencia ya está en uso; vuelve a consultar el punto.', 'TIUSDEI_VALIDATION');
    }
    throw e;
  });
  return puntoParaAgente(minutaId, id);
}

export async function reabrirPuntoMcp(id: string, reason: string, userId: string) {
  const minutaId = await enTransaccion(async (conn) => {
    const minuta = await accionarPunto(conn, id, 'reabrir', {}, userId);
    await insertarNota(id, 'nota', `Reabierto vía MCP: ${reason}`, { userId, via: 'mcp' }, conn);
    return minuta;
  });
  return puntoParaAgente(minutaId, id);
}

export async function editarPuntoMcp(id: string, b: z.infer<typeof editarMcpSchema>) {
  const minutaId = await enTransaccion(async (conn) => {
    const minuta = await editarPunto(conn, id, {
      titulo: b.title, descripcion: b.description, responsable_user_id: b.assigneeId,
      responsable_cliente: b.client, fecha_compromiso: b.dueDate,
    }, true);
    if (b.position !== undefined) {
      const actuales = (await cargarOrden(conn, minuta))!;
      await reordenarEnTransaccion(conn, minuta, moverPunto(actuales, id, b.position));
    }
    return minuta;
  });
  return puntoParaAgente(minutaId, id);
}
