import { MapPin, Video } from 'lucide-react';
import { celdasMes, etiquetaDia } from '@/lib/agendaReuniones';
import { fechaReunion, type Reunion } from '@/lib/reuniones';
import { cn } from '@/lib/utils';

interface Props {
  mes: string;
  eventos: Reunion[];
  seleccionado: string;
  now: number;
  onSeleccionar: (dia: string) => void;
}
const SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-EC', { timeZone: 'America/Guayaquil', hour: '2-digit', minute: '2-digit', hour12: false });

/** Mes de ancho legible; el excedente abre la lista completa del día. */
export function CalendarioReuniones({ mes, eventos, seleccionado, now, onSeleccionar }: Props) {
  const celdas = celdasMes(mes);
  const hoy = fechaReunion(now);
  return <div role="group" aria-label="Calendario de reuniones" className="mb-4 min-w-[1050px] overflow-hidden rounded-lg border">
    <table className="w-full table-fixed border-collapse" aria-label="Días del mes">
      <thead><tr>{SEMANA.map(dia => <th key={dia} scope="col" className="border-b bg-muted/40 py-2 text-center text-xs font-medium text-muted-foreground">{dia}</th>)}</tr></thead>
      <tbody>{Array.from({ length: celdas.length / 7 }, (_, semana) => <tr key={semana}>
        {celdas.slice(semana * 7, semana * 7 + 7).map((dia, i) => {
          const reuniones = eventos.filter(r => fechaReunion(r.start) === dia);
          return <td key={dia ?? i} className={cn('h-28 min-w-[140px] border-b border-r p-2 align-top', !dia && 'bg-muted/20', dia === hoy && 'bg-primary/5', dia === seleccionado && 'ring-1 ring-inset ring-primary')}>
            {dia && <>
              <button type="button" aria-pressed={seleccionado === dia} aria-current={dia === hoy ? 'date' : undefined}
                aria-label={`${etiquetaDia(dia, now)} · ${reuniones.length} reuniones`} onClick={() => onSeleccionar(dia)}
                className={cn('mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring', dia === hoy && 'bg-primary text-primary-foreground hover:bg-primary/90')}>
                {Number(dia.slice(-2))}
              </button>
              <div className="space-y-1">{reuniones.slice(0, 3).map(reunion => <button type="button" key={`${reunion.id}:${reunion.start}`} onClick={() => onSeleccionar(dia)}
                title={`${hora(reunion.start)} ${reunion.summary}`} className="flex w-full min-w-0 items-center gap-1 rounded bg-muted/60 px-1 py-1 text-left text-[11px] hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">
                {reunion.enlace ? <Video className="h-3 w-3 shrink-0 text-primary" /> : <MapPin className="h-3 w-3 shrink-0" />}
                <span className="shrink-0 font-mono">{hora(reunion.start)}</span><span className="truncate">{reunion.summary}</span>
              </button>)}</div>
              {reuniones.length > 3 && <button type="button" onClick={() => onSeleccionar(dia)} className="mt-1 rounded text-xs font-medium text-primary focus-visible:ring-2 focus-visible:ring-ring">+{reuniones.length - 3} más</button>}
            </>}
          </td>;
        })}
      </tr>)}</tbody>
    </table>
  </div>;
}
