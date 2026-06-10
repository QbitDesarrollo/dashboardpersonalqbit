import fs from 'fs';
import path from 'path';

// Firmas binarias de los únicos formatos de imagen aceptados.
const SIGNATURES: Array<{ ext: string; check: (b: Buffer) => boolean }> = [
  { ext: '.png', check: (b) => b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { ext: '.jpg', check: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: '.gif', check: (b) => b.length >= 6 && b.toString('ascii', 0, 4) === 'GIF8' },
  { ext: '.webp', check: (b) => b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' },
];

/**
 * Verifica que el archivo recién subido sea una imagen REAL leyendo sus magic bytes
 * (el mimetype del multipart lo controla el cliente y no es confiable).
 * - Si es válida: la renombra con la extensión segura del formato detectado
 *   (ignora por completo la extensión del nombre original) y devuelve el basename final.
 * - Si no: borra el archivo y devuelve null.
 */
export function ensureRealImage(filePath: string): string | null {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(16);
    fs.readSync(fd, buf, 0, 16, 0);
    fs.closeSync(fd);
    const hit = SIGNATURES.find((s) => s.check(buf));
    if (!hit) {
      fs.unlinkSync(filePath);
      return null;
    }
    const dir = path.dirname(filePath);
    const safeName = path.basename(filePath).replace(/\.[A-Za-z0-9]+$/, '') + hit.ext;
    const safePath = path.join(dir, safeName);
    if (safePath !== filePath) fs.renameSync(filePath, safePath);
    return safeName;
  } catch {
    try { fs.unlinkSync(filePath); } catch { /* ya no existe */ }
    return null;
  }
}
