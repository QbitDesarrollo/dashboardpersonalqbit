import type { TareaFormValues } from './tareaForm';

const escapar = (texto: string) => texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const parrafo = (texto: string) => `<p>${escapar(texto).split('\n').join('<br>')}</p>`;

/**
 * Starting values of a task created from a minuta point. The detail is HTML because
 * the task form edits it as rich text; it ends with where the task came from.
 * The desk is left empty on purpose: the last one used may not serve this brand.
 */
export function prellenadoDesdePunto(
  minuta: { brand_id: string; brand_nombre: string; project_id: string | null; codigo: string; numero: number },
  punto: { numero: number; titulo: string; descripcion: string | null; fecha_compromiso: string | null },
): Partial<TareaFormValues> {
  const origen = `Origen: ${minuta.brand_nombre} ${minuta.codigo}, punto ${minuta.numero}.${punto.numero}.`;
  return {
    brand_id: minuta.brand_id,
    project_id: minuta.project_id ?? '',
    desk_id: '',
    titulo_tarea: punto.titulo,
    fecha_entrega: punto.fecha_compromiso ?? '',
    detalle: [punto.descripcion, origen].filter(Boolean).map((t) => parrafo(t as string)).join(''),
  };
}
