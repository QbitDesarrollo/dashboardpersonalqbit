import fs from 'fs/promises';
import path from 'path';
import { uuid } from '../db/mysql.js';
import { ensureRealImage } from '../utils/imageSafety.js';
import { ErrorMinuta } from './servicio.js';
import { formatoEvidencia } from './domain.js';

export const MAX_EVIDENCIA = 10 * 1024 * 1024;
export const directorioEditor = () => path.join(process.cwd(), 'uploads', 'editor');
export const directorioPendientes = () => path.join(process.cwd(), 'uploads-privado', 'evidencias-pendientes');

export interface ArchivoPendiente { id: string; url: string; type: 'imagen' | 'archivo'; name: string; userId: string; archivo: string }

export async function guardarEvidencia(base64: string, name: string, mime: string, userId: string): Promise<ArchivoPendiente> {
  if (base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
    throw new ErrorMinuta(400, 'Base64 inválido', 'TIUSDEI_VALIDATION');
  }
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length > MAX_EVIDENCIA) throw new ErrorMinuta(413, 'El archivo pesa más de 10 MB.', 'TIUSDEI_FILE_TOO_LARGE');
  const ext = formatoEvidencia(bytes, mime);
  if (!ext) throw new ErrorMinuta(400, 'Solo PNG, JPEG, WEBP o PDF con contenido válido.', 'TIUSDEI_UNSUPPORTED_FILE');
  const id = uuid();
  const archivo = `${id}.${ext}`;
  await fs.mkdir(directorioPendientes(), { recursive: true });
  await fs.mkdir(directorioEditor(), { recursive: true });
  const destino = path.join(directorioEditor(), archivo);
  const base = (process.env.FRONTEND_URL || 'https://tiusdei.qbit.ec').replace(/\/$/, '');
  const registro: ArchivoPendiente = { id, archivo, url: `${base}/uploads/editor/${archivo}`, type: ext === 'pdf' ? 'archivo' : 'imagen', name, userId };
  try {
    await fs.writeFile(destino, bytes, { flag: 'wx' });
    if (ext !== 'pdf' && !ensureRealImage(destino)) throw new ErrorMinuta(400, 'Imagen inválida', 'TIUSDEI_UNSUPPORTED_FILE');
    // Fuera de uploads: estos metadatos nunca pertenecen al árbol público.
    await fs.writeFile(path.join(directorioPendientes(), `${id}.json`), JSON.stringify(registro), { flag: 'wx' });
    return registro;
  } catch (e) {
    await quitarArchivoPendiente(registro);
    throw e;
  }
}

export async function quitarArchivoPendiente(archivo: ArchivoPendiente): Promise<void> {
  for (const destino of [path.join(directorioEditor(), archivo.archivo), path.join(directorioPendientes(), `${archivo.id}.json`)]) {
    await fs.unlink(destino).catch((e: NodeJS.ErrnoException) => { if (e.code !== 'ENOENT') throw e; });
  }
}

/** Solo el dueño del token que subió el archivo puede adjuntarlo; otro dueño recibe VALIDATION. */
export async function leerPendiente(id: string, userId: string): Promise<ArchivoPendiente> {
  if (!/^[a-f0-9-]{36}$/i.test(id)) throw new ErrorMinuta(400, 'evidenceId inválido', 'TIUSDEI_VALIDATION');
  let datos: ArchivoPendiente;
  try {
    datos = JSON.parse(await fs.readFile(path.join(directorioPendientes(), `${id}.json`), 'utf8')) as ArchivoPendiente;
    await fs.access(path.join(directorioEditor(), datos.archivo));
  } catch { throw new ErrorMinuta(404, 'Evidencia no encontrada', 'TIUSDEI_NOT_FOUND'); }
  if (datos.userId !== userId) throw new ErrorMinuta(400, 'Solo quien subió la evidencia pendiente puede adjuntarla.', 'TIUSDEI_VALIDATION');
  return datos;
}
