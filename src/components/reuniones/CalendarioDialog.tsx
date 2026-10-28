import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Segmentado } from '@/components/comunes/Segmentado';
import { calendarioReuniones, fechaReunion, type Reunion } from '@/lib/reuniones';
import { etiquetaPeriodo } from '@/lib/agendaReuniones';
import { useReunionesVivas } from './useReunionesVivas';
import { AgendaReuniones } from './AgendaReuniones';
import { CalendarioReuniones } from './CalendarioReuniones';

interface Props {
  userId?: string;
  nombrePersona?: string;
  now: number;
  tarjeta: (reunion: Reunion) => ReactNode;
  onCerrar: () => void;
}

/** Solo se monta al abrir: la navegación del calendario no altera la agenda personal. */
export function CalendarioDialog({ userId, nombrePersona, now, tarjeta, onCerrar }: Props) {
  const [vista, setVista] = useState<'Semana' | 'Mes'>('Semana');
  const [desplazamiento, setDesplazamiento] = useState(0);
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const listaDia = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!seleccionado) return;
    listaDia.current?.focus({ preventScroll: true });
    listaDia.current?.scrollIntoView?.({ block: 'nearest' });
  }, [seleccionado]);
  const rango = calendarioReuniones(now, vista, desplazamiento);
  const { eventos, estado } = useReunionesVivas(rango.inicio, rango.fin, userId);
  const visibles = eventos.filter(r => fechaReunion(r.start) >= rango.inicio.slice(0, 10) && fechaReunion(r.start) <= rango.fin.slice(0, 10));
  const navegar = (cantidad: number) => { setDesplazamiento(d => d + cantidad); setSeleccionado(null); };
  return <Dialog open onOpenChange={abierto => { if (!abierto) onCerrar(); }}>
    <DialogContent className="max-w-6xl h-[85vh] flex min-h-0 flex-col overflow-hidden">
      <DialogHeader className="pr-7">
        <DialogTitle>Calendario</DialogTitle>
        <DialogDescription>{nombrePersona ? `Reuniones de ${nombrePersona}` : 'Tus reuniones'} · hora de Ecuador</DialogDescription>
      </DialogHeader>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmentado etiqueta="Vista del calendario" valor={vista} opciones={[{ valor: 'Semana', etiqueta: 'Semana' }, { valor: 'Mes', etiqueta: 'Mes' }]}
          onCambiar={v => { setVista(v); setDesplazamiento(0); setSeleccionado(null); }} />
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" aria-label="Período anterior" onClick={() => navegar(-1)}>‹</Button>
          <span aria-live="polite" className="min-w-36 text-center text-sm font-medium">{etiquetaPeriodo(rango.inicio, rango.fin, vista)}</span>
          <Button variant="ghost" size="sm" aria-label="Período siguiente" onClick={() => navegar(1)}>›</Button>
          <Button variant="outline" size="sm" onClick={() => { setDesplazamiento(0); setSeleccionado(null); }}>Hoy</Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto scrollbar-thin">
        {estado === 'cargando' && <p className="py-4 text-sm text-muted-foreground">Cargando reuniones…</p>}
        {estado === 'error' && <p className="py-4 text-sm text-muted-foreground">No se pudieron cargar las reuniones. Volveremos a intentar al actualizar.</p>}
        {estado === 'sin_token' && <p className="py-4 text-sm text-muted-foreground">{nombrePersona ? `${nombrePersona} no tiene Google Calendar conectado` : 'Google Calendar no conectado. Puedes conectarlo desde Mi Perfil.'}</p>}
        {estado === 'sin_permiso' && <p className="py-4 text-sm text-muted-foreground">{nombrePersona ? `${nombrePersona} no dio permiso de Google Calendar` : 'Falta el permiso de Google Calendar. Puedes dar permiso desde Mi Perfil.'}</p>}
        {estado === 'conectado' && (vista === 'Semana'
          ? <AgendaReuniones eventos={visibles} now={now} tarjeta={tarjeta} dias={rango.dias.filter((dia): dia is string => dia !== null)} />
          : <>
            <CalendarioReuniones mes={rango.inicio.slice(0, 10)} eventos={visibles} now={now} seleccionado={seleccionado ?? ''} onSeleccionar={setSeleccionado} />
            {seleccionado && <div ref={listaDia} tabIndex={-1} className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <AgendaReuniones eventos={visibles.filter(r => fechaReunion(r.start) === seleccionado)} now={now} tarjeta={tarjeta} dia={seleccionado} />
            </div>}
          </>)}
      </div>
    </DialogContent>
  </Dialog>;
}
