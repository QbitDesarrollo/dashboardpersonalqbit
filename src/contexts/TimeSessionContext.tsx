import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import * as api from '@/lib/apiClient';
import { useAuth } from '@/contexts/AuthContext';
import { useActivityTracker } from '@/hooks/useActivityTracker';
import { useScreenshotCapture } from '@/hooks/useScreenshotCapture';
import { toast } from 'sonner';

interface TimeSession {
  id: string;
  task_id: string;
  user_id: string;
  start_time: string;
  status: 'active' | 'paused' | 'completed';
  activity_level: number;
  titulo_tarea?: string;
  brand_nombre?: string;
}

interface TimeSessionContextType {
  activeSession: TimeSession | null;
  isTracking: boolean;
  elapsedSeconds: number;
  startSession: (taskId: string) => Promise<void>;
  stopSession: () => Promise<void>;
  pauseSession: () => Promise<void>;
  resumeSession: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const TimeSessionContext = createContext<TimeSessionContextType | null>(null);

export function useTimeSession() {
  const ctx = useContext(TimeSessionContext);
  if (!ctx) throw new Error('useTimeSession must be used within TimeSessionProvider');
  return ctx;
}

export function TimeSessionProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  const [activeSession, setActiveSession] = useState<TimeSession | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef<number | null>(null);
  const [screenshotInterval, setScreenshotInterval] = useState(5);

  const isTracking = activeSession?.status === 'active';

  // Load settings
  useEffect(() => {
    api.getSiteSettings()
      .then((s: any) => {
        if (s?.timedoctor_screenshot_interval) {
          setScreenshotInterval(parseInt(s.timedoctor_screenshot_interval) || 5);
        }
      })
      .catch(() => {});
  }, []);

  // Fetch active session on mount
  const refreshSession = useCallback(async () => {
    if (!profile) return;
    try {
      const data = await api.getActiveTimeSession();
      setActiveSession(data.session || null);
    } catch {
      setActiveSession(null);
    }
  }, [profile]);

  useEffect(() => { refreshSession(); }, [refreshSession]);

  // Activity tracking. If the server says the session is over (stopped or paused
  // elsewhere), refresh it so this tab stops tracking a closed session.
  useActivityTracker(isTracking ? activeSession?.id || null : null, refreshSession);

  // Screenshot capture
  useScreenshotCapture(
    isTracking ? activeSession?.id || null : null,
    isTracking ? activeSession?.task_id || null : null,
    screenshotInterval
  );

  // Elapsed time counter
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);

    if (isTracking && activeSession) {
      const startTime = new Date(activeSession.start_time).getTime();
      const tick = () => {
        setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
      };
      tick();
      timerRef.current = window.setInterval(tick, 1000);
    } else {
      setElapsedSeconds(0);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isTracking, activeSession?.start_time]);

  const startSession = useCallback(async (taskId: string) => {
    try {
      const data = await api.startTimeSession(taskId);
      setActiveSession(data.session);
      toast.success('Sesión de tiempo iniciada');
    } catch (e: any) {
      if (e.message?.includes('Ya tienes')) {
        toast.error('Ya tienes una sesión activa. Detenla primero.');
      } else {
        toast.error('Error al iniciar sesión');
      }
    }
  }, []);

  const stopSession = useCallback(async () => {
    if (!activeSession) return;
    try {
      await api.stopTimeSession(activeSession.id);
      setActiveSession(null);
      toast.success('Sesión detenida');
    } catch {
      toast.error('Error al detener sesión');
    }
  }, [activeSession]);

  const pauseSession = useCallback(async () => {
    if (!activeSession) return;
    try {
      await api.pauseTimeSession(activeSession.id);
      setActiveSession({ ...activeSession, status: 'paused' });
      toast.info('Sesión pausada');
    } catch {
      toast.error('Error al pausar');
    }
  }, [activeSession]);

  const resumeSession = useCallback(async () => {
    if (!activeSession) return;
    try {
      await api.resumeTimeSession(activeSession.id);
      await refreshSession();
      toast.success('Sesión reanudada');
    } catch {
      toast.error('Error al reanudar');
    }
  }, [activeSession, refreshSession]);

  return (
    <TimeSessionContext.Provider
      value={{
        activeSession,
        isTracking,
        elapsedSeconds,
        startSession,
        stopSession,
        pauseSession,
        resumeSession,
        refreshSession,
      }}
    >
      {children}
    </TimeSessionContext.Provider>
  );
}
