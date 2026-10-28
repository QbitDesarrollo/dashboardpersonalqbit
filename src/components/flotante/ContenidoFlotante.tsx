import { useRef, useState } from 'react';
import { toast } from 'sonner';
import * as api from '@/lib/apiClient';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { useTaskTimer } from '@/hooks/useTaskTimer';
import { useTimerClock } from '@/hooks/useTimerClock';
import { notifyTaskTimerChanged } from '@/lib/taskTimer';
import { useDatosFlotantes, type DetalleFlotante } from './useDatosFlotantes';
import { VistaFlotante } from './VistaFlotante';
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
    <VistaFlotante marca={[task.brand_nombre, datos.proyecto].filter(Boolean).join(' · ') || 'Tiusdei'}
      titulo={detalle?.titulo_tarea || task.titulo} prioridad={detalle?.prioridad} entrega={detalle?.fecha_entrega ?? undefined}
      now={now} tiempo={timer.formattedTime} segundos={timer.elapsedTime} estimacion={estimate}
      subtareas={datos.subtareas} reuniones={datos.reuniones} pending={pending} error={error}
      onPause={() => { void accion(async () => { if (await detener()) onClose(); }); }}
      onFinish={() => { void accion(async () => {
        if (!await detener()) return;
        const result: { error?: string } = await api.patchTask(task.id, { check_done: true });
        if (result.error) throw new Error(result.error);
        refresh();
        onClose();
      }); }}
      recientes={<>
        {datos.recientes?.filter(t => t.id !== task.id && !t.check_done).map(t => <TareaReciente key={t.id} task={t} disabled={pending} onStart={start => accion(async () => {
          esperarTimerFlotante(t.id);
          if (!await detener()) { esperarTimerFlotante(task.id); return; }
          if (!await start()) { onClose(); return; }
          await sincronizarSesion(t.id, true);
          refresh();
        })} />)}
        {datos.recientes?.filter(t => t.id !== task.id && !t.check_done).length === 0 && <p className="py-2 text-muted-foreground">No tienes otras tareas en proceso.</p>}
      </>}
    />
  );
}

function TareaReciente({ task, disabled, onStart }: { task: DetalleFlotante; disabled: boolean; onStart: (start: () => Promise<boolean>) => Promise<void> }) {
  const { startTimer } = useTaskTimer({ taskId: task.id, initialTime: task.tiempo_trabajado || 0, isActive: !!task.timer_activo, startTime: task.timer_inicio || null });
  return <Button variant="ghost" className="h-auto w-full justify-start whitespace-normal text-left text-xs" disabled={disabled} onClick={() => { void onStart(startTimer); }}>{[task.brands?.nombre, task.titulo_tarea].filter(Boolean).join(' · ')}</Button>;
}
