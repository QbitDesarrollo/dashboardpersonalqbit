import fs from 'fs/promises';
import path from 'path';
import { uuid } from '../db/mysql.js';
import { ensureRealImage } from '../utils/imageSafety.js';
import { ErrorMinuta } from './servicio.js';
import { formatoEvidencia } from './domain.js';

export const MAX_EVIDENCIA = 10 * 1024 * 1024;
export const directorioEditor = () => path.join(process.cwd(), 'uploads', 'editor');
const directorioPendientes = () => path.join(directorioEditor(), '.pendientes');

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
  const destino = path.join(directorioEditor(), archivo);
  await fs.writeFile(destino, bytes, { flag: 'wx' });
  if (ext !== 'pdf' && !ensureRealImage(destino)) throw new ErrorMinuta(400, 'Imagen inválida', 'TIUSDEI_UNSUPPORTED_FILE');
  const base = (process.env.FRONTEND_URL || 'https://tiusdei.qbit.ec').replace(/\/$/, '');
  const registro: ArchivoPendiente = { id, archivo, url: `${base}/uploads/editor/${archivo}`, type: ext === 'pdf' ? 'archivo' : 'imagen', name, userId };
  // El archivo oculto conserva nombre y dueño sin exponer metadatos por express.static.
  await fs.writeFile(path.join(directorioPendientes(), `${id}.json`), JSON.stringify(registro), { flag: 'wx' });
  return registro;
}

export async function leerPendiente(id: string): Promise<ArchivoPendiente> {
  if (!/^[a-f0-9-]{36}$/i.test(id)) throw new ErrorMinuta(400, 'evidenceId inválido', 'TIUSDEI_VALIDATION');
  try {
    const datos = JSON.parse(await fs.readFile(path.join(directorioPendientes(), `${id}.json`), 'utf8')) as ArchivoPendiente;
    await fs.access(path.join(directorioEditor(), datos.archivo));
    return datos;
  } catch { throw new ErrorMinuta(404, 'Evidencia no encontrada', 'TIUSDEI_NOT_FOUND'); }
}
