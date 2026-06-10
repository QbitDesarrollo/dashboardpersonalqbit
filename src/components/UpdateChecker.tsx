import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

const BUNDLE_RE = /assets\/index-[A-Za-z0-9_-]+\.js/;

/**
 * Detecta cuando hay un deploy nuevo: compara el bundle del index.html del
 * servidor contra el que está corriendo esta pestaña. Si cambió, muestra un
 * aviso persistente con botón "Actualizar" (recarga la página).
 * Chequea al volver a la pestaña y cada 5 minutos.
 */
export function UpdateChecker() {
  const current = useRef<string | null>(null);
  const notified = useRef(false);

  useEffect(() => {
    const scr = document.querySelector('script[src*="assets/index-"]') as HTMLScriptElement | null;
    current.current = scr?.src.match(BUNDLE_RE)?.[0] ?? null;
    if (!current.current) return;

    const check = async () => {
      if (notified.current) return;
      try {
        const res = await fetch('/index.html', { cache: 'no-store' });
        if (!res.ok) return;
        const html = await res.text();
        const next = html.match(BUNDLE_RE)?.[0];
        if (next && next !== current.current) {
          notified.current = true;
          toast.info('Hay una nueva versión de Tiusdei', {
            description: 'Actualiza para ver los últimos cambios.',
            duration: Infinity,
            action: { label: 'Actualizar', onClick: () => window.location.reload() },
          });
        }
      } catch { /* sin conexión: reintenta en el próximo ciclo */ }
    };

    const interval = setInterval(check, 5 * 60 * 1000);
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);
    const first = setTimeout(check, 30_000);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', onVisible); clearTimeout(first); };
  }, []);

  return null;
}
