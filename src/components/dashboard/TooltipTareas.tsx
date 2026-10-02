import type { Task } from '@/lib/dashboardDatos';
import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/** Read-only preview; the chart/card click opens a scrollable list with every task. */
export function TooltipTareas({ titulo, grupos }: { titulo: string; grupos: { nombre: string; tareas: Task[] }[] }) {
  const ancla = useRef<HTMLSpanElement>(null);
  const tarjeta = useRef<HTMLDivElement>(null);
  const [posicion, setPosicion] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const colocar = () => {
      if (!ancla.current || !tarjeta.current) return;
      const origen = ancla.current.getBoundingClientRect();
      const medida = tarjeta.current.getBoundingClientRect();
      const left = Math.max(8, Math.min(origen.left, window.innerWidth - medida.width - 8));
      const top = Math.max(8, Math.min(origen.top, window.innerHeight - medida.height - 8));
      setPosicion(p => p?.left === left && p.top === top ? p : { left, top });
    };
    colocar();
    window.addEventListener('resize', colocar);
    window.addEventListener('scroll', colocar, true);
    return () => { window.removeEventListener('resize', colocar); window.removeEventListener('scroll', colocar, true); };
  }, [titulo, grupos]);
  return <>
    <span ref={ancla} aria-hidden="true" />
    {createPortal(<div ref={tarjeta} role="tooltip"
      style={{ left: posicion?.left ?? 8, top: posicion?.top ?? 8, visibility: posicion ? 'visible' : 'hidden' }}
      className="pointer-events-none fixed z-40 w-80 max-w-[calc(100vw-1rem)] max-h-[min(24rem,calc(100dvh-1rem))] overflow-hidden rounded-lg border bg-card p-3 text-xs text-card-foreground shadow-lg">
      <p className="font-semibold">{titulo}</p>
      {grupos.map((g) => (
        <div key={g.nombre} className="mt-2">
          <p className="font-medium">{g.nombre}: {g.tareas.length}</p>
          <ul className="mt-1 space-y-1 text-muted-foreground">
            {g.tareas.slice(0, 3).map((t) => <li key={t.id} className="line-clamp-2 break-words">• {t.titulo_tarea}</li>)}
          </ul>
          {g.tareas.length > 3 && <p className="mt-1 text-muted-foreground">Y {g.tareas.length - 3} más.</p>}
        </div>
      ))}
      <p className="mt-2 text-primary">Haz clic para ver las tareas.</p>
    </div>, document.body)}
  </>;
}
