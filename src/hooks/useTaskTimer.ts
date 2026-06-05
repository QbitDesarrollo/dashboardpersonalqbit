import { useState, useEffect, useCallback, useRef } from 'react';
import * as api from '@/lib/apiClient';
import { toast } from 'sonner';

interface UseTaskTimerProps {
  taskId: string;
  initialTime: number;
  isActive: boolean;
  startTime: string | null;
}

export function useTaskTimer({ taskId, initialTime, isActive, startTime }: UseTaskTimerProps) {
  const [elapsedTime, setElapsedTime] = useState(initialTime);
  const [isRunning, setIsRunning] = useState(isActive);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<Date | null>(startTime ? new Date(startTime) : null);
  const warnThresholdRef = useRef(0); // Pieza 2: umbral de aviso de timer largo

  // Calculate elapsed time when timer was already running
  useEffect(() => {
    if (isActive && startTime) {
      const start = new Date(startTime);
      const now = new Date();
      const additionalSeconds = Math.floor((now.getTime() - start.getTime()) / 1000);
      setElapsedTime(initialTime + additionalSeconds);
      startTimeRef.current = start;
    } else {
      setElapsedTime(initialTime);
    }
    setIsRunning(isActive);
  }, [initialTime, isActive, startTime]);

  // Timer interval
  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => {
        setElapsedTime((prev) => prev + 1);
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRunning]);

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
          return;
        }

        // Pausar la anterior con el tiempo correspondiente
        try {
          await api.patchTask(otro.id, {
            timer_activo: false,
            timer_inicio: null,
            tiempo_trabajado: (otro.tiempo_trabajado || 0) + timeToSum,
          });
        } catch (e) {
          console.error('[TIMER] No se pudo pausar el timer anterior:', e);
          toast.error('No se pudo pausar el timer anterior. Revisá manualmente.');
          return;
        }
      }

      // 2) Iniciar este timer
      const now = new Date().toISOString();
      const result: any = await api.patchTask(taskId, { timer_activo: true, timer_inicio: now });
      if (result?.error) throw new Error(result.error);

      startTimeRef.current = new Date(now);
      setIsRunning(true);
      toast.success(otro ? 'Timer iniciado (la anterior se pausó)' : 'Timer iniciado');
    } catch (error: any) {
      toast.error('Error al iniciar timer', { description: error.message });
    }
  }, [taskId]);

  const stopTimer = useCallback(async () => {
    try {
      // Calculate additional time since timer started
      let additionalTime = 0;
      if (startTimeRef.current) {
        additionalTime = Math.floor((new Date().getTime() - startTimeRef.current.getTime()) / 1000);
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
      const TEN_HOURS = 10 * 3600;
      if (additionalTime > TEN_HOURS) additionalTime = TEN_HOURS;

      const result: any = await api.patchTask(taskId, {
        timer_activo: false,
        timer_inicio: null,
        tiempo_trabajado: initialTime + additionalTime,
      });
      if (result?.error) throw new Error(result.error);

      // Actualizar elapsed local para reflejar cambio real
      setElapsedTime(initialTime + additionalTime);
      setIsRunning(false);
      startTimeRef.current = null;
      toast.success(additionalTime === 0 ? 'Timer pausado (sin cambios)' : 'Timer pausado');
    } catch (error: any) {
      toast.error('Error al pausar timer', { description: error.message });
    }
  }, [taskId, initialTime]);

  // Pieza 2 (Timer control): avisar cada 2h "¿Sigues trabajando?" y pausar si dice que no.
  useEffect(() => {
    if (!isRunning) { warnThresholdRef.current = 0; return; }
    if (warnThresholdRef.current === 0) { warnThresholdRef.current = (Math.floor(elapsedTime / 7200) + 1) * 7200; return; }
    if (elapsedTime >= warnThresholdRef.current) {
      warnThresholdRef.current = elapsedTime + 7200;
      const horas = Math.floor(elapsedTime / 3600);
      const sigue = window.confirm(`⏱️ Llevas ${horas}h con esta tarea activa.\n\n¿Sigues trabajando en ella?\n\n[Aceptar] = sí, sigo trabajando\n[Cancelar] = pausar el timer ahora`);
      if (!sigue) { stopTimer(); }
    }
  }, [elapsedTime, isRunning, stopTimer]);

  const resetTimer = useCallback(async () => {
    try {
      const result: any = await api.patchTask(taskId, {
        timer_activo: false,
        timer_inicio: null,
        tiempo_trabajado: 0,
      });
      if (result?.error) throw new Error(result.error);
      
      setElapsedTime(0);
      setIsRunning(false);
      startTimeRef.current = null;
      toast.success('Timer reiniciado');
    } catch (error: any) {
      toast.error('Error al reiniciar timer', { description: error.message });
    }
  }, [taskId]);

  const formatTime = useCallback((seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hrs > 0) {
      return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, []);

  return {
    elapsedTime,
    isRunning,
    formattedTime: formatTime(elapsedTime),
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
