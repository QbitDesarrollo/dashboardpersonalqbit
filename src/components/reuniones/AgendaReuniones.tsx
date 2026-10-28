import type { ReactNode } from 'react';
import { agruparPorDia, etiquetaDia } from '@/lib/agendaReuniones';
import { fechaReunion, type Reunion } from '@/lib/reuniones';
import { cn } from '@/lib/utils';

interface Props {
  eventos: Reunion[];
  now: number;
  tarjeta: (reunion: Reunion) => ReactNode;
  dia?: string;
}

export function AgendaReuniones({ eventos, now, tarjeta, dia }: Props) {
  const grupos = agruparPorDia(eventos);
  const hoy = fechaReunion(now);
  return <section aria-label={dia ? 'Agenda del día' : 'Agenda semanal'} className="space-y-3">
    {grupos.length === 0 && <div className="py-5 text-sm text-muted-foreground">
      {dia && <h4 className="mb-2 font-medium">{etiquetaDia(dia, now)}</h4>}
      <p>{dia ? 'Sin reuniones este día' : 'Sin reuniones esta semana'}</p>
    </div>}
    {grupos.map(grupo => <section key={grupo.dia} className={cn('space-y-2 rounded-lg', grupo.dia === hoy && 'bg-primary/5', grupo.dia < hoy && 'text-muted-foreground')}>
      <h4 className={cn('sticky top-0 z-10 border-b bg-card px-2 py-2 text-xs font-semibold', grupo.dia === hoy && 'text-primary border-primary/20')}>
        {etiquetaDia(grupo.dia, now)}
      </h4>
      <div className="space-y-2">{grupo.reuniones.map(tarjeta)}</div>
    </section>)}
  </section>;
}
