import { z } from 'zod';

/** Validación de lo que llega a la API de minutas. */
export const fechaIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD)');

export const itemSchema = z.object({
  titulo: z.string().trim().min(1).max(300),
  descripcion: z.string().max(10000).nullish(),
  responsable_user_id: z.string().uuid().nullish(),
  responsable_cliente: z.boolean().optional(),
  fecha_compromiso: fechaIso.nullish(),
});

export const crearSchema = z.object({
  brand_id: z.string().uuid(),
  project_id: z.string().uuid().nullish(),
  fecha: fechaIso,
  titulo: z.string().trim().min(1).max(200),
  owner_user_id: z.string().uuid().optional(),
  miembros: z.array(z.string().uuid()).max(50).optional(),
  resumen: z.string().max(20000).nullish(),
  estado: z.enum(['borrador', 'publicada']).optional(),
  items: z.array(itemSchema).max(100).optional(),
});

export const editarSchema = z.object({
  titulo: z.string().trim().min(1).max(200).optional(),
  fecha: fechaIso.optional(),
  project_id: z.string().uuid().nullable().optional(),
  miembros: z.array(z.string().uuid()).max(50).optional(),
  owner_user_id: z.string().uuid().optional(),
  resumen: z.string().max(20000).nullable().optional(),
  estado: z.enum(['borrador', 'publicada']).optional(),
});

export const editarItemSchema = z.object({
  titulo: z.string().trim().min(1).max(300).optional(),
  descripcion: z.string().max(10000).nullable().optional(),
  responsable_user_id: z.string().uuid().nullable().optional(),
  responsable_cliente: z.boolean().optional(),
  fecha_compromiso: fechaIso.nullable().optional(),
  visible_cliente: z.boolean().optional(),
});

// Capturas y PDF se guardan en el editor; enlaces y Drive conservan su URL.
export const evidenciaSchema = z.object({
  tipo: z.enum(['enlace', 'drive', 'imagen', 'archivo']),
  nombre: z.string().trim().min(1).max(500),
  url: z.string().max(1000).regex(/^https?:\/\/\S+$/i, 'La URL debe empezar con http:// o https://'),
  drive_file_id: z.string().max(255).nullish(),
});

export const subirEvidenciaMcpSchema = z.object({
  fileBase64: z.string().min(1),
  fileName: z.string().trim().min(1).max(500),
  mimeType: z.string().min(1),
  pointId: z.string().uuid().optional(),
});
export const evidenciaMcpSchema = z.union([
  z.object({ evidenceId: z.string().uuid() }).strict(),
  z.object({ driveFileId: z.string().min(1).max(255), name: z.string().trim().min(1).max(500).optional(), url: evidenciaSchema.shape.url.optional() }).strict(),
  z.object({ url: evidenciaSchema.shape.url, name: z.string().trim().min(1).max(500).optional() }).strict(),
]);
export const cerrarMcpSchema = z.object({
  whatWasDone: z.string().trim().max(10000),
  evidence: z.array(evidenciaMcpSchema).max(100).default([]),
});
export const quitarEvidenciaMcpSchema = z.object({
  name: z.string().trim().min(1).max(500).optional(),
  url: z.string().trim().min(1).max(1000).optional(),
}).strict().refine((b) => !!b.name || !!b.url, { message: 'Indica name o url de la evidencia.' });
export const reabrirMcpSchema = z.object({ reason: z.string().trim().min(3).max(2000) });
export const editarMcpSchema = z.object({
  title: editarItemSchema.shape.titulo,
  description: editarItemSchema.shape.descripcion,
  assigneeId: editarItemSchema.shape.responsable_user_id,
  client: editarItemSchema.shape.responsable_cliente,
  dueDate: editarItemSchema.shape.fecha_compromiso,
  position: z.number().int().min(1).optional(),
}).strict();

export const accionSchema = z.object({
  accion: z.string().min(1).max(40),
  resolucion: z.string().max(10000).optional(),
  motivo: z.string().max(2000).optional(),
});

/**
 * Una imagen de evidencia tiene que haberse subido a Tiusdei (/uploads/editor/...).
 * Si no, la página pública mostraría imágenes de terceros (p. ej. píxeles de rastreo).
 */
export function esArchivoPropio(url: string): boolean {
  try {
    const u = new URL(url);
    const propio = new URL(process.env.FRONTEND_URL || 'https://tiusdei.qbit.ec');
    return u.origin === propio.origin && /^\/uploads\/editor\/[A-Za-z0-9-]+\.pdf$/.test(u.pathname);
  } catch { return false; }
}

export function esImagenPropia(url: string): boolean {
  try {
    const u = new URL(url);
    const propio = new URL(process.env.FRONTEND_URL || 'https://tiusdei.qbit.ec');
    return u.host === propio.host && /^\/uploads\/editor\/[A-Za-z0-9-]+\.(png|jpg|gif|webp)$/.test(u.pathname);
  } catch {
    return false;
  }
}
