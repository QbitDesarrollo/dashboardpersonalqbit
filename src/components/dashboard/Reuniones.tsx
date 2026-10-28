import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { avisoCalendarOculto, ocultarAvisoCalendar } from '@/components/integraciones/avisoCalendar';
import { TarjetaReunion } from '@/components/reuniones/TarjetaReunion';
import { CalendarioReuniones } from '@/components/reuniones/CalendarioReuniones';
import { useReunionesVivas } from '@/components/reuniones/useReunionesVivas';
import { calendarioReuniones, estadoReunion, leerIngreso, registrarIngreso, type Reunion, type VistaReuniones } from '@/lib/reuniones';

export function Reuniones({ userId }: { userId?: string }) {
  const [vista, setVista] = useState<VistaReuniones>('Hoy');
  const [desplazamiento, setDesplazamiento] = useState(0);
  const [verTerminadas, setVerTerminadas] = useState(false);
  const [oculto, setOculto] = useState(() => avisoCalendarOculto(Date.now(), localStorage));
  const [ingresos, setIngresos] = useState<Record<string, number>>({});
  const rango = calendarioReuniones(Date.now(), vista, desplazamiento);
  const { now, estado, eventos } = useReunionesVivas(rango.inicio, rango.fin, userId);
  const conectar = `${import.meta.env.VITE_API_URL || window.location.origin}/api/auth/google?mode=connect`;
  const ingreso = (r: Reunion) => leerIngreso(localStorage, r) ?? ingresos[`${r.id}:${r.start}`] ?? null;
  const entrar = (r: Reunion) => {
    const primero = ingreso(r) ?? Date.now();
    registrarIngreso(localStorage, r, primero);
    setIngresos(prev => ({ ...prev, [`${r.id}:${r.start}`]: primero }));
  };
  const tarjeta = (r: Reunion) => <TarjetaReunion key={`${r.id}:${r.start}`} reunion={r} now={now} ingreso={ingreso(r)} compacta={false} ampliada onEntrar={() => entrar(r)} />;
  const actuales = eventos.filter(r => estadoReunion(r, now) === 'en_curso');
  const proximas = eventos.filter(r => estadoReunion(r, now) === 'proxima');
  const terminadas = eventos.filter(r => estadoReunion(r, now) === 'terminada');
  const compacto = estado === 'sin_token' && oculto && avisoCalendarOculto(now, localStorage);
  return <section aria-label="Reuniones"><Card className="glass-card">
    <CardHeader className="pb-3"><div className="flex flex-wrap items-center justify-between gap-2">
      <CardTitle className="text-base">Reuniones</CardTitle>
      {(estado === 'conectado' || estado === 'cargando') && <div role="tablist" aria-label="Período de reuniones" className="flex rounded-md bg-muted p-0.5">
        {(['Hoy', 'Semana', 'Mes'] as const).map(v => <Button key={v} role="tab" aria-selected={vista === v} variant={vista === v ? 'secondary' : 'ghost'} size="sm" onClick={() => { setVista(v); setDesplazamiento(0); }}>{v}</Button>)}
      </div>}
      {compacto && <span className="text-xs text-muted-foreground">Google Calendar no conectado</span>}
    </div></CardHeader>
    {!compacto && <CardContent className="space-y-3">
      {estado === 'cargando' && <p className="text-sm text-muted-foreground">Cargando reuniones…</p>}
      {estado === 'error' && <p className="text-sm text-muted-foreground">No se pudieron cargar las reuniones. Volveremos a intentar al actualizar.</p>}
      {estado === 'sin_token' && <div className="rounded-lg bg-muted/40 p-4 text-sm space-y-3">
        <p>Conecta tu Google Calendar para ver tus reuniones aquí</p>
        <div className="flex items-center gap-3"><a className="text-primary font-medium" href={conectar}>Conectar</a><Button size="sm" variant="ghost" onClick={() => { ocultarAvisoCalendar(Date.now(), localStorage); setOculto(true); }}>Ahora no</Button></div>
      </div>}
      {estado === 'sin_permiso' && <div className="text-sm space-y-3"><p>Falta el permiso de Google Calendar</p><a className="text-primary font-medium" href={conectar}>Dar permiso</a></div>}
      {estado === 'conectado' && (vista === 'Hoy' ? <div className="max-h-[460px] overflow-y-auto space-y-3">
        {actuales.length > 0 && <div className="sticky top-0 z-10 bg-card space-y-2 pb-2"><h3 className="text-xs font-semibold text-primary">Ahora</h3>{actuales.map(tarjeta)}</div>}
        {proximas.map(tarjeta)}
        {eventos.length === 0 && <p className="text-sm text-muted-foreground">No tienes reuniones hoy</p>}
        {terminadas.length > 0 && <div><button type="button" aria-expanded={verTerminadas} onClick={() => setVerTerminadas(v => !v)} className="text-xs text-muted-foreground py-2">{terminadas.length} terminadas</button>{verTerminadas && <div className="space-y-2">{terminadas.map(tarjeta)}</div>}</div>}
      </div> : <>
        <div className="flex justify-between items-center gap-2 text-xs">
          <Button size="sm" variant="ghost" aria-label="Período anterior" onClick={() => setDesplazamiento(d => d - 1)}>‹</Button>
          <span>{rango.inicio.slice(0, 10)} — {rango.fin.slice(0, 10)}</span>
          <Button size="sm" variant="ghost" aria-label="Período siguiente" onClick={() => setDesplazamiento(d => d + 1)}>›</Button>
        </div>
        <CalendarioReuniones dias={rango.dias} eventos={eventos} vista={vista} />
      </>)}
      <p className="text-[10px] text-muted-foreground">“Estás aquí” solo aparece si entras desde Tiusdei; no confirma asistencia. Horas de Ecuador.</p>
    </CardContent>}
  </Card></section>;
}
