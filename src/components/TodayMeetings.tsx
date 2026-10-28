import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Info } from 'lucide-react';
import * as api from '@/lib/apiClient';
import { duracionTotal, fechaReunion, leerIngreso, registrarIngreso, type Reunion } from '@/lib/reuniones';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { TarjetaReunion } from '@/components/reuniones/TarjetaReunion';
import { cn } from '@/lib/utils';

const VISTA = 'tiusdei:reuniones:vista';

/** Franja de reuniones reales de hoy; el reloj local no necesita consultas por minuto. */
export function TodayMeetings() {
  const [meetings, setMeetings] = useState<Reunion[]>([]);
  const [now, setNow] = useState(Date.now);
  const [ingresos, setIngresos] = useState<Record<string, number>>({});
  const [compacta, setCompacta] = useState(() => {
    try { return localStorage.getItem(VISTA) === 'compacta'; } catch { return false; }
  });
  const scroll = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    let lastFetch = -Infinity;
    let requestId = 0;
    const load = () => {
      const instante = Date.now();
      if (instante - lastFetch < 60000) return;
      lastFetch = instante;
      const id = ++requestId;
      const dia = fechaReunion(instante);
      api.getGoogleCalendarEvents(`${dia}T00:00:00-05:00`, `${dia}T23:59:59.999-05:00`)
        .then((r: { events?: Reunion[] }) => {
          if (!alive || id !== requestId) return;
          setMeetings((r.events ?? []).filter(e => e.es_reunion === true).sort((a, b) => a.start.localeCompare(b.start)));
        })
        .catch(() => { /* Google no conectado: conservar la franja no invasiva. */ });
    };
    const volver = () => {
      if (document.visibilityState === 'hidden') return;
      setNow(Date.now());
      load();
    };
    load();
    const reloj = setInterval(() => setNow(Date.now()), 60000);
    const refresco = setInterval(load, 5 * 60000);
    window.addEventListener('focus', volver);
    document.addEventListener('visibilitychange', volver);
    return () => {
      alive = false;
      clearInterval(reloj);
      clearInterval(refresco);
      window.removeEventListener('focus', volver);
      document.removeEventListener('visibilitychange', volver);
    };
  }, []);

  const cambiarVista = (valor: boolean) => {
    setCompacta(valor);
    try { localStorage.setItem(VISTA, valor ? 'compacta' : 'tarjetas'); } catch { /* Vista en memoria. */ }
  };
  const ingreso = (reunion: Reunion) => {
    try { return leerIngreso(localStorage, reunion) ?? ingresos[`${reunion.id}:${reunion.start}`] ?? null; }
    catch { return ingresos[`${reunion.id}:${reunion.start}`] ?? null; }
  };
  const entrar = (reunion: Reunion) => {
    const instante = Date.now();
    const primero = ingreso(reunion) ?? instante;
    try { registrarIngreso(localStorage, reunion, primero); } catch { /* Ingreso en memoria. */ }
    setIngresos(prev => ({ ...prev, [`${reunion.id}:${reunion.start}`]: primero }));
    setNow(instante);
  };

  if (meetings.length === 0) return null;

  return (
    <section aria-label="Reuniones de hoy" className={cn('flex min-w-0 items-center gap-1 rounded-lg border bg-muted/20 px-2', compacta ? 'h-12' : 'h-[84px]')}>
      <span className="max-w-[180px] shrink-0 text-xs font-medium text-muted-foreground">
        Tu día · {meetings.length} {meetings.length === 1 ? 'reunión' : 'reuniones'} · {duracionTotal(meetings)}
      </span>
      <Button variant="ghost" size="icon" className="h-7 w-6 shrink-0" aria-label="Reuniones anteriores"
        onClick={() => scroll.current?.scrollBy({ left: -300, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })}>
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <div ref={scroll} tabIndex={0} aria-label="Todas las reuniones de hoy" className="flex min-w-0 flex-1 gap-2 overflow-x-auto [scrollbar-width:none]">
        {meetings.map(reunion => <TarjetaReunion key={reunion.id} reunion={reunion} now={now} ingreso={ingreso(reunion)} compacta={compacta} onEntrar={() => entrar(reunion)} />)}
      </div>
      <Button variant="ghost" size="icon" className="h-7 w-6 shrink-0" aria-label="Reuniones siguientes"
        onClick={() => scroll.current?.scrollBy({ left: 300, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })}>
        <ChevronRight className="h-4 w-4" />
      </Button>
      <div className="flex shrink-0 items-center gap-1">
        <div role="group" aria-label="Vista de reuniones" className="flex rounded-md border">
          <Button variant={compacta ? 'ghost' : 'secondary'} size="sm" className="h-7 px-2 text-xs" aria-pressed={!compacta} onClick={() => cambiarVista(false)}>Tarjetas</Button>
          <Button variant={compacta ? 'secondary' : 'ghost'} size="sm" className="h-7 px-2 text-xs" aria-pressed={compacta} onClick={() => cambiarVista(true)}>Compacta</Button>
        </div>
        <TooltipProvider><Tooltip><TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Acerca de Estás aquí"><Info className="h-3.5 w-3.5" /></Button>
        </TooltipTrigger><TooltipContent className="max-w-xs">
          “Estás aquí” aparece solo si entras desde Tiusdei y la reunión está en curso. No confirma tu asistencia en la videollamada.
        </TooltipContent></Tooltip></TooltipProvider>
      </div>
    </section>
  );
}
