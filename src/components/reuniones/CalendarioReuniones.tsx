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
const SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

/** Mini calendario: solo días e indicadores; los títulos se leen en la agenda inferior. */
export function CalendarioReuniones({ mes, eventos, seleccionado, now, onSeleccionar }: Props) {
  const celdas = celdasMes(mes);
  const hoy = fechaReunion(now);
  const conteo = new Map<string, number>();
  for (const evento of eventos) {
    const dia = fechaReunion(evento.start);
    conteo.set(dia, (conteo.get(dia) ?? 0) + 1);
  }
  return <div role="group" aria-label="Calendario de reuniones" className="mb-4 rounded-lg border bg-muted/20 p-2">
    <table className="w-full table-fixed border-separate border-spacing-1" aria-label="Días del mes">
      <thead><tr>{SEMANA.map(dia => <th key={dia} scope="col" title={dia} className="h-5 text-center text-[10px] font-medium text-muted-foreground">{dia[0]}</th>)}</tr></thead>
      <tbody>{Array.from({ length: celdas.length / 7 }, (_, semana) => <tr key={semana}>
        {celdas.slice(semana * 7, semana * 7 + 7).map((dia, i) => <td key={dia ?? i} className="p-0 text-center">
          {dia && <button type="button" aria-pressed={seleccionado === dia} aria-current={dia === hoy ? 'date' : undefined}
            aria-label={`${Number(dia.slice(-2))} ${etiquetaDia(dia, now).split(' ').at(-1)} · ${conteo.get(dia) ?? 0} reuniones`}
            title={etiquetaDia(dia, now)} onClick={() => onSeleccionar(dia)}
            className={cn('relative flex h-8 w-full flex-col items-center justify-center rounded-md text-xs transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              dia === hoy && 'ring-1 ring-inset ring-primary', seleccionado === dia && 'bg-primary text-primary-foreground hover:bg-primary/90')}>
            {Number(dia.slice(-2))}
            {!!conteo.get(dia) && <span aria-hidden="true" className={cn('absolute bottom-0.5 h-1 w-1 rounded-full bg-primary', seleccionado === dia && 'bg-primary-foreground')} />}
          </button>}
        </td>)}
      </tr>)}</tbody>
    </table>
  </div>;
}
