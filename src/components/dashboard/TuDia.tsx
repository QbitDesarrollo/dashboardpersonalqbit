import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { duracionDia, horaDia } from '@/lib/miDia';
import { useMiDia } from './useMiDia';

const segmentos = {
  tareas: { color: 'bg-emerald-500', texto: 'Trabajado en tareas' },
  reuniones: { color: 'bg-violet-500', texto: 'En reuniones' },
  libre: { color: 'bg-amber-200', texto: 'Libre' },
  pendiente: { color: 'bg-muted', texto: 'Pendiente' },
};
export function TuDia({ userId }: { userId: string | undefined }) {
  const { dia, error } = useMiDia(userId);
  return <section aria-label="Tu día"><Card className="glass-card">
    <CardHeader className="pb-3"><CardTitle className="text-base">Tu día</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      {!dia ? <p className="text-sm text-muted-foreground">{error ? 'No se pudo cargar tu día' : 'Cargando tu día…'}</p> : <>
        <div>
          <div className="flex justify-between text-xs text-muted-foreground mb-2"><span>{horaDia(dia.inicio)}</span><span>{horaDia(dia.fin)}</span></div>
          <div className="relative h-3 rounded-full bg-muted" aria-label="Distribución de la jornada">
            {dia.segmentos.map((s, i) => <span key={i} title={segmentos[s.tipo].texto} className={`absolute h-full ${segmentos[s.tipo].color}`}
              style={{ left: `${s.desde}%`, width: `${s.hasta - s.desde}%` }} />)}
            <span className="absolute -top-1 h-5 border-l-2 border-foreground" style={{ left: `${dia.ahora}%` }} title="Ahora"><span className="sr-only">Ahora</span></span>
          </div>
          <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted-foreground">{Object.entries(segmentos).map(([tipo, s]) => <span key={tipo} className="flex items-center gap-1"><i className={`h-2 w-2 rounded-full ${s.color}`} />{s.texto}</span>)}</div>
        </div>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6 text-sm">
          <Metrica titulo="Ingreso" valor={horaDia(dia.ingreso)} />
          <Metrica titulo="Trabajado" valor={`${duracionDia(dia.trabajadoSeg)} de ${duracionDia(dia.jornadaSeg)}`} />
          {dia.calendarioDisponible !== false && <>
            <Metrica titulo="Reuniones" valor={`${dia.reuniones.total} hoy · ${duracionDia(dia.reuniones.segundos)}`}
              detalle={`${dia.reuniones.hechas} hechas · ${dia.reuniones.enCurso} en curso · ${dia.reuniones.porVenir} por venir`} />
            <Metrica titulo="Tiempo de foco disponible" valor={duracionDia(dia.focoSeg)} />
          </>}
          <Metrica titulo="Tareas hoy" valor={`${dia.tareas.completadas} de ${dia.tareas.total} completadas`} />
          <Metrica titulo="Cumplimiento semana" valor={dia.cumplimiento.porcentaje === null ? 'Sin entregas' : `${dia.cumplimiento.porcentaje}%`}
            detalle={`${dia.cumplimiento.estado}${dia.cumplimiento.delta === null ? '' : ` · ${dia.cumplimiento.delta >= 0 ? '+' : ''}${dia.cumplimiento.delta} pp`}`} />
        </dl>
        <p className="text-[11px] text-muted-foreground">Jornada de referencia 08:00–18:00. Cumplimiento: tareas creadas esta semana, según el reporte de entregas; delta frente a la semana anterior.</p>
      </>}
    </CardContent>
  </Card></section>;
}
function Metrica({ titulo, valor, detalle }: { titulo: string; valor: string; detalle?: string }) {
  return <div><dt className="text-xs text-muted-foreground">{titulo}</dt><dd className="font-semibold mt-1">{valor}</dd>{detalle && <dd className="text-[11px] text-muted-foreground mt-1">{detalle}</dd>}</div>;
}
