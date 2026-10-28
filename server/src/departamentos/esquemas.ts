import { z } from 'zod';

export const archivarSchema = z.object({ destino_id: z.string().uuid().nullable() }).strict();
export const eliminarSchema = z.object({ confirmacion: z.string() }).strict();
