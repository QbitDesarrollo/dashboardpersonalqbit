import { useEffect, useRef, useState } from 'react';
import { Clock } from 'lucide-react';
import { toast } from 'sonner';
import * as api from '@/lib/apiClient';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const PAUSA_AVISADA = 'timer_pausa_auto_avisada';

interface PausaAuto { task_id?: string; titulo?: string; end_time?: string; duration_seconds?: number; tarea_abierta?: boolean; recuperable_seg?: number }
const claveDe = (r: PausaAuto) => `${r.task_id}|${r.end_time ?? ''}`;
const fmtMin = (seg: number) => {
  const m = Math.round(seg / 60);
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
};

/**
 * Guardián global del timer (regla: "trabajando = Tiusdei abierto con play").
 * - Latido cada 60s mientras haya sesión activa: si Tiusdei se cierra, el servidor
 *   pausa la sesión sola (15 min sin latido) con el tiempo hasta el último latido.
 * - Aviso del navegador al intentar cerrar la pestaña con timer corriendo.
 * - Después de la hora de cierre (20:00 ECU): modal "¿Sigues trabajando?" —
 *   confirmar protege 3 horas; sin respuesta en 30 min se pausa solo.
 * - Al volver: si un timer se pausó solo, pregunta si siguió trabajando y ofrece
 *   recuperar ese tiempo (dentro de la jornada, máx. 10 h) y reanudar.
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

  // Al volver (al abrir Tiusdei o al regresar a la pestaña): si el timer se pausó solo
  // porque Tiusdei estuvo cerrado o la pestaña se durmió, preguntar si siguió trabajando
  // y ofrecer recuperar ese tiempo y reanudar. Se pregunta una vez por pausa.
  const [pausaAuto, setPausaAuto] = useState<PausaAuto | null>(null);
  const [atendiendo, setAtendiendo] = useState(false);
  const revisadoRef = useRef(0);
  useEffect(() => {
    const revisar = () => {
      // Aunque la pestaña esté oculta: el aviso queda esperando cuando la persona vuelva
      if (Date.now() - revisadoRef.current < 60_000) return;
      revisadoRef.current = Date.now();
      api.getTimerResumeSuggestion().then((r: PausaAuto) => {
        if (!r?.task_id) return;
        try { if (localStorage.getItem(PAUSA_AVISADA) === claveDe(r)) return; } catch { /* sin almacenamiento */ }
        setPausaAuto(r);
      }).catch(() => {});
    };
    revisar();
    const onVolver = () => { if (!document.hidden) revisar(); };
    document.addEventListener('visibilitychange', onVolver);
    window.addEventListener('focus', onVolver);
    return () => {
      document.removeEventListener('visibilitychange', onVolver);
      window.removeEventListener('focus', onVolver);
    };
  }, []);

  const atender = async (accion: 'recuperar' | 'reanudar' | 'descartar') => {
    if (!pausaAuto) return;
    setAtendiendo(true);
    try {
      const r = await api.resumeAutoTimer(accion);
      if (accion === 'descartar') toast.success('Listo, el timer queda pausado.');
      else {
        toast.success(r.recuperado_seg > 0 ? `Timer reanudado y ${fmtMin(r.recuperado_seg)} recuperados` : 'Timer reanudado');
        // La lista de tareas y la barra del timer deben reflejar la sesión nueva
        setTimeout(() => window.location.reload(), 1200);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo reanudar el timer');
    } finally {
      try { localStorage.setItem(PAUSA_AVISADA, claveDe(pausaAuto)); } catch { /* ignore */ }
      setPausaAuto(null);
      setAtendiendo(false);
    }
  };

  const horaPausa = pausaAuto?.end_time
    ? new Date(pausaAuto.end_time).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Guayaquil' })
    : '';
  const recuperable = pausaAuto?.tarea_abierta !== false ? (pausaAuto?.recuperable_seg ?? 0) : 0;

  return (
    <>
    <AlertDialog open={!!pausaAuto} onOpenChange={(o) => {
      // Cerrar sin elegir: no volver a preguntar por esta misma pausa
      if (!o && pausaAuto) { try { localStorage.setItem(PAUSA_AVISADA, claveDe(pausaAuto)); } catch { /* ignore */ } setPausaAuto(null); }
    }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-amber-500" />
            Tu timer se pausó solo
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                <strong className="text-foreground">«{pausaAuto?.titulo}»</strong> se pausó{horaPausa ? ` a las ${horaPausa}` : ''} porque Tiusdei dejó de responder:
                la pestaña se cerró, Chrome la durmió o la computadora se suspendió. El tiempo hasta ese momento quedó guardado.
              </p>
              {pausaAuto?.tarea_abierta === false ? (
                <p>La tarea ya está entregada, así que no se puede reanudar.</p>
              ) : recuperable >= 300 ? (
                <p>¿Seguiste trabajando en esta tarea desde entonces? Podemos sumar los <strong className="text-foreground">{fmtMin(recuperable)}</strong> que faltan (solo dentro de tu jornada, sin almuerzo).</p>
              ) : (
                <p>¿Sigues con esta tarea?</p>
              )}
              <p className="text-xs">Para que no vuelva a pasar: en Chrome, Configuración › Rendimiento › Ahorro de memoria › «Mantener siempre activos estos sitios», agrega <strong>tiusdei.qbit.ec</strong>, y deja la pestaña abierta mientras trabajas en otro programa.</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-0">
          <AlertDialogCancel disabled={atendiendo} onClick={(e) => { e.preventDefault(); atender('descartar'); }}>
            Dejarlo pausado
          </AlertDialogCancel>
          {pausaAuto?.tarea_abierta !== false && (
            <Button variant="outline" disabled={atendiendo} onClick={() => atender('reanudar')}>Solo reanudar</Button>
          )}
          {pausaAuto?.tarea_abierta !== false && recuperable >= 300 && (
            <Button disabled={atendiendo} onClick={() => atender('recuperar')}>Sí, sumar {fmtMin(recuperable)} y reanudar</Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
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
    </>
  );
}
