import { FileText, FolderKanban } from 'lucide-react';
import type { MinutaVista, PuntoVista } from '@/lib/minutasApi';
import { cn } from '@/lib/utils';
import { IconoEstado } from '../IconoEstado';

interface Props {
  minuta: MinutaVista;
  puntos: PuntoVista[];
  actualId: string | undefined;
  onElegir: (indice: number) => void;
}

/** Side panel that stays put: the minuta summary and the index of points. */
export function PanelMinuta({ minuta, puntos, actualId, onElegir }: Props) {
  return (
    <aside className="order-last space-y-4 lg:sticky lg:top-24 lg:order-first lg:self-start">
      <section aria-labelledby="pm-resumen" className="rounded-2xl border bg-card p-5 shadow-sm">
        <h2 id="pm-resumen" className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <FileText className="h-3.5 w-3.5" />Resumen y acuerdos
        </h2>
        <p className={cn('mt-3 whitespace-pre-line text-sm leading-relaxed', !minuta.resumen && 'text-muted-foreground')}>
          {minuta.resumen || 'Esta minuta no tiene resumen.'}
        </p>
        {minuta.project_nombre && (
          <p className="mt-4 flex items-center gap-1.5 border-t pt-3 text-xs text-muted-foreground">
            <FolderKanban className="h-3.5 w-3.5" />{minuta.project_nombre}
          </p>
        )}
      </section>

      <nav aria-label="Puntos de la minuta" className="rounded-2xl border bg-card p-2 shadow-sm">
        <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Puntos</p>
        <ol className="max-h-[50vh] space-y-0.5 overflow-y-auto">
          {puntos.map((p, i) => {
            const activo = p.id === actualId;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  aria-current={activo ? 'step' : undefined}
                  onClick={() => onElegir(i)}
                  className={cn(
                    'flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors',
                    activo ? 'bg-primary/10 ring-1 ring-primary/30' : 'hover:bg-muted',
                  )}
                >
                  <IconoEstado p={p} className="mt-0.5 h-4 w-4 shrink-0" />
                  <span className="mt-px shrink-0 font-mono text-xs text-muted-foreground">{minuta.numero}.{p.numero}</span>
                  <span className={cn('line-clamp-2', activo ? 'font-semibold' : 'text-foreground/80')}>{p.titulo}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>
    </aside>
  );
}
