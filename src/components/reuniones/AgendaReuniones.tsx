import type { ReactNode } from 'react';
import { agruparPorDia, etiquetaDia } from '@/lib/agendaReuniones';
import { fechaReunion, type Reunion } from '@/lib/reuniones';
import { cn } from '@/lib/utils';

interface Props {
  eventos: Reunion[];
  now: number;
  tarjeta: (reunion: Reunion) => ReactNode;
  dia?: string;
  dias?: string[];
}

export function AgendaReuniones({ eventos, now, tarjeta, dia, dias }: Props) {
  const agrupados = agruparPorDia(eventos);
  const grupos = dias ? dias.map(dia => ({ dia, reuniones: agrupados.find(g => g.dia === dia)?.reuniones ?? [] })) : agrupados;
  const hoy = fechaReunion(now);
  return <section aria-label={dia ? 'Agenda del día' : 'Agenda semanal'} className="space-y-3">
    {eventos.length === 0 && <p className="py-3 text-sm text-muted-foreground">{dia ? 'Sin reuniones este día' : 'Sin reuniones esta semana'}</p>}
    <div className={cn(dias ? 'grid min-w-[1050px] grid-cols-7 gap-2' : 'space-y-3')}>
      {grupos.map(grupo => <section key={grupo.dia} className={cn('min-w-0 rounded-lg border bg-muted/10', grupo.dia === hoy && 'border-primary/40 bg-primary/5', grupo.dia < hoy && 'text-muted-foreground')}>
        <h4 className={cn('border-b px-3 py-3 text-xs font-semibold', grupo.dia === hoy && 'text-primary border-primary/20')}>
          {etiquetaDia(grupo.dia, now)}
        </h4>
        <div className="space-y-2 p-2">{grupo.reuniones.map(tarjeta)}</div>
      </section>)}
    </div>
  </section>;
}
