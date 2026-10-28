/** Magic bytes y MIME deben coincidir; el nombre original nunca determina la extensión. */
export function formatoEvidencia(bytes: Buffer, mime: string): 'png' | 'jpg' | 'webp' | 'pdf' | null {
  if (mime === 'image/png' && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return 'png';
  if (mime === 'image/jpeg' && bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'jpg';
  if (mime === 'image/webp' && bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (mime === 'application/pdf' && bytes.toString('ascii', 0, 5) === '%PDF-') return 'pdf';
  return null;
}

/** Posición desde uno; más allá del final equivale a la última posición. */
export function moverPunto(actuales: string[], id: string, posicion: number): string[] {
  const nuevo = actuales.filter((p) => p !== id);
  nuevo.splice(Math.min(posicion, actuales.length) - 1, 0, id);
  return nuevo;
}

export type EstadoPunto = 'pendiente' | 'en_curso' | 'completado' | 'aprobado' | 'descartado';
export type AccionPunto = 'iniciar' | 'completar' | 'aprobar' | 'reabrir' | 'descartar' | 'restaurar' | 'pedir_ajuste';

export interface PuntoParaAccion {
  estado: EstadoPunto;
  responsableCliente: boolean;
  evidencias: number;
}

export interface DatosAccion {
  resolucion?: string;
  motivo?: string;
}

export type ResultadoAccion = { ok: true; estado: EstadoPunto } | { ok: false; error: string };

const ETIQUETA: Record<EstadoPunto, string> = {
  pendiente: 'pendiente',
  en_curso: 'en curso',
  completado: 'completado',
  aprobado: 'aprobado',
  descartado: 'descartado',
};

// Desde qué estados se puede aplicar cada acción y a qué estado lleva.
const TRANSICIONES: Record<AccionPunto, { desde: EstadoPunto[]; hacia: EstadoPunto }> = {
  iniciar: { desde: ['pendiente', 'en_curso'], hacia: 'en_curso' },
  completar: { desde: ['pendiente', 'en_curso'], hacia: 'completado' },
  aprobar: { desde: ['completado'], hacia: 'aprobado' },
  reabrir: { desde: ['completado'], hacia: 'en_curso' },
  descartar: { desde: ['pendiente', 'en_curso', 'completado'], hacia: 'descartado' },
  restaurar: { desde: ['descartado'], hacia: 'pendiente' },
  pedir_ajuste: { desde: ['completado'], hacia: 'en_curso' },
};

// Cómo se nombra cada acción en los mensajes de error.
const VERBO: Record<AccionPunto, string> = {
  iniciar: 'iniciar',
  completar: 'completar',
  aprobar: 'aprobar',
  reabrir: 'reabrir',
  descartar: 'descartar',
  restaurar: 'restaurar',
  pedir_ajuste: 'pedir un ajuste de',
};

/** Avance de una minuta. Los puntos descartados no cuentan. */
export function progreso(estados: EstadoPunto[]): { total: number; cerrados: number; enCurso: number } {
  const vigentes = estados.filter((e) => e !== 'descartado');
  return {
    total: vigentes.length,
    cerrados: vigentes.filter((e) => e === 'completado' || e === 'aprobado').length,
    enCurso: vigentes.filter((e) => e === 'en_curso').length,
  };
}

export function aplicarAccion(punto: PuntoParaAccion, accion: AccionPunto, datos: DatosAccion = {}): ResultadoAccion {
  const t = Object.hasOwn(TRANSICIONES, accion) ? TRANSICIONES[accion] : undefined;
  if (!t) return { ok: false, error: 'Acción desconocida.' };
  if (!t.desde.includes(punto.estado)) {
    return { ok: false, error: `No se puede ${VERBO[accion]} un punto ${ETIQUETA[punto.estado]}.` };
  }
  if (accion === 'completar') {
    if (punto.evidencias < 1) return { ok: false, error: 'Falta al menos una evidencia.' };
    if (!punto.responsableCliente && (datos.resolucion ?? '').trim().length < 10) {
      return { ok: false, error: 'Explica qué se hizo (mínimo 10 caracteres).' };
    }
  }
  if (accion === 'descartar' && !(datos.motivo ?? '').trim()) {
    return { ok: false, error: 'Indica por qué se descarta el punto.' };
  }
  if (accion === 'pedir_ajuste' && !(datos.motivo ?? '').trim()) {
    return { ok: false, error: 'Indica qué ajuste pidió el cliente.' };
  }
  return { ok: true, estado: t.hacia };
}
