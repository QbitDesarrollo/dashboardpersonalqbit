import { useEffect, useState, useMemo } from 'react';
import * as api from '@/lib/apiClient';
import type { CumplimientoResponsable } from '@/lib/apiClient';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ExternalLink } from 'lucide-react';
import { Loader2, TrendingUp, TrendingDown, Calendar, Filter, FileSpreadsheet, ChevronUp, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { cn, getInitials } from '@/lib/utils';
import { DepartmentTimesCard } from '@/components/tasks/DepartmentTimesCard';

interface Desk { id: string; nombre: string }

type SortKey = 'nombre' | 'tareas_total' | 'porcentaje_cumplimiento' | 'entregadas_a_tiempo' | 'entregadas_tarde' | 'vencidas_no_entregadas' | 'promedio_reschedules';
type SortDir = 'asc' | 'desc';

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function getInitialDates() {
  const today = new Date();
  const monthAgo = new Date(today);
  monthAgo.setDate(monthAgo.getDate() - 30);
  return { from: formatDate(monthAgo), to: formatDate(today) };
}

export default function Cumplimiento() {
  const { profile } = useAuth();
  const isAdmin = profile?.rol === 'admin';
  const isEjecutivo = profile?.rol === 'ejecutivo';

  const init = getInitialDates();
  const [from, setFrom] = useState(init.from);
  const [to, setTo] = useState(init.to);
  const [deskFilter, setDeskFilter] = useState<string>('all');
  const [desks, setDesks] = useState<Desk[]>([]);
  const [data, setData] = useState<CumplimientoResponsable[]>([]);
  const [meta, setMeta] = useState<{ total_responsables: number; total_tareas: number; total_entregables?: number } | null>(null);
  const [drill, setDrill] = useState<{ nombre: string; tipo: 'tarde' | 'vencidas'; tasks: any[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('porcentaje_cumplimiento');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Cargar mesas para filtro (solo admin/ejecutivo)
  useEffect(() => {
    if (!isAdmin && !isEjecutivo) return;
    api.getDesks().then((d) => {
      if (Array.isArray(d)) setDesks(d.filter((x: any) => x.activo !== 0 && x.activo !== false));
    }).catch(() => {});
  }, [isAdmin, isEjecutivo]);

  // Cargar métricas
  const fetchData = async () => {
    setLoading(true);
    try {
      const r = await api.getCumplimiento({
        from,
        to,
        desk_id: deskFilter !== 'all' ? deskFilter : undefined,
      });
      setData(r.responsables);
      setMeta({ total_responsables: r.total_responsables, total_tareas: r.total_tareas, total_entregables: (r as any).total_entregables });
    } catch (e: any) {
      toast.error(e.message || 'Error al cargar métricas');
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [from, to, deskFilter]);

  const sorted = useMemo(() => {
    const copy = [...data];
    copy.sort((a, b) => {
      let av: any = a[sortKey];
      let bv: any = b[sortKey];
      if (sortKey === 'porcentaje_cumplimiento') {
        av = av ?? -1;
        bv = bv ?? -1;
      }
      if (sortKey === 'nombre') {
        return sortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
      }
      return sortDir === 'asc' ? (av - bv) : (bv - av);
    });
    return copy;
  }, [data, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const exportCSV = () => {
    const headers = ['Nombre', 'Email', 'Total tareas', 'Entregables', 'A tiempo', 'Tarde', 'Vencidas', 'En proceso', '% Cumplimiento', 'Promedio reschedules'];
    const lines = [
      headers.join(','),
      ...sorted.map(r => [
        `"${r.nombre}"`,
        r.email || '',
        r.tareas_total,
        r.entregables_total ?? 0,
        r.entregadas_a_tiempo,
        r.entregadas_tarde,
        r.vencidas_no_entregadas,
        r.en_proceso,
        r.porcentaje_cumplimiento ?? '',
        r.promedio_reschedules,
      ].join(',')),
    ];
    const csv = lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cumplimiento_${from}_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const setRangePreset = (days: number) => {
    const today = new Date();
    const start = new Date(today);
    start.setDate(start.getDate() - days);
    setFrom(formatDate(start));
    setTo(formatDate(today));
  };

  // Stats globales (top resumen)
  const totals = useMemo(() => {
    return sorted.filter((r) => !r.es_soporte).reduce(
      (acc, r) => ({
        a_tiempo: acc.a_tiempo + r.entregadas_a_tiempo,
        tarde: acc.tarde + r.entregadas_tarde,
        vencidas: acc.vencidas + r.vencidas_no_entregadas,
        en_proceso: acc.en_proceso + r.en_proceso,
        entregables: acc.entregables + (r.entregables_total ?? 0),
      }),
      { a_tiempo: 0, tarde: 0, vencidas: 0, en_proceso: 0, entregables: 0 }
    );
  }, [sorted]);
  const totalCompletadas = totals.a_tiempo + totals.tarde;
  const cumplimientoGlobal = totalCompletadas > 0 ? (totals.a_tiempo / totalCompletadas) * 100 : null;

  return (
    <div className="container mx-auto py-4 sm:py-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-primary" />
            Cumplimiento de entregas
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Métricas de cuántas tareas se entregan dentro de la fecha original prometida.
            {!isAdmin && !isEjecutivo && ' Mostrando solo tus métricas.'}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1.5" disabled={data.length === 0}>
          <FileSpreadsheet className="h-4 w-4" /> Exportar CSV
        </Button>
      </div>

      {/* Filtros */}
      <Card className="glass-card">
        <CardContent className="p-3 sm:p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Desde</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-[150px]" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Hasta</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-[150px]" />
            </div>
            <div className="flex gap-1.5">
              <Button variant="outline" size="sm" onClick={() => setRangePreset(7)}>7 días</Button>
              <Button variant="outline" size="sm" onClick={() => setRangePreset(30)}>30 días</Button>
              <Button variant="outline" size="sm" onClick={() => setRangePreset(90)}>90 días</Button>
            </div>
            {(isAdmin || isEjecutivo) && (
              <div className="space-y-1.5 flex-1 min-w-[180px]">
                <Label className="text-xs text-muted-foreground">Mesa</Label>
                <Select value={deskFilter} onValueChange={setDeskFilter}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {desks.map(d => (<SelectItem key={d.id} value={d.id}>{d.nombre}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Stats globales */}
      {meta && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <StatCard label="Responsables" value={meta.total_responsables} />
          <StatCard label="Tareas en periodo" value={meta.total_tareas} />
          <StatCard label="Entregables (total)" value={meta.total_entregables ?? totals.entregables} />
          <StatCard label="A tiempo" value={totals.a_tiempo} variant="success" />
          <StatCard label="Tarde / Vencidas" value={totals.tarde + totals.vencidas} variant="danger" />
          <StatCard
            label="% Cumplimiento global"
            value={cumplimientoGlobal !== null ? `${cumplimientoGlobal.toFixed(1)}%` : '—'}
            variant={cumplimientoGlobal === null ? 'neutral' : cumplimientoGlobal >= 80 ? 'success' : cumplimientoGlobal >= 60 ? 'warning' : 'danger'}
          />
        </div>
      )}

      {/* Tabla */}
      <DepartmentTimesCard from={from} to={to} deskId={deskFilter} />

      <Card className="glass-card overflow-hidden">
        <CardHeader className="py-3">
          <CardTitle className="text-base">Por responsable</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : sorted.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-8">Sin datos en este periodo.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableHead label="Persona" k="nombre" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                    <SortableHead label="Tareas" k="tareas_total" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} className="text-right" />
                    <TableHead className="text-right">Entregables</TableHead>
                    <SortableHead label="A tiempo" k="entregadas_a_tiempo" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} className="text-right" />
                    <SortableHead label="Tarde" k="entregadas_tarde" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} className="text-right" />
                    <SortableHead label="Vencidas" k="vencidas_no_entregadas" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} className="text-right" />
                    <SortableHead label="Reagendamientos" k="promedio_reschedules" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} className="text-right" />
                    <SortableHead label="% Cumplimiento" k="porcentaje_cumplimiento" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} className="text-right" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((r) => (
                    <TableRow key={r.user_id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-7 w-7">
                            {r.avatar_url && <AvatarImage src={r.avatar_url} alt={r.nombre} />}
                            <AvatarFallback className="text-xs">{getInitials(r.nombre)}</AvatarFallback>
                          </Avatar>
                          <div>
                            <span className="font-medium text-sm">{r.nombre}</span>
                            {r.rol && <Badge variant="outline" className="ml-1.5 text-[10px] capitalize">{r.rol}</Badge>}
                            {r.es_soporte && <Badge variant="outline" className="ml-1 text-[10px] text-amber-700 border-amber-300">Soporte</Badge>}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium">{r.tareas_total}</TableCell>
                      <TableCell className="text-right text-sm font-semibold">{r.entregables_total ?? 0}</TableCell>
                      <TableCell className="text-right text-sm text-green-700">{r.entregadas_a_tiempo}</TableCell>
                      <TableCell className="text-right text-sm">
                        {r.entregadas_tarde > 0
                          ? <button onClick={() => setDrill({ nombre: r.nombre, tipo: 'tarde', tasks: r.tarde_tasks || [] })} className="text-amber-700 font-medium hover:underline decoration-dashed underline-offset-2" title="Ver las tareas entregadas tarde">{r.entregadas_tarde}</button>
                          : <span className="text-amber-700">0</span>}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {r.vencidas_no_entregadas > 0
                          ? <button onClick={() => setDrill({ nombre: r.nombre, tipo: 'vencidas', tasks: r.vencidas_tasks || [] })} className="text-red-700 font-medium hover:underline decoration-dashed underline-offset-2" title="Ver las tareas vencidas sin entregar">{r.vencidas_no_entregadas}</button>
                          : <span className="text-red-700">0</span>}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {(r.reschedules_total ?? 0) > 0 ? (
                          <div className="inline-flex flex-col items-end gap-0.5">
                            <span className="text-base font-semibold leading-none" title="Veces que se movio la fecha de entrega en total">
                              {r.reschedules_total} {(r.reschedules_total === 1) ? 'vez' : 'veces'}
                            </span>
                            <span className={cn(
                              "px-1.5 py-0.5 rounded text-[11px] font-medium",
                              r.promedio_reschedules >= 2 ? "bg-red-100 text-red-700" :
                              r.promedio_reschedules >= 1 ? "bg-amber-100 text-amber-700" :
                              "bg-green-100 text-green-700"
                            )} title="Promedio de reagendamientos por tarea">
                              {r.promedio_reschedules.toFixed(1)} por tarea
                            </span>
                            {(r.reschedules_internos ?? 0) > 0 && (
                              <span className="text-[10px] text-muted-foreground" title="Reagendamientos internos: los unicos que bajan el % de cumplimiento">
                                {r.reschedules_internos} interno{(r.reschedules_internos === 1) ? '' : 's'}
                              </span>
                            )}
                          </div>
                        ) : <span className="text-green-700" title="Nunca se movio la fecha. Ideal.">0</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        {r.porcentaje_cumplimiento !== null ? (
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className={cn(
                                  "h-full transition-all",
                                  r.porcentaje_cumplimiento >= 80 ? "bg-green-500" :
                                  r.porcentaje_cumplimiento >= 60 ? "bg-amber-500" : "bg-red-500"
                                )}
                                style={{ width: `${r.porcentaje_cumplimiento}%` }}
                              />
                            </div>
                            <span className={cn(
                              "text-sm font-semibold w-12 text-right",
                              r.porcentaje_cumplimiento >= 80 ? "text-green-700" :
                              r.porcentaje_cumplimiento >= 60 ? "text-amber-700" : "text-red-700"
                            )}>
                              {r.porcentaje_cumplimiento.toFixed(0)}%
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">Sin entregas</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notas */}
      <p className="text-[11px] text-muted-foreground italic px-1">
        ℹ️ "A tiempo" significa que la tarea fue entregada antes o el día de la <strong>primera fecha</strong> que se prometió, no la última (no premia reagendar).
        Tareas sin fecha de entrega o sin estado entregado todavía cuentan en "En proceso" hasta que se entreguen o venzan.
      </p>
      <p className="text-[11px] text-muted-foreground italic px-1">
        🎗️ Los miembros marcados como <strong>Soporte</strong> (en Mesas → Miembros) se muestran en la tabla pero <strong>NO cuentan</strong> para el % global de la mesa. Así el cumplimiento refleja solo al equipo base.
      </p>
      <p className="text-[11px] text-muted-foreground italic px-1">
        📊 <strong>A tiempo / Tarde / Vencida</strong>: <strong>A tiempo</strong> = se entregó en o antes de la fecha prometida. <strong>Tarde</strong> = se entregó, pero <strong>después</strong> de la fecha. <strong>Vencida</strong> = la fecha ya pasó y <strong>todavía no se entrega</strong>. Ejemplo: una tarea con fecha de hoy que se entrega mañana cuenta como <strong>tarde</strong>; mientras no se entregue, cuenta como <strong>vencida</strong>. La entrega se mide cuando el equipo manda la tarea a revisión o la entrega, no cuando se aprueba después. ⏸️ <strong>Revisión cliente</strong>: mientras la tarea está en manos del cliente el reloj <strong>se detiene</strong> — si el cliente demora días y devuelve cambios, esos días se suman a la fecha objetivo y no cuentan como atraso del equipo.
      </p>
      <p className="text-[11px] text-muted-foreground italic px-1">
        🔁 <strong>Reagendamientos</strong>: cuántas <strong>veces se movió la fecha de entrega</strong>. El número grande es el total; abajo, el promedio por tarea (<span className="text-green-700">verde</span> bien, <span className="text-amber-700">ámbar</span> regular, <span className="text-red-700">rojo</span> alto). Solo los <strong>internos</strong> &mdash; cuando el equipo movió la fecha sin causa de cliente, alcance o fuerza mayor &mdash; <strong>bajan el % de cumplimiento</strong>.
      </p>
      <Dialog open={!!drill} onOpenChange={(o) => { if (!o) setDrill(null); }}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">
              {drill?.tipo === 'vencidas' ? 'Tareas vencidas' : 'Tareas entregadas tarde'} — {drill?.nombre}
            </DialogTitle>
          </DialogHeader>
          {drill && drill.tasks.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">Sin tareas en este grupo.</p>}
          <div className="space-y-1.5">
            {drill?.tasks.map((t: any) => (
              <a key={t.task_id} href={`/tareas?task=${t.task_id}`} target="_blank" rel="noreferrer"
                 className="flex items-start justify-between gap-2 rounded-lg border px-3 py-2 hover:bg-muted/50 transition-colors">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate flex items-center gap-1.5">{t.titulo}<ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" /></div>
                  <div className="text-[11px] text-muted-foreground">
                    {t.marca && <span>{t.marca} · </span>}
                    {drill.tipo === 'vencidas'
                      ? <>vencía {t.fecha_objetivo || '—'} · <span className="capitalize">{t.estado}</span></>
                      : <>fecha objetivo {t.fecha_objetivo || '—'} · entregada {t.entregada || '—'}</>}
                  </div>
                </div>
              </a>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ label, value, variant = 'neutral' }: { label: string; value: string | number; variant?: 'neutral' | 'success' | 'warning' | 'danger' }) {
  const colors = {
    neutral: 'text-foreground',
    success: 'text-green-700',
    warning: 'text-amber-700',
    danger: 'text-red-700',
  } as const;
  return (
    <Card className="glass-card">
      <CardContent className="p-3">
        <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className={cn("text-2xl font-bold mt-0.5", colors[variant])}>{value}</p>
      </CardContent>
    </Card>
  );
}

function SortableHead({
  label, k, sortKey, sortDir, onClick, className,
}: {
  label: string; k: SortKey; sortKey: SortKey; sortDir: SortDir; onClick: (k: SortKey) => void; className?: string;
}) {
  const active = sortKey === k;
  return (
    <TableHead className={cn("cursor-pointer select-none hover:bg-muted/40", className)} onClick={() => onClick(k)}>
      <div className={cn("flex items-center gap-1", className?.includes('text-right') && "justify-end")}>
        <span>{label}</span>
        {active && (sortDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
      </div>
    </TableHead>
  );
}
