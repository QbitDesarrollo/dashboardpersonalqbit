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
  // Cuanto de este minuto la pestana estuvo OCULTA (la persona en otro programa).
  // Sin esto, trabajar en Illustrator/Premiere contaba como "inactivo" y se
  // descontaba del tiempo: en la pestana de Tiusdei no hay teclas ni clics.
  const hiddenMsRef = useRef<number>(0);
  const hiddenSinceRef = useRef<number | null>(document.hidden ? Date.now() : null);

  const flush = useCallback(async () => {
    if (!activeSessionId) return;
    const snapshot = { ...counters.current };
    counters.current = { keyboard: 0, mouse: 0, scroll: 0, click: 0 };

    // cerrar el tramo oculto en curso y decidir si el minuto fue "en otro programa"
    let hiddenMs = hiddenMsRef.current;
    if (hiddenSinceRef.current !== null) {
      hiddenMs += Date.now() - hiddenSinceRef.current;
      hiddenSinceRef.current = Date.now();
    }
    hiddenMsRef.current = 0;
    const tabHidden = hiddenMs > 30_000; // mas de medio minuto fuera de la pestana

    try {
      await api.postActivitySnapshot(activeSessionId, snapshot, tabHidden);
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

    const onVisibility = () => {
      if (document.hidden) {
        hiddenSinceRef.current = Date.now();
      } else if (hiddenSinceRef.current !== null) {
        hiddenMsRef.current += Date.now() - hiddenSinceRef.current;
        hiddenSinceRef.current = null;
      }
    };

    window.addEventListener('keydown', onKeydown, { passive: true });
    window.addEventListener('mousemove', onMousemoveThrottled, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    window.addEventListener('click', onClick, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);

    // Flush every 60 seconds
    intervalRef.current = window.setInterval(flush, 60000);

    return () => {
      window.removeEventListener('keydown', onKeydown);
      window.removeEventListener('mousemove', onMousemoveThrottled);
      window.removeEventListener('scroll', onScroll, { capture: true } as any);
      window.removeEventListener('click', onClick);
      document.removeEventListener('visibilitychange', onVisibility);
      if (intervalRef.current) clearInterval(intervalRef.current);
      // Final flush on cleanup
      flush();
    };
  }, [activeSessionId, flush]);

  return {
    getIdleSeconds: () => Math.floor((Date.now() - lastActivityRef.current) / 1000),
  };
}
