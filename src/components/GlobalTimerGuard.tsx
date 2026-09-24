import { useEffect, useRef, useState } from 'react';
import { Clock } from 'lucide-react';
import { toast } from 'sonner';
import * as api from '@/lib/apiClient';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

/**
 * Guardián global del timer (regla: "trabajando = Tiusdei abierto con play").
 * - Latido cada 60s mientras haya sesión activa: si Tiusdei se cierra, el servidor
 *   pausa la sesión solo (~5 min) con el tiempo exacto guardado.
 * - Aviso del navegador al intentar cerrar la pestaña con timer corriendo.
 * - Después de la hora de cierre (20:00 ECU): modal "¿Sigues trabajando?" —
 *   confirmar protege 3 horas; sin respuesta en 30 min se pausa solo.
 * - Al volver: si un timer se pausó automáticamente hace poco, ofrece Reanudar.
 */
export function GlobalTimerGuard() {
  const activeRef = useRef(false);
  const confirmedUntilRef = useRef(0);
  const modalShownAtRef = useRef(0);
  const [confirmInfo, setConfirmInfo] = useState<{ titulo: string } | null>(null);

  // Latido + chequeo de confirmación nocturna
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const r: any = await api.timerHeartbeat();
        if (!alive) return;
        activeRef.current = !!r?.active;
        if (!r?.active) {
          setConfirmInfo(null);
          modalShownAtRef.current = 0;
          return;
        }
        if (r?.eod && Date.now() > confirmedUntilRef.current) {
          if (!modalShownAtRef.current) {
            modalShownAtRef.current = Date.now();
            setConfirmInfo({ titulo: r.titulo || 'tu tarea' });
          } else if (Date.now() - modalShownAtRef.current > 30 * 60 * 1000) {
            // Sin respuesta en 30 min: pausar (la persona no está)
            await api.pauseMyTimer().catch(() => {});
            activeRef.current = false;
            setConfirmInfo(null);
            modalShownAtRef.current = 0;
          }
        }
      } catch {
        // sin sesión / sin permisos: silencio
      }
    };
    tick();
    // El latido vive en un Web Worker: Chrome frena los setInterval de las
    // pestanas en segundo plano (hasta 1/min y con retrasos), pero no los de
    // los workers. Asi el timer sigue latiendo mientras la persona disena en
    // otro programa. El setInterval queda solo como respaldo.
    let worker: Worker | null = null;
    try {
      const src = 'setInterval(function(){ postMessage(1) }, 60000)';
      worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'application/javascript' })));
      worker.onmessage = () => { tick(); };
    } catch { /* sin workers: queda el respaldo */ }
    const iv = setInterval(tick, 90 * 1000);
    // Al volver a la pestana, recuperar el foco o la red: latir de inmediato.
    const onWake = () => { if (!document.hidden) tick(); };
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('focus', onWake);
    window.addEventListener('online', onWake);
    return () => {
      alive = false;
      clearInterval(iv);
      worker?.terminate();
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('focus', onWake);
      window.removeEventListener('online', onWake);
    };
  }, []);

  // Aviso del navegador al cerrar con timer corriendo
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (activeRef.current) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  // Sugerencia de reanudar al volver (si un timer se pausó automáticamente hace poco)
  useEffect(() => {
    api.getTimerResumeSuggestion().then((r: any) => {
      if (!r?.task_id) return;
      const hhmm = r.end_time
        ? new Date(r.end_time).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Guayaquil' })
        : '';
      const dur = r.duration_seconds
        ? `${Math.floor(r.duration_seconds / 3600)}h ${Math.floor((r.duration_seconds % 3600) / 60)}m`
        : '';
      toast(`⏸️ Tu timer en "${r.titulo}" se pausó solo${hhmm ? ` a las ${hhmm}` : ''}`, {
        description: `Tiusdei dejó de responder (pestaña cerrada, equipo suspendido o sin internet) por más de 15 minutos, así que pausamos el timer${dur ? ` y guardamos ${dur}` : ' y guardamos tu tiempo'}. No se perdió nada. Si trabajas en otro programa, deja la pestaña de Tiusdei abierta (no hace falta tenerla al frente). ¿Sigues con esta tarea?`,
        duration: 30000,
        action: {
          label: 'Reanudar',
          onClick: () => {
            const now = new Date().toISOString();
            api.patchTask(r.task_id, { timer_activo: true, timer_inicio: now })
              .then(() => api.startTimeSession(r.task_id))
              .then(() => toast.success('Timer reanudado'))
              .catch(() => toast.error('No se pudo reanudar el timer'));
          },
        },
      });
    }).catch(() => {});
  }, []);

  return (
    <AlertDialog open={!!confirmInfo} onOpenChange={(o) => { if (!o) setConfirmInfo(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-amber-500" />
            ¿Sigues trabajando?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Tu timer en <strong>{confirmInfo?.titulo}</strong> sigue corriendo y ya pasó la hora de cierre.
            Si no confirmas en los próximos 30 minutos, se pausará solo (con tu tiempo guardado).
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={async () => {
            await api.pauseMyTimer().catch(() => {});
            activeRef.current = false;
            modalShownAtRef.current = 0;
            setConfirmInfo(null);
            toast.success('Timer pausado. ¡Buen descanso!');
          }}>
            Pausar ahora
          </AlertDialogCancel>
          <AlertDialogAction onClick={() => {
            confirmedUntilRef.current = Date.now() + 3 * 60 * 60 * 1000;
            modalShownAtRef.current = 0;
            setConfirmInfo(null);
            toast.success('Listo, seguimos. Te volveremos a preguntar en 3 horas.');
          }}>
            Sí, sigo trabajando
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
