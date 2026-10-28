import { useRef, useState } from 'react';
import { toast } from 'sonner';
import * as api from '@/lib/apiClient';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { TimerReadout } from '@/components/tasks/TimerReadout';
import { useTaskTimer } from '@/hooks/useTaskTimer';
import { useTimerClock } from '@/hooks/useTimerClock';
import { notifyTaskTimerChanged } from '@/lib/taskTimer';
import { estadoReunion } from '@/lib/reuniones';
import { entregaFlotante, subtareaLista } from '@/lib/ventanaFlotante';
import { useDatosFlotantes, type DetalleFlotante } from './useDatosFlotantes';
import { ReunionFlotante } from './ReunionFlotante';
import { esperarTimerFlotante } from './useVentanaFlotante';

async function sincronizarSesion(taskId: string, iniciar = false) {
  try {
    const { session } = await api.getActiveTimeSession();
    if (session && (iniciar ? session.task_id !== taskId : session.task_id === taskId)) await api.stopTimeSession(session.id);
    if (iniciar && session?.task_id !== taskId) await api.startTimeSession(taskId);
  } catch { /* El registro de actividad es opcional, como en TaskTimer. */ }
}

export function ContenidoFlotante({ task, onClose }: { task: api.ActiveTimer; onClose: () => void }) {
  const now = useTimerClock(true);
  const datos = useDatosFlotantes(task.id, now);
  const timer = useTaskTimer({ taskId: task.id, initialTime: task.tiempo_trabajado, isActive: true, startTime: task.timer_inicio });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const ocupado = useRef(false);
  const client = useQueryClient();
  const detalle = datos.detalle;
  const estimate = Number(detalle?.estimated_hours || 0);
  const porcentaje = estimate > 0 ? Math.min(100, Math.round(timer.elapsedTime / (estimate * 36))) : 0;
  const siguientes = datos.subtareas?.filter(sub => !subtareaLista(sub));
  const reunion = datos.reuniones?.find(event => estadoReunion(event, now) !== 'terminada');
  const refresh = () => { notifyTaskTimerChanged(); void client.invalidateQueries({ queryKey: ['flotante'] }); };
  const detener = async () => {
    if (!await timer.stopTimer()) return false;
    await sincronizarSesion(task.id);
    refresh();
    return true;
  };
  const accion = async (fn: () => Promise<void>) => {
    if (ocupado.current) return;
    ocupado.current = true;
    setPending(true);
    setError('');
    try { await fn(); } catch {
      const mensaje = 'No se pudo completar la acción. Intenta de nuevo.';
      setError(mensaje);
      toast.error(mensaje);
    }
    finally { ocupado.current = false; setPending(false); }
  };
  return (
    <article aria-label="Tarea en ventana flotante" className="min-h-screen space-y-2 bg-card p-3 text-card-foreground">
      <header className="flex items-center justify-between gap-2 text-xs">
        <span className="min-w-0 truncate font-semibold">{[task.brand_nombre, datos.proyecto].filter(Boolean).join(' · ') || 'Tiusdei'}</span>
        <button aria-label="Cerrar ventana flotante" onClick={onClose} className="rounded px-2 py-1 focus-visible:ring-2">×</button>
      </header>
      <h1 className="line-clamp-2 text-[15px] font-semibold leading-5">{detalle?.titulo_tarea || task.titulo}</h1>
      <p className="text-xs text-muted-foreground">
        {detalle?.prioridad && <span className="mr-2 rounded-full border border-orange-500/30 px-2 capitalize text-foreground">{detalle.prioridad}</span>}
        {detalle?.fecha_entrega && entregaFlotante(detalle.fecha_entrega, now)}
      </p>
      <div className="[&>[role=timer]]:text-[28px]"><TimerReadout time={timer.formattedTime} running large /></div>
      {estimate > 0 && <div className="space-y-1 text-xs text-muted-foreground">
        <p>{Math.floor(timer.elapsedTime / 3600)}h {Math.floor(timer.elapsedTime % 3600 / 60)}m de {estimate}h estimadas</p>
        <div role="progressbar" aria-label="Tiempo sobre estimación" aria-valuenow={porcentaje} aria-valuemin={0} aria-valuemax={100} className="h-1 overflow-hidden rounded bg-muted">
          <div className="h-full bg-primary" style={{ width: `${porcentaje}%` }} />
        </div>
      </div>}
      {!!datos.subtareas?.length && <p className="text-xs">Subtareas {datos.subtareas.filter(subtareaLista).length}/{datos.subtareas.length}{siguientes?.[0] && ` · Siguiente: ${siguientes[0].titulo_tarea}`}</p>}
      {reunion && <ReunionFlotante reunion={reunion} now={now} />}
      {datos.reuniones && <p className="text-xs text-muted-foreground">Hoy: {datos.reuniones.length} {datos.reuniones.length === 1 ? 'reunión' : 'reuniones'}</p>}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" disabled={pending} onClick={() => { void accion(async () => { if (await detener()) onClose(); }); }}>Pausar</Button>
        <Button variant="outline" size="sm" className="border-destructive/40" disabled={pending} onClick={() => { void accion(async () => {
          if (!await detener()) return;
          const result: { error?: string } = await api.patchTask(task.id, { check_done: true });
          if (result.error) throw new Error(result.error);
          refresh();
          onClose();
        }); }}>Terminar</Button>
        <button className="ml-auto text-xs underline focus-visible:ring-2" onClick={() => { window.focus(); }}>Ir a Tiusdei ↗</button>
      </div>
      <details className="text-xs">
        <summary className="cursor-pointer py-1 underline focus-visible:ring-2">Cambiar tarea</summary>
        {datos.recientes?.filter(t => t.id !== task.id && !t.check_done).map(t => <TareaReciente key={t.id} task={t} disabled={pending} onStart={start => accion(async () => {
          esperarTimerFlotante(t.id);
          if (!await detener()) { esperarTimerFlotante(task.id); return; }
          if (!await start()) { onClose(); return; }
          await sincronizarSesion(t.id, true);
          refresh();
        })} />)}
        {datos.recientes?.filter(t => t.id !== task.id && !t.check_done).length === 0 && <p className="py-2 text-muted-foreground">No tienes otras tareas en proceso.</p>}
      </details>
    </article>
  );
}

function TareaReciente({ task, disabled, onStart }: { task: DetalleFlotante; disabled: boolean; onStart: (start: () => Promise<boolean>) => Promise<void> }) {
  const { startTimer } = useTaskTimer({ taskId: task.id, initialTime: task.tiempo_trabajado || 0, isActive: !!task.timer_activo, startTime: task.timer_inicio || null });
  return <Button variant="ghost" className="h-auto w-full justify-start whitespace-normal text-left text-xs" disabled={disabled} onClick={() => { void onStart(startTimer); }}>{task.titulo_tarea}</Button>;
}
