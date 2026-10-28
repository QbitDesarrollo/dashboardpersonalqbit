import { fechaReunion, type Reunion, type VistaReuniones } from '@/lib/reuniones';
import { horaDia } from '@/lib/miDia';

export function CalendarioReuniones({ dias, eventos, vista }: { dias: (string | null)[]; eventos: Reunion[]; vista: VistaReuniones }) {
  return <div role="grid" aria-label="Calendario de reuniones" className={vista === 'Mes' ? 'grid grid-cols-7 gap-1' : 'space-y-2'}>
    {vista === 'Mes' && ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map(d => <div role="columnheader" key={d} className="text-center text-[10px] text-muted-foreground">{d}</div>)}
    {dias.map((dia, i) => <div role="row" key={dia ?? `vacio-${i}`} className="min-w-0">
      <div role="gridcell" className={dia ? 'min-h-16 rounded border p-1 text-xs' : ''}>
        {dia && <>
          <p className="font-medium text-muted-foreground">{vista === 'Mes' ? Number(dia.slice(-2)) : new Date(`${dia}T12:00:00-05:00`).toLocaleDateString('es-EC', { timeZone: 'America/Guayaquil', weekday: 'short', day: 'numeric', month: 'short' })}</p>
          {eventos.filter(e => fechaReunion(e.start) === dia).map(e => <a key={e.id} href={e.htmlLink} target="_blank" rel="noopener noreferrer" title={`${e.summary} · ${horaDia(e.start)}`}
            className="block truncate rounded bg-primary/10 px-1 py-0.5 mt-1 text-[10px] text-primary">{horaDia(e.start)} {e.summary}</a>)}
        </>}
      </div>
    </div>)}
  </div>;
}
