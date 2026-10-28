import type { ReactNode } from 'react';
import { ArrowUpRight, Check, Pause, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { TimerReadout } from '@/components/tasks/TimerReadout';
import { entregaFlotante, subtareaLista } from '@/lib/ventanaFlotante';
import { estadoReunion, fechaReunion, type Reunion } from '@/lib/reuniones';
import type { DetalleFlotante } from './useDatosFlotantes';
import { ReunionFlotante } from './ReunionFlotante';

interface Props {
  marca: string;
  titulo: string;
  prioridad?: string;
  entrega?: string;
  now: number;
  tiempo: string;
  segundos: number;
  estimacion: number;
  subtareas?: DetalleFlotante[];
  reuniones?: Reunion[];
  pending: boolean;
  error?: string;
  descripcion?: string;
  personas?: string;
  onPause: () => void;
  onFinish: () => void;
}
const prioridades: Record<string, string> = {
  alta: 'bg-destructive',
  media: 'bg-warning',
  baja: 'bg-success',
};

function Ayuda({ texto, children }: { texto: string; children: ReactNode }) {
  return <Tooltip><TooltipTrigger asChild>{children}</TooltipTrigger><TooltipContent side="top" className="px-2 py-1 text-[11px]">{texto}</TooltipContent></Tooltip>;
}

/** Presentation shared by the PiP portal and the isolated visual harness. */
export function VistaFlotante(props: Props) {
  const entrega = props.entrega ? entregaFlotante(props.entrega, props.now) : '';
  const reunion = props.reuniones?.find(r => estadoReunion(r, props.now) === 'en_curso')
    ?? props.reuniones?.find(r => estadoReunion(r, props.now) === 'proxima' && fechaReunion(r.start) === fechaReunion(props.now));
  return (
    <TooltipProvider delayDuration={300}>
      <article aria-label="Tarea en ventana flotante" className="flex min-h-full flex-col justify-center bg-background p-3 text-foreground">
        <div className="mx-auto flex w-full max-w-sm flex-col gap-2">
          <header className="flex h-6 items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
              <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-emerald-500" />
              <span className="truncate" title={props.marca}>{props.marca}</span>
            </div>
            <Ayuda texto="Ir a Tiusdei"><Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-muted-foreground [&_svg]:size-3.5" aria-label="Ir a Tiusdei" onClick={() => window.focus()}><ArrowUpRight aria-hidden="true" /></Button></Ayuda>
          </header>
          <h1 title={props.titulo} className="truncate text-[13px] font-medium leading-tight">{props.titulo}</h1>
          {props.error ? <p role="alert" title={props.error} className="truncate text-[11px] text-destructive">{props.error}</p> :
            <div className="flex min-w-0 items-center gap-1 whitespace-nowrap text-[11px] text-muted-foreground">
              {props.prioridad && <><span aria-hidden="true" className={`size-1 shrink-0 rounded-full ${prioridades[props.prioridad] ?? 'bg-muted-foreground'}`} /><span className="capitalize">{props.prioridad}</span></>}
              {props.prioridad && entrega && <span>·</span>}
              {entrega && <span className={`truncate ${entrega.startsWith('Vencida') ? 'text-destructive' : ''}`} title={entrega}>{entrega}</span>}
              {!!props.subtareas?.length && <span className="shrink-0">· {props.subtareas.filter(subtareaLista).length}/{props.subtareas.length} subtareas</span>}
            </div>}
          {props.descripcion && <p data-testid="descripcion-flotante" className="line-clamp-2 break-words text-[12px] leading-[18px] text-muted-foreground">{props.descripcion}</p>}
          {props.personas && <div data-testid="personas-flotante" className="flex min-w-0 items-center gap-1.5 text-[11px] leading-[14px] text-muted-foreground">
            <UserRound aria-hidden="true" className="size-3 shrink-0" /><span className="truncate" title={props.personas}>{props.personas}</span>
          </div>}
          <div className="flex items-center justify-between gap-2 border-t border-border/50 pt-2">
            <div className="min-w-0">
              <TimerReadout time={props.tiempo} running large />
              {props.estimacion > 0 && <div className="space-y-1">
                <p className="truncate text-[10px] leading-tight text-muted-foreground">{Math.floor(props.segundos / 3600)}h {Math.floor(props.segundos % 3600 / 60)}m / {props.estimacion}h</p>
                <Progress aria-label="Tiempo sobre estimación" value={Math.min(100, Math.round(props.segundos / (props.estimacion * 36)))} className="h-0.5" />
              </div>}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Ayuda texto="Pausar"><Button variant="outline" size="icon" className="h-8 w-8 rounded-full border-border/60" aria-label="Pausar" disabled={props.pending} onClick={props.onPause}><Pause aria-hidden="true" /></Button></Ayuda>
              <Ayuda texto="Terminar"><Button size="icon" className="h-8 w-8 rounded-full" aria-label="Terminar" disabled={props.pending} onClick={props.onFinish}><Check aria-hidden="true" /></Button></Ayuda>
            </div>
          </div>
          {reunion && <ReunionFlotante reunion={reunion} now={props.now} />}
        </div>
      </article>
    </TooltipProvider>
  );
}
