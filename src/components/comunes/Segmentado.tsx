import { useRef, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Props<T extends string> {
  etiqueta: string;
  valor: T;
  opciones: { valor: T; etiqueta: ReactNode }[];
  onCambiar: (valor: T) => void;
  className?: string;
}

/** Selector compartido: selección automática y foco circular con las flechas. */
export function Segmentado<T extends string>({ etiqueta, valor, opciones, onCambiar, className }: Props<T>) {
  const botones = useRef<(HTMLButtonElement | null)[]>([]);
  return <div role="tablist" aria-label={etiqueta} className={cn('inline-flex max-w-full gap-1 overflow-x-auto rounded-lg bg-muted/50 p-1', className)}>
    {opciones.map((opcion, indice) => <Button key={opcion.valor} ref={elemento => { botones.current[indice] = elemento; }}
      type="button" role="tab" aria-selected={valor === opcion.valor} tabIndex={valor === opcion.valor ? 0 : -1}
      variant={valor === opcion.valor ? 'default' : 'ghost'} size="sm" className="shrink-0"
      onClick={() => onCambiar(opcion.valor)} onKeyDown={evento => {
        const destino = evento.key === 'Home' ? 0 : evento.key === 'End' ? opciones.length - 1
          : evento.key === 'ArrowRight' ? (indice + 1) % opciones.length
            : evento.key === 'ArrowLeft' ? (indice - 1 + opciones.length) % opciones.length : null;
        if (destino === null) return;
        evento.preventDefault(); onCambiar(opciones[destino].valor); botones.current[destino]?.focus();
      }}>{opcion.etiqueta}</Button>)}
  </div>;
}
