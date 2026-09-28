import { Link } from 'react-router-dom';
import { Presentation, X } from 'lucide-react';
import type { MinutaVista } from '@/lib/minutasApi';
import { fechaCorta } from '@/lib/minutas';
import { Button } from '@/components/ui/button';

interface Props {
  minuta: MinutaVista;
  listos: number;
  total: number;
  /** Where "Salir" goes; the client link has no way out into Tiusdei. */
  salirA?: string;
}

/** Top bar: which minuta is on screen, how much is ready and the way out. */
export function EncabezadoPresentacion({ minuta, listos, total, salirA }: Props) {
  const avance = total > 0 ? Math.round((listos / total) * 100) : 0;
  return (
    <header className="sticky top-0 z-20 border-b border-border/60 bg-card/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6">
        <div className="gradient-primary grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white shadow-sm">
          <Presentation className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            {minuta.brand_nombre} · {minuta.codigo} · {fechaCorta(minuta.fecha)} {minuta.fecha.slice(0, 4)}
          </p>
          <p className="truncate text-base font-semibold sm:text-lg">{minuta.titulo}</p>
        </div>
        <div className="hidden w-52 shrink-0 md:block">
          <div className="flex items-baseline justify-between text-xs">
            <span className="text-muted-foreground">Avance</span>
            <span className="font-medium">{`${listos} de ${total} listos`}</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="gradient-primary h-full rounded-full transition-all" style={{ width: `${avance}%` }} />
          </div>
        </div>
        {salirA && (
          <Button variant="outline" size="sm" asChild>
            <Link to={salirA} aria-label="Salir de la presentación">
              <X className="h-4 w-4" /><span className="hidden sm:inline">Salir</span>
            </Link>
          </Button>
        )}
      </div>
    </header>
  );
}
