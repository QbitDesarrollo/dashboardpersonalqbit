import { MapPin, Video } from 'lucide-react';
import { estadoReunion, etiquetaRelativa, minutosTranscurridos, progresoReunion, type Reunion } from '@/lib/reuniones';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';

const plataformas = { meet: 'Meet', zoom: 'Zoom', teams: 'Teams', otro: 'Videollamada' };
const acentos = { meet: 'border-l-emerald-500', zoom: 'border-l-blue-500', teams: 'border-l-violet-500', otro: 'border-l-primary' };
const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-EC', {
  timeZone: 'America/Guayaquil', hour: '2-digit', minute: '2-digit', hour12: false,
});

interface Props {
  reunion: Reunion;
  now: number;
  ingreso: number | null;
  compacta: boolean;
  onEntrar: () => void;
}

export function TarjetaReunion({ reunion, now, ingreso, compacta, onEntrar }: Props) {
  const estado = estadoReunion(reunion, now);
  const enCurso = estado === 'en_curso';
  const terminada = estado === 'terminada';
  const presente = enCurso && ingreso !== null;
  const plataforma = reunion.enlace ? plataformas[reunion.enlace.plataforma] : 'Presencial';
  const Icono = reunion.enlace ? Video : MapPin;
  const etiqueta = terminada ? 'Terminada' : enCurso
    ? presente ? `Estás aquí · llevas ${minutosTranscurridos(ingreso, now)} min` : 'En curso'
    : etiquetaRelativa(reunion.start, now);
  const progreso = progresoReunion(reunion, now);

  return (
    <article aria-label={reunion.summary} className={cn(
      'relative shrink-0 overflow-hidden rounded-md border border-l-[3px] px-3 text-sm',
      reunion.enlace ? acentos[reunion.enlace.plataforma] : 'border-l-amber-500',
      compacta ? 'flex h-9 items-center gap-3' : 'flex h-[70px] items-center gap-3',
      enCurso && 'border-primary/30 bg-primary/10',
      terminada && 'text-muted-foreground bg-muted/30',
    )}>
      <div className={cn(compacta ? 'flex items-center gap-3' : 'grid gap-1')}>
        <div className="flex items-center gap-3 leading-4">
          <span className={cn('font-mono', compacta ? 'text-sm' : 'text-[13px]')}>{hora(reunion.start)}–{hora(reunion.end)}</span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground" title={reunion.ubicacion ?? undefined}>
            <Icono aria-hidden="true" className="h-3.5 w-3.5" />{plataforma}
          </span>
        </div>
        <div className="flex items-center gap-3 leading-5">
          <span className="max-w-[240px] truncate text-sm font-medium" title={reunion.summary}>{reunion.summary}</span>
          <span className={cn('flex items-center gap-1 whitespace-nowrap', compacta ? 'text-sm' : 'text-xs')}>
            {presente && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-primary motion-safe:animate-pulse" />}
            {etiqueta}
          </span>
        </div>
      </div>
      {!terminada && <a href={reunion.enlace?.url ?? reunion.htmlLink} target="_blank" rel="noopener noreferrer"
        onClick={reunion.enlace ? onEntrar : undefined}
        className={cn(buttonVariants({ variant: enCurso ? 'default' : 'outline', size: 'sm' }), 'h-7 shrink-0 px-2 text-xs')}>
        {reunion.enlace ? 'Entrar' : 'Ver en Calendar'}
      </a>}
      {enCurso && <div role="progressbar" aria-label="Tiempo de reunión transcurrido" aria-valuemin={0} aria-valuemax={100}
        aria-valuenow={Math.round(progreso * 100)} className="absolute inset-x-0 bottom-0 h-0.5 bg-primary/10">
        <div className="h-full bg-primary" style={{ width: `${progreso * 100}%` }} />
      </div>}
    </article>
  );
}
