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
      const now = new Date().toISOString();
      const result: any = await api.patchTask(taskId, { timer_activo: true, timer_inicio: now });
      if (result?.error) throw new Error(result.error);
      
      startTimeRef.current = new Date(now);
      setIsRunning(true);
      toast.success('Timer iniciado');
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

      const result: any = await api.patchTask(taskId, {
        timer_activo: false,
        timer_inicio: null,
        tiempo_trabajado: initialTime + additionalTime,
      });
      if (result?.error) throw new Error(result.error);
      
      setIsRunning(false);
      startTimeRef.current = null;
      toast.success('Timer pausado');
    } catch (error: any) {
      toast.error('Error al pausar timer', { description: error.message });
    }
  }, [taskId, initialTime]);

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
