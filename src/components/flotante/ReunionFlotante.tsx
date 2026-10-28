import { Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { estadoReunion, registrarIngreso, type Reunion } from '@/lib/reuniones';

export function ReunionFlotante({ reunion, now }: { reunion: Reunion; now: number }) {
  const estado = estadoReunion(reunion, now);
  if (estado === 'terminada') return null;
  const actual = estado === 'en_curso';
  const hora = new Intl.DateTimeFormat('es-EC', { timeZone: 'America/Guayaquil', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(reunion.start));
  const etiqueta = `${actual ? 'Ahora' : hora} · ${reunion.summary}`;
  return (
    <div className={`flex h-6 min-w-0 items-center gap-1.5 text-[11px] ${actual ? 'text-primary' : 'text-muted-foreground'}`}>
      <Video aria-hidden="true" className="size-3 shrink-0" />
      <span className="min-w-0 flex-1 truncate" title={etiqueta}>{etiqueta}</span>
      <Button asChild variant="link" size="sm" className="h-6 shrink-0 px-1 text-[11px]">
        <a aria-label={!reunion.enlace ? 'Ver en Calendar' : actual ? 'Entrar' : `Unirse a ${reunion.summary}`} title={reunion.enlace ? 'Entrar a la reunión' : 'Ver en Calendar'} href={reunion.enlace?.url || reunion.htmlLink} target="_blank" rel="noopener noreferrer"
          onClick={() => { if (reunion.enlace) registrarIngreso(localStorage, reunion, now); }}>
          {!reunion.enlace ? 'Ver en Calendar' : actual ? 'Entrar' : 'Unirse'}
        </a>
      </Button>
    </div>
  );
}
