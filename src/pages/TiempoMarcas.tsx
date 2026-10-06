import { Fragment, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as api from '@/lib/apiClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

// Tiempo por marca: entregables entregados en el mes vs. horas que el equipo
// puso en cada marca (timer en tareas + reuniones del calendario), contra lo
// estimado y contra un mes-persona (160 h). Cada marca se abre para ver quién
// puso esas horas, y hay una vista por persona. Las reuniones van aparte de las
// tareas (pedido de Steven, 6-oct) y las que no son de una marca quedan en
// "Reuniones internas / sin marca".

interface PersonaEnMarca { user_id: string; nombre: string; horas: number; horas_tareas?: number; horas_reuniones?: number; tareas: number; pct_mes: number; pct_marca: number }
interface Fila {
  brand_id: string; marca: string; tareas_entregadas: number; entregables: number;
  horas_registradas: number; horas_tareas?: number; horas_reuniones?: number; horas_total?: number; pct_reuniones?: number;
  horas_estimadas: number; sin_estimar: number; personas: number;
  horas_por_entregable: number | null; pct_mes_persona: number; por_persona?: PersonaEnMarca[];
}
interface MarcaDePersona { brand_id: string | null; marca: string; horas: number; horas_tareas?: number; horas_reuniones?: number; tareas: number; pct_mes: number; pct_persona: number }
interface Persona { user_id: string; nombre: string; horas: number; horas_tareas?: number; horas_reuniones?: number; horas_reuniones_internas?: number; pct_reuniones?: number; pct_mes: number; marcas: MarcaDePersona[] }
interface SinMarca { horas: number; por_persona: { user_id: string; nombre: string; horas: number; pct_mes: number }[] }
interface Calendario { leidos: number; sin_acceso: { nombre: string; motivo: string }[]; sin_conectar: string[] }
interface Respuesta { mes: string; filas: Fila[]; personas?: Persona[]; sin_marca?: SinMarca; calendario?: Calendario }

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
const fmtN = (n: number) => (Math.round(n * 10) / 10).toLocaleString('es-EC');
const pctDe = (x: number, t: number) => (t > 0 ? Math.round((x / t) * 100) : 0);
const colorPct = (pct: number) => (pct > 100 ? 'bg-rose-500' : pct > 85 ? 'bg-amber-500' : 'bg-emerald-500');
// Compatibilidad con respuestas sin reuniones
const tareasDe = (f: { horas_tareas?: number; horas_registradas?: number }) => f.horas_tareas ?? f.horas_registradas ?? 0;

function Barra({ pct }: { pct: number }) {
  return (
    <div className="h-1.5 w-24 rounded-full bg-muted overflow-hidden">
      <div className={cn('h-full rounded-full', colorPct(pct))} style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  );
}
function Reu({ h, total }: { h: number; total: number }) {
  if (!h) return <span className="text-muted-foreground">—</span>;
  return <>{fmtH(h)}<span className="text-muted-foreground text-xs"> · {pctDe(h, total)} %</span></>;
}

export default function TiempoMarcas() {
  const meses = useMemo(() => ultimosMeses(12), []);
  const [mes, setMes] = useState(meses[0].value);
  const [deskId, setDeskId] = useState('all');
  const [userId, setUserId] = useState('all');
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set());
  const [personasAbiertas, setPersonasAbiertas] = useState<Set<string>>(new Set());
  const { data: desks } = useQuery({ queryKey: ['desks-list'], queryFn: api.getDesks });
  const desk = deskId === 'all' ? undefined : deskId;
  const todos = useQuery<Respuesta>({
    queryKey: ['tiempo-por-marca', mes, deskId],
    queryFn: () => api.getTiempoPorMarca(mes, desk),
  });
  const dePersona = useQuery<Respuesta>({
    queryKey: ['tiempo-por-marca', mes, deskId, userId],
    queryFn: () => api.getTiempoPorMarca(mes, desk, userId),
    enabled: userId !== 'all',
  });
  const actual = userId === 'all' ? todos : dePersona;
  const { data, isLoading, error } = actual;
  const filas = data?.filas ?? [];
  const personas = data?.personas ?? [];
  const sinMarca = data?.sin_marca;
  const calendario = data?.calendario;
  // Las opciones de persona salen del mes completo (sin filtrar), para poder cambiar de una a otra
  const opcionesPersona = todos.data?.personas ?? [];
  const nombrePersona = opcionesPersona.find((p) => p.user_id === userId)?.nombre;
  const tot = filas.reduce((a, f) => ({
    entregables: a.entregables + f.entregables, tareas: a.tareas + f.tareas_entregadas,
    horasTareas: a.horasTareas + tareasDe(f), reuMarca: a.reuMarca + (f.horas_reuniones ?? 0),
    est: a.est + f.horas_estimadas, sin: a.sin + f.sin_estimar,
  }), { entregables: 0, tareas: 0, horasTareas: 0, reuMarca: 0, est: 0, sin: 0 });
  const reuInternas = sinMarca?.horas ?? 0;
  const reuTotal = tot.reuMarca + reuInternas;
  const totalH = tot.horasTareas + reuTotal;
  const alternar = (set: Set<string>, id: string, fn: (s: Set<string>) => void) => {
    const n = new Set(set); if (n.has(id)) n.delete(id); else n.add(id); fn(n);
  };
  const internasAbiertas = abiertas.has('__internas__');

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground">Tiempo por marca</h2>
          <p className="text-sm text-muted-foreground">Horas que el equipo puso en cada marca en el mes, separadas en tareas (timer) y reuniones (calendario), comparadas con lo estimado y con un mes-persona de 160 h. Abre una marca para ver quién puso esas horas.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={deskId} onValueChange={(v) => { setDeskId(v); setUserId('all'); }}>
            <SelectTrigger className="h-9 w-[190px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las mesas</SelectItem>
              {(Array.isArray(desks) ? desks : []).filter((d: { activo?: unknown }) => d.activo !== 0 && d.activo !== false).map((d: { id: string; nombre: string }) => <SelectItem key={d.id} value={d.id}>{d.nombre}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={userId} onValueChange={setUserId}>
            <SelectTrigger className="h-9 w-[190px]"><SelectValue placeholder="Todas las personas" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las personas</SelectItem>
              {opcionesPersona.map((p) => <SelectItem key={p.user_id} value={p.user_id}>{p.nombre}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={mes} onValueChange={setMes}>
            <SelectTrigger className="h-9 w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>{meses.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[['Entregables entregados', tot.entregables.toLocaleString('es-EC'), `${tot.tareas} tareas${nombrePersona ? ` de ${nombrePersona.split(' ')[0]}` : ''}`],
          ['Horas en tareas (timer)', fmtH(tot.horasTareas), `${pctDe(tot.horasTareas, totalH)} % del total · estimado de lo entregado: ${fmtH(tot.est)}`],
          ['Horas en reuniones', fmtH(reuTotal), `${pctDe(reuTotal, totalH)} % del total · ${fmtH(tot.reuMarca)} de marcas, ${fmtH(reuInternas)} internas`],
          ['Total', fmtH(totalH), nombrePersona ? `${Math.round((totalH / 160) * 100)} % del mes de ${nombrePersona.split(' ')[0]}` : `${fmtN(totalH / 160)} personas a tiempo completo`]].map(([l, v, s]) => (
          <Card key={l}><CardContent className="p-4">
            <div className="text-xs text-muted-foreground">{l}</div>
            <div className="text-xl font-semibold">{v}</div>
            <div className="text-xs text-muted-foreground">{s}</div>
          </CardContent></Card>
        ))}
      </div>

      {calendario && (calendario.sin_acceso.length > 0 || calendario.sin_conectar.length > 0) && (
        <details className="rounded-md border border-amber-500/40 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs">
          <summary className="cursor-pointer text-amber-800 dark:text-amber-300 font-medium">
            Reuniones leídas del calendario de {calendario.leidos} personas · a {calendario.sin_acceso.length + calendario.sin_conectar.length} no se les puede leer (sus reuniones no suman)
          </summary>
          <div className="mt-2 space-y-1 text-muted-foreground">
            {calendario.sin_acceso.length > 0 && <p><span className="font-medium text-foreground">Deben reconectar Google en su perfil de Tiusdei, dando permiso de calendario:</span> {calendario.sin_acceso.map((p) => `${p.nombre} (${p.motivo})`).join(', ')}.</p>}
            {calendario.sin_conectar.length > 0 && <p><span className="font-medium text-foreground">Nunca conectaron Google:</span> {calendario.sin_conectar.join(', ')}.</p>}
          </div>
        </details>
      )}

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Por marca{nombrePersona ? <span className="font-normal text-muted-foreground text-sm"> · solo {nombrePersona}</span> : null}</CardTitle></CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-sm text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin text-primary" />Leyendo timers y calendarios…</div>
          ) : error ? (
            <div className="flex items-center gap-2 p-6 text-muted-foreground"><AlertTriangle className="h-4 w-4" />No se pudo cargar el reporte.</div>
          ) : filas.length === 0 && !reuInternas ? (
            <p className="p-6 text-sm text-muted-foreground">No hay entregas ni horas registradas en este mes.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Marca</TableHead>
                  <TableHead className="text-right">Entregables</TableHead>
                  <TableHead className="text-right">Tareas</TableHead>
                  <TableHead className="text-right">Reuniones</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Estimadas</TableHead>
                  <TableHead className="text-right" title="Horas de tareas contra horas estimadas">Desvío</TableHead>
                  <TableHead className="text-right" title="Horas de tareas por entregable">h / entregable</TableHead>
                  <TableHead className="text-right" title="Total de la marca ÷ 160 h: cuántas personas a tiempo completo equivale">Equivale a</TableHead>
                  <TableHead className="text-right">Personas</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {filas.map((f) => {
                    const ht = tareasDe(f), hr = f.horas_reuniones ?? 0, total = f.horas_total ?? ht + hr;
                    // El desvío solo tiene sentido si la mayoría de lo entregado tiene estimado
                    const desvio = f.horas_estimadas > 0 && f.sin_estimar <= f.tareas_entregadas / 2 ? Math.round(((ht - f.horas_estimadas) / f.horas_estimadas) * 100) : null;
                    const abierta = abiertas.has(f.brand_id);
                    const conDetalle = (f.por_persona?.length ?? 0) > 0;
                    return (
                      <Fragment key={f.brand_id}>
                        <TableRow className={cn(conDetalle && 'cursor-pointer', abierta && 'bg-muted/40')} onClick={() => conDetalle && alternar(abiertas, f.brand_id, setAbiertas)}>
                          <TableCell className="font-medium">
                            <span className="inline-flex items-center gap-1">
                              {conDetalle ? (abierta ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />) : <span className="w-3.5" />}
                              {f.marca}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">{f.entregables}<span className="text-muted-foreground text-xs"> · {f.tareas_entregadas} t</span></TableCell>
                          <TableCell className="text-right">{ht ? fmtH(ht) : <span className="text-muted-foreground">—</span>}</TableCell>
                          <TableCell className="text-right whitespace-nowrap"><Reu h={hr} total={total} /></TableCell>
                          <TableCell className="text-right font-medium">{fmtH(total)}</TableCell>
                          <TableCell className="text-right">{f.horas_estimadas > 0 ? fmtH(f.horas_estimadas) : '—'}{f.sin_estimar > 0 && <span className="text-amber-600 dark:text-amber-400 text-xs" title="Tareas entregadas sin horas estimadas"> · {f.sin_estimar} sin est.</span>}</TableCell>
                          <TableCell className={cn('text-right', desvio != null && desvio > 20 && 'text-rose-600 dark:text-rose-400 font-medium', desvio != null && desvio < -20 && 'text-emerald-600 dark:text-emerald-400')}>{desvio == null ? '—' : `${desvio > 0 ? '+' : ''}${desvio} %`}</TableCell>
                          <TableCell className="text-right">{f.horas_por_entregable != null ? fmtH(f.horas_por_entregable) : '—'}</TableCell>
                          <TableCell className="text-right whitespace-nowrap" title={`${f.pct_mes_persona} % de un mes de 160 h`}>{fmtN(total / 160)} pers.<span className="text-muted-foreground text-xs"> · {f.pct_mes_persona} %</span></TableCell>
                          <TableCell className="text-right">{conDetalle ? <span className="underline decoration-dotted underline-offset-2">{f.personas}</span> : f.personas}</TableCell>
                        </TableRow>
                        {abierta && f.por_persona?.map((p) => (
                          <TableRow key={`${f.brand_id}-${p.user_id}`} className="bg-muted/20 hover:bg-muted/30 text-xs">
                            <TableCell className="pl-9">{p.nombre}</TableCell>
                            <TableCell className="text-right text-muted-foreground">{p.tareas ? `${p.tareas} tareas` : ''}</TableCell>
                            <TableCell className="text-right">{p.horas_tareas ? fmtH(p.horas_tareas) : <span className="text-muted-foreground">—</span>}</TableCell>
                            <TableCell className="text-right">{p.horas_reuniones ? fmtH(p.horas_reuniones) : <span className="text-muted-foreground">—</span>}</TableCell>
                            <TableCell className="text-right font-medium">{fmtH(p.horas)}</TableCell>
                            <TableCell colSpan={3} className="text-right text-muted-foreground">{p.pct_marca} % de las horas de la marca</TableCell>
                            <TableCell className="text-right"><span className="inline-flex items-center gap-2 justify-end"><Barra pct={p.pct_mes} /><span className="w-10 text-right">{p.pct_mes} %</span></span></TableCell>
                            <TableCell className="text-right text-muted-foreground" title="Porcentaje de su mes (160 h) dedicado a esta marca">de su mes</TableCell>
                          </TableRow>
                        ))}
                      </Fragment>
                    );
                  })}
                  {reuInternas > 0 && (
                    <>
                      <TableRow className={cn('cursor-pointer border-t-2', internasAbiertas && 'bg-muted/40')} onClick={() => alternar(abiertas, '__internas__', setAbiertas)}>
                        <TableCell className="italic text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            {internasAbiertas ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                            Reuniones internas / sin marca
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">—</TableCell>
                        <TableCell className="text-right text-muted-foreground">—</TableCell>
                        <TableCell className="text-right">{fmtH(reuInternas)}</TableCell>
                        <TableCell className="text-right font-medium">{fmtH(reuInternas)}</TableCell>
                        <TableCell colSpan={3} className="text-right text-xs text-muted-foreground">dailies, syncs y reuniones sin marca en el título</TableCell>
                        <TableCell className="text-right whitespace-nowrap">{fmtN(reuInternas / 160)} pers.</TableCell>
                        <TableCell className="text-right">{sinMarca?.por_persona.length ?? 0}</TableCell>
                      </TableRow>
                      {internasAbiertas && sinMarca?.por_persona.map((p) => (
                        <TableRow key={`int-${p.user_id}`} className="bg-muted/20 hover:bg-muted/30 text-xs">
                          <TableCell className="pl-9">{p.nombre}</TableCell>
                          <TableCell /><TableCell />
                          <TableCell className="text-right">{fmtH(p.horas)}</TableCell>
                          <TableCell className="text-right font-medium">{fmtH(p.horas)}</TableCell>
                          <TableCell colSpan={3} />
                          <TableCell className="text-right"><span className="inline-flex items-center gap-2 justify-end"><Barra pct={p.pct_mes} /><span className="w-10 text-right">{p.pct_mes} %</span></span></TableCell>
                          <TableCell className="text-right text-muted-foreground">de su mes</TableCell>
                        </TableRow>
                      ))}
                    </>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {personas.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Por persona <span className="font-normal text-muted-foreground text-sm">· horas del mes (tareas + reuniones) y en qué marcas</span></CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Persona</TableHead>
                  <TableHead className="text-right">Tareas</TableHead>
                  <TableHead className="text-right">Reuniones</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>% de su mes (160 h)</TableHead>
                  <TableHead>Marcas donde puso sus horas</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {personas.map((p) => {
                    const abierta = personasAbiertas.has(p.user_id) || userId !== 'all';
                    const visibles = abierta ? p.marcas : p.marcas.slice(0, 3);
                    const reu = p.horas_reuniones ?? 0;
                    return (
                      <TableRow key={p.user_id} className="align-top">
                        <TableCell className="font-medium whitespace-nowrap">{p.nombre}</TableCell>
                        <TableCell className="text-right">{fmtH(p.horas_tareas ?? p.horas)}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          <Reu h={reu} total={p.horas} />
                          {(p.horas_reuniones_internas ?? 0) > 0 && <div className="text-[11px] text-muted-foreground">{fmtH(p.horas_reuniones_internas ?? 0)} internas</div>}
                        </TableCell>
                        <TableCell className="text-right font-medium">{fmtH(p.horas)}</TableCell>
                        <TableCell><span className="inline-flex items-center gap-2"><Barra pct={p.pct_mes} /><span className="text-xs">{p.pct_mes} %</span></span></TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1.5 text-[11px]">
                            {visibles.map((mk) => (
                              <span key={`${p.user_id}-${mk.brand_id}`} className="rounded-full border px-2 py-0.5" title={`${mk.tareas} tareas · ${fmtH(mk.horas_tareas ?? mk.horas)} en tareas · ${fmtH(mk.horas_reuniones ?? 0)} en reuniones · ${mk.pct_mes} % de su mes`}>
                                {mk.marca} <span className="text-muted-foreground">{fmtH(mk.horas)} · {mk.pct_persona} %</span>
                              </span>
                            ))}
                            {p.marcas.length > 3 && userId === 'all' && (
                              <button type="button" className="text-primary hover:underline" onClick={() => alternar(personasAbiertas, p.user_id, setPersonasAbiertas)}>
                                {abierta ? 'ver menos' : `+${p.marcas.length - 3} más`}
                              </button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        Entregables: tareas que pasaron a Entregado o Aprobado dentro del mes (suma de su cantidad de entregables). Tareas: sesiones de timer del mes en tareas de la marca, entregadas o no.
        Reuniones: del Google Calendar de cada persona; solo las que aceptó u organizó (con invitados o videollamada), dentro de su jornada marcada y sin el tiempo en que tenía el timer corriendo (no se cuenta dos veces).
        Una reunión va a la marca cuyo nombre, abreviatura (Administración &gt; Marcas, ej. MDN) o nombre de proyecto aparece en el título; si no, queda en "internas / sin marca". Para que sume a la marca, ponla en el título (ej. «Skretting | Revisión de pauta»).
        Estimadas: estimado de las tareas entregadas, o el tiempo estándar por tipo de entregable (Administración &gt; Configuración). Desvío: tareas contra estimadas; solo se muestra si al menos la mitad de lo entregado tiene estimado.
        Equivale a: total de la marca ÷ 160 h. % de su mes: horas de esa persona ÷ 160 h.
      </p>
    </div>
  );
}
