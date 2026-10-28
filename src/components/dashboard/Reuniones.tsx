import { useState } from 'react';
import { indicacionPersona, type PersonaDia } from './persona';
import { CalendarDays, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { avisoCalendarOculto, ocultarAvisoCalendar } from '@/components/integraciones/avisoCalendar';
import { TarjetaReunion } from '@/components/reuniones/TarjetaReunion';
import { CalendarioDialog } from '@/components/reuniones/CalendarioDialog';
import { useReunionesVivas } from '@/components/reuniones/useReunionesVivas';
import { etiquetaDia, siguienteReunion, sumarDias } from '@/lib/agendaReuniones';
import { calendarioReuniones, estadoReunion, fechaReunion, leerIngreso, registrarIngreso, type Reunion } from '@/lib/reuniones';

export function Reuniones({ persona, puedeFiltrar = false }: { persona: PersonaDia; puedeFiltrar?: boolean }) {
  const userId = persona.esPropia ? undefined : persona.id;
  const titulo = persona.esPropia ? 'Agenda de hoy' : `Agenda de ${persona.nombre}`;
  const [calendario, setCalendario] = useState(false);
  const [verTerminadas, setVerTerminadas] = useState(false);
  const [oculto, setOculto] = useState(() => persona.esPropia && avisoCalendarOculto(Date.now(), localStorage));
  const [ingresos, setIngresos] = useState<Record<string, number>>({});
  const rango = calendarioReuniones(Date.now(), 'Hoy');
  const finConsulta = `${sumarDias(rango.inicio, 31)}T23:59:59.999-05:00`;
  const { now, estado, eventos } = useReunionesVivas(rango.inicio, finConsulta, userId);
  const conectar = `${import.meta.env.VITE_API_URL || window.location.origin}/api/auth/google?mode=connect`;
  const ingreso = (r: Reunion) => persona.esPropia ? leerIngreso(localStorage, r) ?? ingresos[`${r.id}:${r.start}`] ?? null : null;
  const entrar = (r: Reunion) => {
    if (!persona.esPropia) return;
    const primero = ingreso(r) ?? Date.now();
    registrarIngreso(localStorage, r, primero);
    setIngresos(prev => ({ ...prev, [`${r.id}:${r.start}`]: primero }));
  };
  const tarjeta = (r: Reunion) => <TarjetaReunion key={`${r.id}:${r.start}`} reunion={r} now={now} ingreso={ingreso(r)} compacta={false} ampliada onEntrar={() => entrar(r)} />;
  const visibles = eventos.filter(r => fechaReunion(r.start) === fechaReunion(now));
  const actuales = visibles.filter(r => estadoReunion(r, now) === 'en_curso');
  const proximas = visibles.filter(r => estadoReunion(r, now) === 'proxima');
  const terminadas = visibles.filter(r => estadoReunion(r, now) === 'terminada');
  const siguiente = siguienteReunion(eventos, now);
  // Con el día terminado, lo útil es ver el siguiente día con reuniones (máximo 4).
  const diaSiguiente = siguiente ? fechaReunion(siguiente.start) : null;
  const delSiguiente = diaSiguiente ? eventos.filter(r => fechaReunion(r.start) === diaSiguiente).slice(0, 4) : [];
  const compacto = estado === 'sin_token' && oculto && avisoCalendarOculto(now, localStorage);

  return <section aria-label={titulo} className="h-full min-w-0"><Card className="glass-card h-full min-w-0">
    <CardHeader className="pb-3"><div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-1"><CardTitle className="text-base">{titulo}</CardTitle>
        {persona.esPropia && actuales.length > 0 && <TooltipProvider><Tooltip><TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Acerca de Estás aquí"><Info className="h-3.5 w-3.5" /></Button>
        </TooltipTrigger><TooltipContent className="max-w-xs">
          Estás aquí solo aparece si entras desde Tiusdei; no confirma asistencia. Horas de Ecuador.
        </TooltipContent></Tooltip></TooltipProvider>}
      </div>
      {(estado === 'conectado' || estado === 'cargando') && <Button variant="outline" size="sm" onClick={() => setCalendario(true)}><CalendarDays className="h-4 w-4" />Ver calendario</Button>}
    </div><p className="text-xs text-muted-foreground">{persona.esPropia ? `Tu agenda personal${puedeFiltrar ? indicacionPersona : ''}` : `Reuniones de hoy de ${persona.nombre}`}</p></CardHeader>
    <CardContent className="space-y-3">
      {compacto && <p className="text-xs text-muted-foreground">Google Calendar no conectado</p>}
      {estado === 'cargando' && <p className="text-sm text-muted-foreground">Cargando reuniones…</p>}
      {estado === 'error' && <p className="text-sm text-muted-foreground">No se pudieron cargar las reuniones. Volveremos a intentar al actualizar.</p>}
      {estado === 'sin_token' && !persona.esPropia && <p className="text-sm text-muted-foreground">{persona.nombre} no tiene Google Calendar conectado</p>}
      {estado === 'sin_permiso' && !persona.esPropia && <p className="text-sm text-muted-foreground">{persona.nombre} no dio permiso de Google Calendar</p>}
      {estado === 'sin_token' && persona.esPropia && !compacto && <div className="text-sm space-y-3">
        <p>Conecta tu Google Calendar para ver tus reuniones aquí</p>
        <div className="flex items-center gap-3"><a className="text-primary font-medium" href={conectar}>Conectar</a><Button size="sm" variant="ghost" onClick={() => { ocultarAvisoCalendar(Date.now(), localStorage); setOculto(true); }}>Ahora no</Button></div>
      </div>}
      {estado === 'sin_permiso' && persona.esPropia && <div className="text-sm space-y-3"><p>Falta el permiso de Google Calendar</p><a className="text-primary font-medium" href={conectar}>Dar permiso</a></div>}
      {estado === 'conectado' && <>
        {actuales.length > 0 && <div className="space-y-2"><h3 className="text-xs font-semibold text-primary">Ahora</h3>{actuales.map(tarjeta)}</div>}
        {proximas.map(tarjeta)}
        {actuales.length === 0 && proximas.length === 0 && <p className="text-sm text-muted-foreground">{persona.esPropia ? 'Ya no te quedan reuniones hoy' : `${persona.nombre} ya no tiene reuniones hoy`}</p>}
        {actuales.length === 0 && proximas.length === 0 && diaSiguiente && (
          <section aria-label={etiquetaDia(diaSiguiente, now)} className="space-y-2">
            <h3 className="text-xs font-semibold text-foreground">{etiquetaDia(diaSiguiente, now)}</h3>
            {delSiguiente.map(tarjeta)}
          </section>
        )}
        {terminadas.length > 0 && <div><button type="button" aria-expanded={verTerminadas} onClick={() => setVerTerminadas(v => !v)} className="text-xs text-muted-foreground py-2 focus-visible:ring-2 focus-visible:ring-ring">{terminadas.length} terminadas</button>{verTerminadas && <div className="space-y-2">{terminadas.map(tarjeta)}</div>}</div>}
      </>}
    </CardContent>
  </Card>{calendario && <CalendarioDialog userId={userId} nombrePersona={persona.esPropia ? undefined : persona.nombre} now={now} tarjeta={tarjeta} onCerrar={() => setCalendario(false)} />}</section>;
}
