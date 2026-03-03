import { useEffect, useRef, useCallback } from 'react';
import * as api from '@/lib/apiClient';

interface ActivityCounts {
  keyboard: number;
  mouse: number;
  scroll: number;
  click: number;
}

/**
 * Tracks keyboard/mouse/scroll/click events while a time session is active.
 * Every 60 seconds, sends the counts to the server.
 */
export function useActivityTracker(activeSessionId: string | null) {
  const counters = useRef<ActivityCounts>({ keyboard: 0, mouse: 0, scroll: 0, click: 0 });
  const intervalRef = useRef<number | null>(null);
  const lastActivityRef = useRef<number>(Date.now());

  const flush = useCallback(async () => {
    if (!activeSessionId) return;
    const snapshot = { ...counters.current };
    counters.current = { keyboard: 0, mouse: 0, scroll: 0, click: 0 };

    try {
      await api.postActivitySnapshot(activeSessionId, snapshot);
    } catch {
      // silent - server might be unreachable momentarily
    }
  }, [activeSessionId]);

  useEffect(() => {
    if (!activeSessionId) return;

    const onKeydown = () => { counters.current.keyboard++; lastActivityRef.current = Date.now(); };
    const onMousemove = () => { counters.current.mouse++; lastActivityRef.current = Date.now(); };
    const onScroll = () => { counters.current.scroll++; lastActivityRef.current = Date.now(); };
    const onClick = () => { counters.current.click++; lastActivityRef.current = Date.now(); };

    // Throttle mousemove to avoid excessive counting
    let mouseMoveThrottled = false;
    const onMousemoveThrottled = () => {
      if (mouseMoveThrottled) return;
      mouseMoveThrottled = true;
      onMousemove();
      setTimeout(() => { mouseMoveThrottled = false; }, 500);
    };

    window.addEventListener('keydown', onKeydown, { passive: true });
    window.addEventListener('mousemove', onMousemoveThrottled, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    window.addEventListener('click', onClick, { passive: true });

    // Flush every 60 seconds
    intervalRef.current = window.setInterval(flush, 60000);

    return () => {
      window.removeEventListener('keydown', onKeydown);
      window.removeEventListener('mousemove', onMousemoveThrottled);
      window.removeEventListener('scroll', onScroll, { capture: true } as any);
      window.removeEventListener('click', onClick);
      if (intervalRef.current) clearInterval(intervalRef.current);
      // Final flush on cleanup
      flush();
    };
  }, [activeSessionId, flush]);

  return {
    getIdleSeconds: () => Math.floor((Date.now() - lastActivityRef.current) / 1000),
  };
}
