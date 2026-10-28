import { useState } from 'react';
import { Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { avisoCalendarOculto, ocultarAvisoCalendar } from '@/components/integraciones/avisoCalendar';
import { TarjetaReunion } from '@/components/reuniones/TarjetaReunion';
import { CalendarioReuniones } from '@/components/reuniones/CalendarioReuniones';
import { AgendaReuniones } from '@/components/reuniones/AgendaReuniones';
import { useReunionesVivas } from '@/components/reuniones/useReunionesVivas';
import { etiquetaPeriodo, etiquetaSiguiente, siguienteReunion, sumarDias } from '@/lib/agendaReuniones';
import { calendarioReuniones, estadoReunion, fechaReunion, leerIngreso, registrarIngreso, type Reunion, type VistaReuniones } from '@/lib/reuniones';

export function Reuniones({ userId }: { userId?: string }) {
  const [vista, setVista] = useState<VistaReuniones>('Hoy');
  const [desplazamiento, setDesplazamiento] = useState(0);
  const [seleccion, setSeleccion] = useState<{ mes: string; dia: string } | null>(null);
  const [verTerminadas, setVerTerminadas] = useState(false);
  const [oculto, setOculto] = useState(() => avisoCalendarOculto(Date.now(), localStorage));
  const [ingresos, setIngresos] = useState<Record<string, number>>({});
  const rango = calendarioReuniones(Date.now(), vista, desplazamiento);
  // Una sola consulta y el mismo polling: Hoy incluye 31 días de contexto futuro.
  const finConsulta = vista === 'Hoy' ? `${sumarDias(rango.inicio, 31)}T23:59:59.999-05:00` : rango.fin;
  const { now, estado, eventos } = useReunionesVivas(rango.inicio, finConsulta, userId);
  const conectar = `${import.meta.env.VITE_API_URL || window.location.origin}/api/auth/google?mode=connect`;
  const ingreso = (r: Reunion) => leerIngreso(localStorage, r) ?? ingresos[`${r.id}:${r.start}`] ?? null;
  const entrar = (r: Reunion) => {
    const primero = ingreso(r) ?? Date.now();
    registrarIngreso(localStorage, r, primero);
    setIngresos(prev => ({ ...prev, [`${r.id}:${r.start}`]: primero }));
  };
  const tarjeta = (r: Reunion) => <TarjetaReunion key={`${r.id}:${r.start}`} reunion={r} now={now} ingreso={ingreso(r)} compacta={false} ampliada onEntrar={() => entrar(r)} />;
  const hoy = fechaReunion(now);
  const visibles = eventos.filter(r => {
    const dia = fechaReunion(r.start);
    return dia >= rango.inicio.slice(0, 10) && dia <= rango.fin.slice(0, 10);
  });
  const actuales = visibles.filter(r => estadoReunion(r, now) === 'en_curso');
  const proximas = visibles.filter(r => estadoReunion(r, now) === 'proxima');
  const terminadas = visibles.filter(r => estadoReunion(r, now) === 'terminada');
  const siguiente = siguienteReunion(eventos, now);
  const mes = rango.inicio.slice(0, 7);
  const seleccionado = seleccion?.mes === mes ? seleccion.dia : hoy.startsWith(mes) ? hoy : visibles[0] ? fechaReunion(visibles[0].start) : rango.inicio.slice(0, 10);
  const compacto = estado === 'sin_token' && oculto && avisoCalendarOculto(now, localStorage);
  const navegar = (cantidad: number) => { setDesplazamiento(d => d + cantidad); setSeleccion(null); };

  return <section aria-label="Reuniones" className="min-w-0 h-[480px] lg:h-[520px]"><Card className="glass-card flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
    <CardHeader className="shrink-0 pb-3"><div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-1"><CardTitle className="text-base">Reuniones</CardTitle>
        <TooltipProvider><Tooltip><TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Acerca de Estás aquí"><Info className="h-3.5 w-3.5" /></Button>
        </TooltipTrigger><TooltipContent className="max-w-xs">
          Estás aquí solo aparece si entras desde Tiusdei; no confirma asistencia. Horas de Ecuador.
        </TooltipContent></Tooltip></TooltipProvider>
      </div>
      {(estado === 'conectado' || estado === 'cargando') && <div role="tablist" aria-label="Período de reuniones" className="flex rounded-md bg-muted p-0.5">
        {(['Hoy', 'Semana', 'Mes'] as const).map(v => <Button key={v} role="tab" aria-selected={vista === v} variant={vista === v ? 'secondary' : 'ghost'} size="sm" className="h-8 px-2" onClick={() => { setVista(v); setDesplazamiento(0); setSeleccion(null); }}>{v}</Button>)}
      </div>}
      {compacto && <span className="text-xs text-muted-foreground">Google Calendar no conectado</span>}
    </div>
      {vista !== 'Hoy' && (estado === 'conectado' || estado === 'cargando') && <div className="flex flex-wrap items-center gap-1 pt-2 text-xs">
        <Button size="sm" variant="ghost" className="h-7 px-2" aria-label="Período anterior" onClick={() => navegar(-1)}>‹</Button>
        <span aria-live="polite" className="flex-1 text-center font-medium">{etiquetaPeriodo(rango.inicio, rango.fin, vista)}</span>
        <Button size="sm" variant="ghost" className="h-7 px-2" aria-label="Período siguiente" onClick={() => navegar(1)}>›</Button>
        <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => { setDesplazamiento(0); setSeleccion(null); }}>Hoy</Button>
      </div>}
    </CardHeader>
    {!compacto && <CardContent key={`${vista}:${rango.inicio}`} role="region" aria-label="Contenido de reuniones" tabIndex={0} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin space-y-3">
      {estado === 'cargando' && <p className="text-sm text-muted-foreground">Cargando reuniones…</p>}
      {estado === 'error' && <p className="text-sm text-muted-foreground">No se pudieron cargar las reuniones. Volveremos a intentar al actualizar.</p>}
      {estado === 'sin_token' && <div className="rounded-lg bg-muted/40 p-4 text-sm space-y-3">
        <p>Conecta tu Google Calendar para ver tus reuniones aquí</p>
        <div className="flex items-center gap-3"><a className="text-primary font-medium" href={conectar}>Conectar</a><Button size="sm" variant="ghost" onClick={() => { ocultarAvisoCalendar(Date.now(), localStorage); setOculto(true); }}>Ahora no</Button></div>
      </div>}
      {estado === 'sin_permiso' && <div className="text-sm space-y-3"><p>Falta el permiso de Google Calendar</p><a className="text-primary font-medium" href={conectar}>Dar permiso</a></div>}
      {estado === 'conectado' && (vista === 'Hoy' ? <>
        {actuales.length > 0 && <div className="sticky top-0 z-20 bg-card space-y-2 pb-2"><h3 className="text-xs font-semibold text-primary">Ahora</h3>{actuales.map(tarjeta)}</div>}
        {proximas.map(tarjeta)}
        {actuales.length === 0 && proximas.length === 0 && <div className="rounded-lg bg-muted/30 p-4 text-sm space-y-2">
          <p className="font-medium">{terminadas.length ? 'Ya no te quedan reuniones hoy' : 'No tienes reuniones hoy'}</p>
          {siguiente && <div className="text-muted-foreground"><p className="mb-1 text-xs">Tu próxima reunión</p><p>{etiquetaSiguiente(siguiente, now)}</p></div>}
        </div>}
        {terminadas.length > 0 && <div><button type="button" aria-expanded={verTerminadas} onClick={() => setVerTerminadas(v => !v)} className="text-xs text-muted-foreground py-2 focus-visible:ring-2 focus-visible:ring-ring">{terminadas.length} terminadas</button>{verTerminadas && <div className="space-y-2">{terminadas.map(tarjeta)}</div>}</div>}
      </> : vista === 'Semana' ? <AgendaReuniones eventos={visibles} now={now} tarjeta={tarjeta} /> : <>
        <CalendarioReuniones mes={mes + '-01'} eventos={visibles} now={now} seleccionado={seleccionado} onSeleccionar={dia => setSeleccion({ mes, dia })} />
        <AgendaReuniones eventos={visibles.filter(r => fechaReunion(r.start) === seleccionado)} now={now} tarjeta={tarjeta} dia={seleccionado} />
      </>)}
    </CardContent>}
  </Card></section>;
}
