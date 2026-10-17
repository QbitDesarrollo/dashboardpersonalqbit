import { useState, useEffect, useCallback, useRef } from 'react';
import * as api from '@/lib/apiClient';
import { toast } from 'sonner';
import { formatTaskTimer, taskElapsedSeconds } from '@/lib/taskTimer';
import { useTimerClock } from './useTimerClock';

interface UseTaskTimerProps {
  taskId: string;
  initialTime: number;
  isActive: boolean;
  startTime: string | null;
  estimatedHours?: number | null;
  /** Solo avisar (2h / horas estimadas) si la tarea es del usuario actual.
   *  Sin esto, la lista disparaba avisos por timers de OTRAS personas. */
  warnEnabled?: boolean;
  taskTitle?: string;
}

export function useTaskTimer({ taskId, initialTime, isActive, startTime, estimatedHours, warnEnabled, taskTitle }: UseTaskTimerProps) {
  const [savedTime, setSavedTime] = useState(initialTime);
  const [isRunning, setIsRunning] = useState(isActive);
  const [timerStart, setTimerStart] = useState(startTime);
  const now = useTimerClock(isRunning);
  const elapsedTime = taskElapsedSeconds(savedTime, isRunning ? timerStart : null, now);
  const warnThresholdRef = useRef(0); // Pieza 2: umbral de aviso de timer largo
  const overWarnedRef = useRef(false); // aviso de horas estimadas superadas

  useEffect(() => {
    setSavedTime(initialTime);
    setTimerStart(isActive ? startTime : null);
    setIsRunning(isActive);
  }, [initialTime, isActive, startTime]);

  const startTimer = useCallback(async () => {
    try {
      // 1) Detectar si el usuario ya tiene OTRO timer activo
      let activos: api.ActiveTimer[] = [];
      try {
        activos = await api.getActiveTimers();
      } catch {
        // Si falla el chequeo seguimos sin bloquear (best-effort)
      }
      const otro = activos.find((t) => t.id !== taskId);

      if (otro) {
        // Calcular cuánto lleva corriendo el otro timer
        const otroStart = new Date(otro.timer_inicio).getTime();
        const additional = Math.max(0, Math.floor((Date.now() - otroStart) / 1000));
        const hrs = Math.floor(additional / 3600);
        const mins = Math.floor((additional % 3600) / 60);
        const elapsedStr = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
        const brand = otro.brand_nombre ? ` (${otro.brand_nombre})` : '';

        const THREE_HOURS = 3 * 3600;
        let confirmMsg: string;
        let timeToSum = additional;
        if (additional > THREE_HOURS) {
          // Probablemente se olvidaron de pausar — sumamos 0 por defecto
          confirmMsg = `Ya tienes un timer activo en otra tarea:\n\n"${otro.titulo}"${brand}\nLleva ${elapsedStr} corriendo (parece que se olvidó pausar).\n\n¿Pausar la anterior SIN sumar tiempo e iniciar esta? La nueva tarea quedará como activa.`;
          timeToSum = 0;
        } else {
          confirmMsg = `Ya tienes un timer activo en otra tarea:\n\n"${otro.titulo}"${brand}\nLleva ${elapsedStr} corriendo.\n\n¿Pausar la anterior (se suman ${elapsedStr}) e iniciar esta?`;
        }

        const ok = window.confirm(confirmMsg);
        if (!ok) {
          toast.info('Cancelado. El timer anterior sigue corriendo.');
          return false;
        }

        // Pausar la anterior con el tiempo correspondiente
        try {
          const paused = await api.patchTask(otro.id, {
            timer_activo: false,
            timer_inicio: null,
            tiempo_trabajado_delta: timeToSum,
          });
          if (paused?.error) throw new Error(paused.error);
        } catch (e) {
          console.error('[TIMER] No se pudo pausar el timer anterior:', e);
          toast.error('No se pudo pausar el timer anterior. Revisa manualmente.');
          return false;
        }
      }

      // 2) Iniciar este timer
      const now = new Date().toISOString();
      const result: any = await api.patchTask(taskId, { timer_activo: true, timer_inicio: now });
      if (result?.error) throw new Error(result.error);

      setTimerStart(now);
      setIsRunning(true);
      toast.success(otro ? 'Timer iniciado (la anterior se pausó)' : 'Timer iniciado');
      return true;
    } catch (error: any) {
      toast.error('Error al iniciar timer', { description: error.message });
      return false;
    }
  }, [taskId]);

  const stopTimer = useCallback(async () => {
    try {
      // Calculate additional time since timer started
      let additionalTime = 0;
      if (timerStart) {
        additionalTime = taskElapsedSeconds(0, timerStart, Date.now());
      }

      // GUARDA: si la diferencia es > 3h, muy probable que el usuario olvidó pausar
      // (ej. almuerzo). Preguntamos antes de sumar.
      const THREE_HOURS = 3 * 3600;
      if (additionalTime > THREE_HOURS) {
        const hours = Math.floor(additionalTime / 3600);
        const mins = Math.floor((additionalTime % 3600) / 60);
        const msg = `El timer lleva ${hours}h ${mins}min activo. ¿Trabajaste todo ese tiempo?

[Aceptar] = sumar ${hours}h ${mins}min
[Cancelar] = pausar sin sumar (asumir que te olvidaste de pausar)`;
        const confirmed = window.confirm(msg);
        if (!confirmed) {
          additionalTime = 0;
        }
      }

      // CAP ABSOLUTO: nunca sumar más de 10h en una sola sesión (sanity)
      const TEN_HOURS = 12 * 3600; // tope por sesión: jornada extendida
      if (additionalTime > TEN_HOURS) additionalTime = TEN_HOURS;

      // DELTA atomico: el server hace tiempo_trabajado += delta. Antes se mandaba el
      // TOTAL calculado con datos locales y al pausar desde otro dispositivo (datos
      // viejos) se pisaba el tiempo real acumulado.
      const result: any = await api.patchTask(taskId, {
        timer_activo: false,
        timer_inicio: null,
        tiempo_trabajado_delta: additionalTime,
      });
      if (result?.error) throw new Error(result.error);

      // Actualizar elapsed local (el refetch de onUpdate trae el total real del server)
      setSavedTime(savedTime + additionalTime);
      setIsRunning(false);
      setTimerStart(null);
      toast.success(additionalTime === 0 ? 'Timer pausado (sin cambios)' : 'Timer pausado');
      return true;
    } catch (error: any) {
      toast.error('Error al pausar timer', { description: error.message });
      return false;
    }
  }, [taskId, savedTime, timerStart]);

  // Pieza 2 (Timer control): avisar cada 2h "¿Sigues trabajando?" y pausar si dice que no.
  useEffect(() => {
    if (!isRunning || !warnEnabled) { warnThresholdRef.current = 0; return; }
    if (warnThresholdRef.current === 0) { warnThresholdRef.current = (Math.floor(elapsedTime / 7200) + 1) * 7200; return; }
    if (elapsedTime >= warnThresholdRef.current) {
      warnThresholdRef.current = elapsedTime + 7200;
      const horas = Math.floor(elapsedTime / 3600);
      // Aviso como modal bonito (TimerWarningDialog escucha este evento), no window.confirm
      window.dispatchEvent(new CustomEvent('timer:warning', { detail: { horas, titulo: taskTitle || null, onPause: () => stopTimer() } }));
    }
  }, [elapsedTime, isRunning, warnEnabled, taskTitle, stopTimer]);

  // F) Alerta cuando el tiempo trabajado supera las horas estimadas de la tarea.
  useEffect(() => {
    if (!isRunning || !warnEnabled || !estimatedHours || estimatedHours <= 0) { overWarnedRef.current = false; return; }
    const limite = estimatedHours * 3600;
    if (elapsedTime >= limite && !overWarnedRef.current) {
      overWarnedRef.current = true;
      const trabajadas = Math.round((elapsedTime / 3600) * 10) / 10;
      window.dispatchEvent(new CustomEvent('timer:overestimate', {
        detail: { estimadas: estimatedHours, trabajadas, titulo: taskTitle || null, onPause: () => stopTimer() },
      }));
    }
  }, [elapsedTime, isRunning, warnEnabled, estimatedHours, taskTitle, stopTimer]);

  const resetTimer = useCallback(async () => {
    try {
      const result: any = await api.patchTask(taskId, {
        timer_activo: false,
        timer_inicio: null,
        tiempo_trabajado: 0,
      });
      if (result?.error) throw new Error(result.error);
      
      setSavedTime(0);
      setIsRunning(false);
      setTimerStart(null);
      toast.success('Timer reiniciado');
      return true;
    } catch (error: any) {
      toast.error('Error al reiniciar timer', { description: error.message });
      return false;
    }
  }, [taskId]);

  return {
    elapsedTime,
    isRunning,
    formattedTime: formatTaskTimer(elapsedTime),
    startTimer,
    stopTimer,
    resetTimer,
  };
}

export function formatTimeDisplay(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hrs > 0) {
    return `${hrs}h ${mins}m`;
  }
  if (mins > 0) {
    return `${mins}m ${secs}s`;
  }
  return `${secs}s`;
}
