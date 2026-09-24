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
