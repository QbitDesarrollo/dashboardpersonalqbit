import type { ReactNode } from 'react';
import { CalendarDays, CheckCircle2, Hourglass } from 'lucide-react';
import type { Punto } from '@/lib/minutasApi';
import { estadoCliente, fechaCorta } from '@/lib/minutas';
import { cn } from '@/lib/utils';
import { TONO } from '../tonos';
import { EvidenciasPresentadas } from './EvidenciasPresentadas';
import { NotasPunto } from './NotasPunto';

interface Props {
  punto: Punto;
  codigo: string;
  /** What the client can decide, shown at the bottom of the card. */
  acciones?: ReactNode;
}

/** One point on screen, in the client's language: what was asked, what was done and the evidence. */
export function PuntoPresentado({ punto, codigo, acciones }: Props) {
  const estado = estadoCliente(punto);
  const hayAvance = !!punto.resolucion || punto.evidencias.length > 0;
  return (
    <article className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="gradient-primary h-1.5" aria-hidden />
      <div className="space-y-7 p-6 sm:p-8">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-muted-foreground">{codigo}</span>
            <span className={cn('rounded-full px-2.5 py-0.5 font-medium', TONO[estado.tono])}>{estado.texto}</span>
            {punto.fecha_compromiso && (
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <CalendarDays className="h-3.5 w-3.5" />Compromiso: {fechaCorta(punto.fecha_compromiso)}
              </span>
            )}
          </div>
          <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl">{punto.titulo}</h1>
          {punto.descripcion && <p className="whitespace-pre-line text-lg leading-relaxed text-muted-foreground">{punto.descripcion}</p>}
        </div>

        {hayAvance ? (
          <section className="space-y-4 rounded-xl border border-primary/20 bg-primary/5 p-5">
            <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
              <CheckCircle2 className="h-4 w-4" />{punto.responsable_cliente ? 'Qué llegó' : 'Qué se hizo'}
            </h2>
            {punto.resolucion && <p className="whitespace-pre-line text-lg leading-relaxed">{punto.resolucion}</p>}
            <EvidenciasPresentadas evidencias={punto.evidencias} />
          </section>
        ) : (
          <p className="flex items-center gap-2 rounded-xl border border-dashed px-5 py-4 text-sm text-muted-foreground">
            <Hourglass className="h-4 w-4 shrink-0" />
            {punto.responsable_cliente ? 'Cuando nos lo envíes, lo marcamos como recibido.' : 'Todavía no hay avances para mostrar en este punto.'}
          </p>
        )}

        <NotasPunto notas={punto.notas} />
      </div>
      {acciones && <div className="border-t bg-muted/30 px-6 py-4 sm:px-8">{acciones}</div>}
    </article>
  );
}
