import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { getActiveTimers } from '@/lib/apiClient';
import { TIMER_CHANGED, TIMER_STORAGE_KEY } from '@/lib/taskTimer';

export function useActiveTaskTimers() {
  const { profile } = useAuth();
  const enabled = !!profile && profile.rol !== 'cliente';
  const result = useQuery({
    queryKey: ['active-task-timers', profile?.id],
    queryFn: getActiveTimers,
    enabled,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    staleTime: 0,
    retry: false,
  });
  const { refetch } = result;

  useEffect(() => {
    if (!enabled) return;
    const refresh = () => { void refetch(); };
    const onVisible = () => { if (!document.hidden) refresh(); };
    const onStorage = (event: StorageEvent) => { if (event.key === TIMER_STORAGE_KEY) refresh(); };
    window.addEventListener(TIMER_CHANGED, refresh);
    window.addEventListener('storage', onStorage);
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener(TIMER_CHANGED, refresh);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('online', refresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, refetch]);

  return { ...result, timers: enabled && !result.isError ? result.data ?? [] : [] };
}
