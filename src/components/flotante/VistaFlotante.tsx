import { useCallback, useState, type ReactNode } from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { ArrowLeftRight, ArrowUpRight, Check, Pause } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Popover, PopoverTrigger } from '@/components/ui/popover';
import { TimerReadout } from '@/components/tasks/TimerReadout';
import { entregaFlotante, subtareaLista } from '@/lib/ventanaFlotante';
import { estadoReunion, type Reunion } from '@/lib/reuniones';
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
  recientes: ReactNode;
  onPause: () => void;
  onFinish: () => void;
}
const prioridades: Record<string, string> = {
  alta: 'border-destructive/20 bg-destructive/10 text-destructive',
  media: 'border-warning/25 bg-warning/10 text-warning-foreground dark:text-warning',
  baja: 'border-success/25 bg-success/10 text-success',
};

/** Presentation shared by the PiP portal and the isolated visual harness. */
export function VistaFlotante(props: Props) {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const attach = useCallback((node: HTMLElement | null) => setContainer(node?.ownerDocument.body ?? null), []);
  const entrega = props.entrega ? entregaFlotante(props.entrega, props.now) : '';
  const siguientes = props.subtareas?.filter(sub => !subtareaLista(sub));
  const reunion = props.reuniones?.find(r => estadoReunion(r, props.now) === 'en_curso')
    ?? props.reuniones?.find(r => estadoReunion(r, props.now) === 'proxima');
  return (
    <article ref={attach} aria-label="Tarea en ventana flotante" className="flex min-h-full flex-col gap-2.5 bg-background p-4 text-foreground">
      <header className="flex h-7 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-emerald-500" />
          <span className="truncate" title={props.marca}>{props.marca}</span>
        </div>
        <Button variant="ghost" size="icon" className="size-7 shrink-0 text-muted-foreground" aria-label="Ir a Tiusdei" title="Ir a Tiusdei" onClick={() => window.focus()}><ArrowUpRight /></Button>
      </header>
      <div className="space-y-2">
        <h1 title={props.titulo} className="line-clamp-2 text-[15px] font-semibold leading-snug">{props.titulo}</h1>
        {(props.prioridad || entrega) && <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {props.prioridad && <Badge variant="outline" className={`px-2 py-0 font-medium capitalize ${prioridades[props.prioridad] ?? ''}`}>{props.prioridad}</Badge>}
          {entrega && <span className={entrega.startsWith('Vencida') ? 'text-destructive' : undefined}>{entrega}</span>}
        </div>}
      </div>
      <div className="space-y-1.5">
        <div className="leading-none [&>[role=timer]]:text-[30px]"><TimerReadout time={props.tiempo} running large /></div>
        {props.estimacion > 0 && <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{Math.floor(props.segundos / 3600)}h {Math.floor(props.segundos % 3600 / 60)}m de {props.estimacion}h estimadas</p>
          <Progress aria-label="Tiempo sobre estimación" value={Math.min(100, Math.round(props.segundos / (props.estimacion * 36)))} className="h-1" />
        </div>}
      </div>
      {!!props.subtareas?.length && <p className="truncate text-xs text-muted-foreground" title={siguientes?.[0]?.titulo_tarea}>Subtareas {props.subtareas.filter(subtareaLista).length}/{props.subtareas.length}{siguientes?.[0] && ` · Siguiente: ${siguientes[0].titulo_tarea}`}</p>}
      {reunion && <ReunionFlotante reunion={reunion} now={props.now} />}
      {props.error && <p role="alert" className="text-xs text-destructive">{props.error}</p>}
      <div className="mt-auto flex flex-wrap items-center gap-2 border-t pt-3">
        <Button variant="outline" size="sm" className="h-8 gap-1.5 px-2.5 text-xs" disabled={props.pending} onClick={props.onPause}><Pause />Pausar</Button>
        <Button size="sm" className="h-8 gap-1.5 px-2.5 text-xs" disabled={props.pending} onClick={props.onFinish}><Check />Terminar</Button>
        <Popover>
          <PopoverTrigger asChild><Button variant="ghost" size="sm" className="ml-auto h-8 gap-1 px-1 text-xs text-muted-foreground" disabled={props.pending}><ArrowLeftRight />Cambiar tarea</Button></PopoverTrigger>
          {/* Explicit container keeps the portal and its inherited theme in the PiP document. */}
          <PopoverPrimitive.Portal container={container}>
            <PopoverPrimitive.Content side="top" align="end" sideOffset={8} aria-label="Cambiar tarea" className="z-50 max-h-52 w-72 max-w-[calc(100vw-32px)] overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg">
              {props.recientes}
            </PopoverPrimitive.Content>
          </PopoverPrimitive.Portal>
        </Popover>
      </div>
    </article>
  );
}
