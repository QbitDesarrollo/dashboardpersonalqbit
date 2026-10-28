import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import * as api from '@/lib/apiClient';
import { useQueryClient } from '@tanstack/react-query';
import { useTaskTimer } from '@/hooks/useTaskTimer';
import { useTimerClock } from '@/hooks/useTimerClock';
import { notifyTaskTimerChanged } from '@/lib/taskTimer';
import { useDatosFlotantes } from './useDatosFlotantes';
import { alturaFlotante, textoPreview } from '@/lib/ventanaFlotante';
import { estadoReunion, fechaReunion } from '@/lib/reuniones';
import { VistaFlotante } from './VistaFlotante';
import { ajustarAlturaFlotante } from './useVentanaFlotante';

async function sincronizarSesion(taskId: string) {
  try {
    const { session } = await api.getActiveTimeSession();
    if (session?.task_id === taskId) await api.stopTimeSession(session.id);
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
  const descripcion = textoPreview(detalle?.detalle);
  const responsables = detalle?.responsables?.map(persona => persona.nombre).filter(Boolean) ?? [];
  const responsable = responsables.length ? `${responsables[0]}${responsables.length > 1 ? ` +${responsables.length - 1}` : ''}` : detalle?.profiles?.nombre;
  const personas = [responsable, detalle?.desks?.nombre].filter(Boolean).join(' · ');
  const reunion = datos.reuniones?.some(r => estadoReunion(r, now) === 'en_curso'
    || (estadoReunion(r, now) === 'proxima' && fechaReunion(r.start) === fechaReunion(now)));
  const altura = alturaFlotante({ descripcion: !!descripcion, personas: !!personas, reunion, estimacion: estimate > 0 });
  const listo = !!detalle;
  useEffect(() => { if (listo) ajustarAlturaFlotante(altura); }, [altura, listo]);
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
      descripcion={descripcion} personas={personas}
      onPause={() => { void accion(async () => { if (await detener()) onClose(); }); }}
      onFinish={() => { void accion(async () => {
        if (!await detener()) return;
        const result: { error?: string } = await api.patchTask(task.id, { check_done: true });
        if (result.error) throw new Error(result.error);
        refresh();
        onClose();
      }); }}
    />
  );
}
