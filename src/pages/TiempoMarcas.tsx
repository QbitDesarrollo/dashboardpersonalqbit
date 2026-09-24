import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as api from '@/lib/apiClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

// Tiempo por marca: entregables entregados en el mes vs. horas que el equipo
// registró en esa marca, contra lo estimado y contra un mes-persona (160 h).

interface Fila {
  brand_id: string; marca: string; tareas_entregadas: number; entregables: number;
  horas_registradas: number; horas_estimadas: number; sin_estimar: number; personas: number;
  horas_por_entregable: number | null; pct_mes_persona: number;
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
function ultimosMeses(n: number): { value: string; label: string }[] {
  const hoy = new Date(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil' }).format(new Date()) + 'T12:00:00Z');
  const out: { value: string; label: string }[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - i, 1));
    out.push({ value: d.toISOString().slice(0, 7), label: `${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()}${i === 0 ? ' (en curso)' : ''}` });
  }
  return out;
}
const fmtH = (h: number) => `${(Math.round(h * 10) / 10).toLocaleString('es-EC')} h`;

export default function TiempoMarcas() {
  const meses = useMemo(() => ultimosMeses(12), []);
  const [mes, setMes] = useState(meses[0].value);
  const [deskId, setDeskId] = useState('all');
  const { data: desks } = useQuery({ queryKey: ['desks-list'], queryFn: api.getDesks });
  const { data, isLoading, error } = useQuery<{ mes: string; filas: Fila[] }>({
    queryKey: ['tiempo-por-marca', mes, deskId],
    queryFn: () => api.getTiempoPorMarca(mes, deskId === 'all' ? undefined : deskId),
  });
  const filas = data?.filas ?? [];
  const tot = filas.reduce((a, f) => ({
    entregables: a.entregables + f.entregables, tareas: a.tareas + f.tareas_entregadas,
    reg: a.reg + f.horas_registradas, est: a.est + f.horas_estimadas, sin: a.sin + f.sin_estimar,
  }), { entregables: 0, tareas: 0, reg: 0, est: 0, sin: 0 });

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground">Tiempo por marca</h2>
          <p className="text-sm text-muted-foreground">Entregables entregados en el mes y horas que el equipo registró en cada marca (timer), comparadas con lo estimado y con un mes-persona de 160 h.</p>
        </div>
        <div className="flex gap-2">
          <Select value={deskId} onValueChange={setDeskId}>
            <SelectTrigger className="h-9 w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las mesas</SelectItem>
              {(Array.isArray(desks) ? desks : []).filter((d: { activo?: unknown }) => d.activo !== 0 && d.activo !== false).map((d: { id: string; nombre: string }) => <SelectItem key={d.id} value={d.id}>{d.nombre}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={mes} onValueChange={setMes}>
            <SelectTrigger className="h-9 w-[190px]"><SelectValue /></SelectTrigger>
            <SelectContent>{meses.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[['Entregables entregados', tot.entregables.toLocaleString('es-EC'), `${tot.tareas} tareas`],
          ['Horas registradas', fmtH(tot.reg), `${(tot.reg / 160).toFixed(1)} meses-persona`],
          ['Horas estimadas (de lo entregado)', fmtH(tot.est), tot.sin ? `${tot.sin} tareas entregadas sin estimar` : 'todas con estimado'],
          ['Horas por entregable', tot.entregables ? fmtH(tot.reg / tot.entregables) : '—', 'promedio del mes']].map(([l, v, s]) => (
          <Card key={l}><CardContent className="p-4">
            <div className="text-xs text-muted-foreground">{l}</div>
            <div className="text-xl font-semibold">{v}</div>
            <div className="text-xs text-muted-foreground">{s}</div>
          </CardContent></Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Por marca</CardTitle></CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : error ? (
            <div className="flex items-center gap-2 p-6 text-muted-foreground"><AlertTriangle className="h-4 w-4" />No se pudo cargar el reporte.</div>
          ) : filas.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No hay entregas ni horas registradas en este mes.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Marca</TableHead>
                  <TableHead className="text-right">Entregables</TableHead>
                  <TableHead className="text-right">Horas registradas</TableHead>
                  <TableHead className="text-right">Horas estimadas</TableHead>
                  <TableHead className="text-right">Desvío</TableHead>
                  <TableHead className="text-right">h / entregable</TableHead>
                  <TableHead className="text-right">% de 160 h</TableHead>
                  <TableHead className="text-right">Personas</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {filas.map((f) => {
                    // El desvío solo tiene sentido si la mayoría de lo entregado tiene estimado
                    const desvio = f.horas_estimadas > 0 && f.sin_estimar <= f.tareas_entregadas / 2 ? Math.round(((f.horas_registradas - f.horas_estimadas) / f.horas_estimadas) * 100) : null;
                    return (
                      <TableRow key={f.brand_id}>
                        <TableCell className="font-medium">{f.marca}</TableCell>
                        <TableCell className="text-right">{f.entregables}<span className="text-muted-foreground text-xs"> · {f.tareas_entregadas} t</span></TableCell>
                        <TableCell className="text-right">{fmtH(f.horas_registradas)}</TableCell>
                        <TableCell className="text-right">{f.horas_estimadas > 0 ? fmtH(f.horas_estimadas) : '—'}{f.sin_estimar > 0 && <span className="text-amber-600 dark:text-amber-400 text-xs" title="Tareas entregadas sin horas estimadas"> · {f.sin_estimar} sin est.</span>}</TableCell>
                        <TableCell className={cn('text-right', desvio != null && desvio > 20 && 'text-rose-600 dark:text-rose-400 font-medium', desvio != null && desvio < -20 && 'text-emerald-600 dark:text-emerald-400')}>{desvio == null ? '—' : `${desvio > 0 ? '+' : ''}${desvio} %`}</TableCell>
                        <TableCell className="text-right">{f.horas_por_entregable != null ? fmtH(f.horas_por_entregable) : '—'}</TableCell>
                        <TableCell className="text-right">{f.pct_mes_persona} %</TableCell>
                        <TableCell className="text-right">{f.personas}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        Entregables: tareas que pasaron a Entregado o Aprobado dentro del mes (suma de su cantidad de entregables). Horas registradas: sesiones de timer del mes en tareas de la marca, entregadas o no.
        Horas estimadas: estimado de las tareas entregadas, o el tiempo estándar por tipo de entregable (Administración &gt; Configuración). Desvío: registradas contra estimadas; solo se muestra si al menos la mitad de lo entregado tiene estimado.
        Las reuniones no se asignan a marcas, así que no suman aquí.
      </p>
    </div>
  );
}
