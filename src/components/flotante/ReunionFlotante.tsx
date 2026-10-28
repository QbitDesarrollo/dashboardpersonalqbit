import { ArrowUpRight, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { estadoReunion, etiquetaRelativa, registrarIngreso, type Reunion } from '@/lib/reuniones';

export function ReunionFlotante({ reunion, now }: { reunion: Reunion; now: number }) {
  const estado = estadoReunion(reunion, now);
  if (estado === 'terminada') return null;
  const actual = estado === 'en_curso';
  const relativa = etiquetaRelativa(reunion.start, now);
  const etiqueta = `${actual ? 'Ahora' : relativa.charAt(0).toUpperCase() + relativa.slice(1)} · ${reunion.summary}`;
  return (
    <div className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-xs ${actual ? 'border-primary/20 bg-primary/5' : 'border-border bg-muted/30'}`}>
      <Video aria-hidden="true" className={`size-4 shrink-0 ${actual ? 'text-primary' : 'text-muted-foreground'}`} />
      <span className="min-w-0 flex-1 truncate" title={etiqueta}>{etiqueta}</span>
      <Button asChild variant={actual ? 'default' : 'ghost'} size="sm" className="h-7 shrink-0 gap-1 px-2 text-xs">
        <a aria-label={!reunion.enlace ? 'Ver en Calendar' : actual ? 'Entrar' : `Unirse a ${reunion.summary}`} title={reunion.enlace ? 'Entrar a la reunión' : 'Ver en Calendar'} href={reunion.enlace?.url || reunion.htmlLink} target="_blank" rel="noopener noreferrer"
          onClick={() => { if (reunion.enlace) registrarIngreso(localStorage, reunion, now); }}>
          {!reunion.enlace ? 'Ver en Calendar' : actual ? 'Entrar' : <ArrowUpRight />}
        </a>
      </Button>
    </div>
  );
}
