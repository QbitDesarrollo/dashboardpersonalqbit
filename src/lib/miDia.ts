export interface MiDia {
  ingreso: string | null; inicio: string; fin: string; ahora: number;
  trabajadoSeg: number; jornadaSeg: number; focoSeg: number; calendarioDisponible?: boolean;
  segmentos: { tipo: 'tareas' | 'reuniones' | 'libre' | 'pendiente'; desde: number; hasta: number }[];
  reuniones: { total: number; segundos: number; hechas: number; enCurso: number; porVenir: number };
  tareas: { completadas: number; total: number };
  cumplimiento: { porcentaje: number | null; estado: string; delta: number | null };
}
export interface ResponsableVivo {
  user_id: string; session_status?: string; titulo_tarea?: string | null;
  meeting_now?: { summary: string } | null; first_check_in?: string | null;
}
export function duracionDia(segundos: number) {
  const minutos = Math.floor(Math.max(0, segundos) / 60);
  return `${Math.floor(minutos / 60)}h ${minutos % 60}m`;
}
export function horaDia(iso: string | null) {
  return iso ? new Date(iso).toLocaleTimeString('es-EC', { timeZone: 'America/Guayaquil', hour: '2-digit', minute: '2-digit', hour12: false }) : 'Sin ingreso';
}
export function estadoResponsable(persona: ResponsableVivo | undefined) {
  if (!persona) return null;
  if (persona.meeting_now) return `En reunión · ${persona.meeting_now.summary}`;
  if (persona.session_status === 'active' && persona.titulo_tarea) return `Trabajando · ${persona.titulo_tarea}`;
  return persona.first_check_in === null ? 'Sin ingreso hoy' : null;
}
