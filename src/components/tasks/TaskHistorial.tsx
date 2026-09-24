import { useEffect, useState } from 'react';
import * as api from '@/lib/apiClient';
import { ChevronDown, ChevronRight, History, Loader2 } from 'lucide-react';

// Historial de una tarea dentro del detalle: sesiones de tiempo de todas las
// personas (cuándo le dieron play/pausa y cuánto duró cada una) y los cambios
// de estado, responsable, fecha y prioridad. Pedido de Steven (22-sep-2026):
// "debería haber un histórico al entrar a la tarea, si tuvo ajustes o no".

interface Sesion { id: string; user_id: string; nombre: string | null; start_time: string; end_time: string | null; duration_seconds: number | null; status: string }
interface Cambio { id: string; field_name: string; old_value: string | null; new_value: string | null; user_nombre: string | null; created_at: string }

const TZ = 'America/Guayaquil';
const ESTADO: Record<string, string> = {
  backlog: 'Pendiente', en_proceso: 'En proceso', en_revision: 'En revisión', revision_interna: 'Revisión interna',
  revision_cliente: 'Revisión cliente', ajustes: 'Ajustes', aprobado: 'Aprobado', entregado: 'Entregado', bloqueado: 'Bloqueado',
};
const fmtDur = (seg: number) => { const h = Math.floor(seg / 3600); const m = Math.floor((seg % 3600) / 60); return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`; };
const fmtFecha = (iso: string) => new Date(iso).toLocaleDateString('es-EC', { day: '2-digit', month: 'short', timeZone: TZ });
const fmtHora = (iso: string) => new Date(iso).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
const fmtValor = (campo: string, v: string | null) => {
  if (v == null || v === '') return '—';
  if (campo === 'estado') return ESTADO[v] ?? v;
  if (campo === 'fecha_entrega') { const d = new Date(v); return isNaN(d.getTime()) ? v : d.toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit', timeZone: 'UTC' }); }
  return v;
};
const CAMPOS: Record<string, string> = { estado: 'Estado', responsable_user_id: 'Responsable', fecha_entrega: 'Fecha de entrega', prioridad: 'Prioridad' };

export function TaskHistorial({ taskId, ajustes }: { taskId: string; ajustes?: number }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sesiones, setSesiones] = useState<Sesion[]>([]);
  const [cambios, setCambios] = useState<Cambio[]>([]);

  useEffect(() => { setOpen(false); setSesiones([]); setCambios([]); }, [taskId]);
  useEffect(() => {
    if (!open) return;
    let cancelado = false;
    setLoading(true);
    Promise.all([api.getTaskTimeSessions(taskId), api.getActivityLog('task', taskId, { limit: 100 })])
      .then(([s, a]) => {
        if (cancelado) return;
        setSesiones((s?.sessions ?? []) as Sesion[]);
        const acts = ((a as { activities?: Cambio[] })?.activities ?? []).filter((x) => x.field_name in CAMPOS);
        setCambios(acts);
      })
      .catch(() => { /* silencioso: el historial es complementario */ })
      .finally(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
  }, [open, taskId]);

  const totalSeg = sesiones.reduce((acc, s) => acc + Number(s.duration_seconds || 0), 0);
  const vecesAjustes = cambios.filter((c) => c.field_name === 'estado' && c.new_value === 'ajustes').length;

  return (
    <div>
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <History className="h-4 w-4" />Historial
        {!!ajustes && <span className="ml-1 text-[11px] px-1.5 py-0.5 rounded-full bg-orange-500/15 text-orange-700 dark:text-orange-300">{ajustes} {ajustes === 1 ? 'vez' : 'veces'} en ajustes</span>}
      </button>
      {open && (loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2"><Loader2 className="h-3.5 w-3.5 animate-spin" />Cargando historial…</div>
      ) : (
        <div className="mt-2 space-y-3 text-xs">
          <div>
            <div className="font-medium text-muted-foreground mb-1">Sesiones de tiempo ({sesiones.length}) · total {fmtDur(totalSeg)}</div>
            {sesiones.length === 0 ? <p className="text-muted-foreground">Nadie ha registrado tiempo con el timer en esta tarea.</p> : (
              <div className="max-h-52 overflow-y-auto rounded-md border divide-y">
                {sesiones.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 px-2 py-1">
                    <span className="w-14 shrink-0 text-muted-foreground">{fmtFecha(s.start_time)}</span>
                    <span className="flex-1 truncate">{(s.nombre || '—').trim()}</span>
                    <span className="shrink-0 text-muted-foreground">{fmtHora(s.start_time)}{s.end_time ? `–${fmtHora(s.end_time)}` : s.status === 'active' ? ' → en curso' : ' → pausada'}</span>
                    <span className="w-16 shrink-0 text-right font-mono">{s.status === 'active' ? '⏱' : fmtDur(Number(s.duration_seconds || 0))}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <div className="font-medium text-muted-foreground mb-1">Cambios ({cambios.length}){vecesAjustes > 0 && <span className="ml-1 text-orange-700 dark:text-orange-300">· devuelta a ajustes {vecesAjustes} {vecesAjustes === 1 ? 'vez' : 'veces'}</span>}</div>
            {cambios.length === 0 ? <p className="text-muted-foreground">Sin cambios de estado, responsable, fecha o prioridad registrados.</p> : (
              <div className="max-h-52 overflow-y-auto rounded-md border divide-y">
                {cambios.map((c) => (
                  <div key={c.id} className="flex items-center gap-2 px-2 py-1">
                    <span className="w-24 shrink-0 text-muted-foreground">{fmtFecha(c.created_at)} {fmtHora(c.created_at)}</span>
                    <span className="w-24 shrink-0 truncate">{(c.user_nombre || 'Sistema').trim()}</span>
                    <span className="flex-1 truncate">
                      {CAMPOS[c.field_name]}: {c.field_name === 'responsable_user_id' ? 'reasignada' : <>{fmtValor(c.field_name, c.old_value)} → <strong className={c.new_value === 'ajustes' ? 'text-orange-700 dark:text-orange-300' : ''}>{fmtValor(c.field_name, c.new_value)}</strong></>}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
