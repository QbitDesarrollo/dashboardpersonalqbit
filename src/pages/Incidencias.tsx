import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as api from '@/lib/apiClient';
import type { Incidencia, IncidenciaKPIs, IncidenciaComentario, IncidenciaActividad } from '@/lib/apiClient';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { RichTextEditor, RichTextViewer } from '@/components/RichTextEditor';
import { Bug, Plus, Loader2, Trash2, Filter, X, MessageSquare, Clock, CheckCircle2, AlertCircle, ListChecks } from 'lucide-react';
import { toast } from 'sonner';
import { cn, getInitials } from '@/lib/utils';

const TIPOS = ['BUG', 'MEJORA', 'QUEJA', 'CONSULTA'];
const PRIORIDADES = ['BAJA', 'MEDIA', 'ALTA', 'CRITICA'];
const ESTADOS = ['ABIERTO', 'EN_PROGRESO', 'RESUELTO', 'CERRADO'];
const MODULOS = [
  'Tareas', 'Subtareas', 'Scrum', 'Entregables', 'Mesas', 'Monitor de Equipo',
  'Cumplimiento', 'Informes', 'Notificaciones', 'Login / Usuarios', 'Emails',
  'Calendario Google', 'Chat de Mesa', 'Otro',
];

const tipoColor: Record<string, string> = {
  BUG: 'bg-red-100 text-red-700 border-red-200',
  MEJORA: 'bg-blue-100 text-blue-700 border-blue-200',
  QUEJA: 'bg-orange-100 text-orange-700 border-orange-200',
  CONSULTA: 'bg-gray-100 text-gray-700 border-gray-200',
};
const prioridadColor: Record<string, string> = {
  CRITICA: 'bg-red-100 text-red-700 border-red-200',
  ALTA: 'bg-orange-100 text-orange-700 border-orange-200',
  MEDIA: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  BAJA: 'bg-green-100 text-green-700 border-green-200',
};
const estadoColor: Record<string, string> = {
  ABIERTO: 'bg-blue-100 text-blue-700 border-blue-200',
  EN_PROGRESO: 'bg-orange-100 text-orange-700 border-orange-200',
  RESUELTO: 'bg-green-100 text-green-700 border-green-200',
  CERRADO: 'bg-gray-100 text-gray-700 border-gray-200',
};
const estadoLabel: Record<string, string> = {
  ABIERTO: 'Abierto', EN_PROGRESO: 'En progreso', RESUELTO: 'Resuelto', CERRADO: 'Cerrado',
};

function fmtDate(s: string | null): string {
  if (!s) return '—';
  try { return new Date(s).toLocaleDateString('es-EC', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  catch { return s; }
}

export default function Incidencias() {
  const { profile } = useAuth();
  const isAdmin = profile?.rol === 'admin';

  const [searchParams, setSearchParams] = useSearchParams();
  const [incidencias, setIncidencias] = useState<Incidencia[]>([]);
  const [kpis, setKpis] = useState<IncidenciaKPIs | null>(null);
  const [loading, setLoading] = useState(true);
  const [fEstado, setFEstado] = useState('all');
  const [fTipo, setFTipo] = useState('all');
  const [fPrioridad, setFPrioridad] = useState('all');
  const [fModulo, setFModulo] = useState('all');

  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.getIncidencias({ estado: fEstado, tipo: fTipo, prioridad: fPrioridad, modulo: fModulo });
      setIncidencias(r.incidencias);
      setKpis(r.kpis);
    } catch (e: any) {
      toast.error(e.message || 'Error al cargar incidencias');
    }
    setLoading(false);
  }, [fEstado, fTipo, fPrioridad, fModulo]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Deep-link ?id=
  useEffect(() => {
    const id = searchParams.get('id');
    if (id) setDetailId(id);
  }, [searchParams]);

  const openDetail = (id: string) => {
    setDetailId(id);
    setSearchParams({ id });
  };
  const closeDetail = () => {
    setDetailId(null);
    searchParams.delete('id');
    setSearchParams(searchParams);
  };

  const clearFilters = () => { setFEstado('all'); setFTipo('all'); setFPrioridad('all'); setFModulo('all'); };
  const hasFilters = fEstado !== 'all' || fTipo !== 'all' || fPrioridad !== 'all' || fModulo !== 'all';

  return (
    <div className="container mx-auto py-4 sm:py-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <Bug className="h-6 w-6 text-primary" /> Incidencias
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Bugs, mejoras, quejas y consultas del equipo sobre Tiusdei.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-1.5">
          <Plus className="h-4 w-4" /> Nueva incidencia
        </Button>
      </div>

      {/* KPIs */}
      {kpis && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <KpiCard icon={<AlertCircle className="h-4 w-4" />} label="Abiertos" value={kpis.abiertos} color="text-blue-600" />
          <KpiCard icon={<Clock className="h-4 w-4" />} label="En progreso" value={kpis.en_progreso} color="text-orange-600" />
          <KpiCard icon={<CheckCircle2 className="h-4 w-4" />} label="Resueltos" value={kpis.resueltos} color="text-green-600" />
          <KpiCard icon={<CheckCircle2 className="h-4 w-4" />} label="Cerrados" value={kpis.cerrados} color="text-gray-500" />
          <KpiCard icon={<ListChecks className="h-4 w-4" />} label="Total" value={kpis.total} color="text-primary" />
          <KpiCard icon={<Clock className="h-4 w-4" />} label="Tiempo prom." value={kpis.horas_promedio != null ? `${kpis.horas_promedio}h` : '—'} color="text-purple-600" />
        </div>
      )}

      {/* Filtros */}
      <Card className="glass-card">
        <CardContent className="p-3 sm:p-4">
          <div className="flex flex-wrap items-end gap-3">
            <FilterSelect label="Estado" value={fEstado} onChange={setFEstado} options={ESTADOS} labels={estadoLabel} />
            <FilterSelect label="Tipo" value={fTipo} onChange={setFTipo} options={TIPOS} />
            <FilterSelect label="Prioridad" value={fPrioridad} onChange={setFPrioridad} options={PRIORIDADES} />
            <FilterSelect label="Módulo" value={fModulo} onChange={setFModulo} options={MODULOS} />
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1 h-9">
                <X className="h-3.5 w-3.5" /> Limpiar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tabla */}
      <Card className="glass-card overflow-hidden">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : incidencias.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-10">Sin incidencias{hasFilters ? ' con estos filtros' : ''}.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Título</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Prioridad</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Módulo</TableHead>
                    <TableHead>Creado por</TableHead>
                    <TableHead>Asignado</TableHead>
                    <TableHead>Fecha</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {incidencias.map((i) => (
                    <TableRow key={i.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openDetail(i.id)}>
                      <TableCell className="font-medium max-w-[280px]">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate">{i.titulo}</span>
                          {(i.comentarios_count ?? 0) > 0 && (
                            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5 shrink-0">
                              <MessageSquare className="h-3 w-3" />{i.comentarios_count}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell><Badge variant="outline" className={cn('text-[10px]', tipoColor[i.tipo])}>{i.tipo}</Badge></TableCell>
                      <TableCell><Badge variant="outline" className={cn('text-[10px]', prioridadColor[i.prioridad])}>{i.prioridad}</Badge></TableCell>
                      <TableCell><Badge variant="outline" className={cn('text-[10px]', estadoColor[i.estado])}>{estadoLabel[i.estado]}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{i.modulo || '—'}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Avatar className="h-6 w-6">
                            {i.creado_por_avatar && <AvatarImage src={i.creado_por_avatar} />}
                            <AvatarFallback className="text-[9px]">{getInitials(i.creado_por_nombre || '?')}</AvatarFallback>
                          </Avatar>
                          <span className="text-xs">{i.creado_por_nombre || '—'}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {i.asignado_a_nombre ? (
                          <div className="flex items-center gap-1.5">
                            <Avatar className="h-6 w-6">
                              {i.asignado_a_avatar && <AvatarImage src={i.asignado_a_avatar} />}
                              <AvatarFallback className="text-[9px]">{getInitials(i.asignado_a_nombre)}</AvatarFallback>
                            </Avatar>
                            <span className="text-xs">{i.asignado_a_nombre}</span>
                          </div>
                        ) : <span className="text-xs text-muted-foreground">Sin asignar</span>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{fmtDate(i.fecha_creacion)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <CrearIncidenciaDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => { setCreateOpen(false); fetchData(); }}
      />

      {detailId && (
        <IncidenciaDetalleDialog
          incidenciaId={detailId}
          isAdmin={isAdmin}
          onClose={closeDetail}
          onChanged={fetchData}
        />
      )}
    </div>
  );
}

// ─────────────────── Sub-componentes ───────────────────

function KpiCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string | number; color: string }) {
  return (
    <Card className="glass-card">
      <CardContent className="p-3">
        <div className={cn('flex items-center gap-1.5 text-[11px] uppercase tracking-wide', color)}>{icon}{label}</div>
        <p className="text-2xl font-bold mt-0.5">{value}</p>
      </CardContent>
    </Card>
  );
}

function FilterSelect({ label, value, onChange, options, labels }: {
  label: string; value: string; onChange: (v: string) => void; options: string[]; labels?: Record<string, string>;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-[150px] h-9"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos</SelectItem>
          {options.map((o) => <SelectItem key={o} value={o}>{labels?.[o] || o}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function CrearIncidenciaDialog({ open, onOpenChange, onCreated }: {
  open: boolean; onOpenChange: (o: boolean) => void; onCreated: () => void;
}) {
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [tipo, setTipo] = useState('BUG');
  const [prioridad, setPrioridad] = useState('MEDIA');
  const [modulo, setModulo] = useState('');
  const [saving, setSaving] = useState(false);

  const reset = () => { setTitulo(''); setDescripcion(''); setTipo('BUG'); setPrioridad('MEDIA'); setModulo(''); };

  const submit = async () => {
    if (!titulo.trim()) { toast.error('El título es obligatorio'); return; }
    setSaving(true);
    try {
      await api.createIncidencia({ titulo: titulo.trim(), descripcion, tipo, prioridad, modulo: modulo || undefined });
      toast.success('Incidencia creada');
      reset();
      onCreated();
    } catch (e: any) {
      toast.error(e.message || 'Error al crear');
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" aria-describedby="crear-inc-desc">
        <DialogHeader>
          <DialogTitle>Nueva incidencia</DialogTitle>
          <DialogDescription id="crear-inc-desc">Reporta un bug, mejora, queja o consulta sobre Tiusdei.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Título *</Label>
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Resumen breve del problema" autoFocus maxLength={200} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TIPOS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Prioridad</Label>
              <Select value={prioridad} onValueChange={setPrioridad}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PRIORIDADES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Módulo</Label>
              <Select value={modulo || 'none'} onValueChange={(v) => setModulo(v === 'none' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin especificar</SelectItem>
                  {MODULOS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Descripción</Label>
            <RichTextEditor
              content={descripcion}
              onChange={setDescripcion}
              placeholder="Describe el problema. Puedes pegar capturas con Ctrl+V."
              minHeight="180px"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={submit} disabled={saving || !titulo.trim()}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Crear incidencia
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function IncidenciaDetalleDialog({ incidenciaId, isAdmin, onClose, onChanged }: {
  incidenciaId: string; isAdmin: boolean; onClose: () => void; onChanged: () => void;
}) {
  const [inc, setInc] = useState<Incidencia | null>(null);
  const [comentarios, setComentarios] = useState<IncidenciaComentario[]>([]);
  const [actividad, setActividad] = useState<IncidenciaActividad[]>([]);
  const [loading, setLoading] = useState(true);
  const [nuevoComentario, setNuevoComentario] = useState('');
  const [esResolucion, setEsResolucion] = useState(false);
  const [sending, setSending] = useState(false);
  const [asignables, setAsignables] = useState<Array<{ id: string; nombre: string }>>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.getIncidencia(incidenciaId);
      setInc(r.incidencia);
      setComentarios(r.comentarios);
      setActividad(r.actividad);
    } catch (e: any) {
      toast.error(e.message || 'Error al cargar incidencia');
      onClose();
    }
    setLoading(false);
  }, [incidenciaId, onClose]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (isAdmin) api.getIncidenciaAsignables().then(setAsignables).catch(() => {});
  }, [isAdmin]);

  const cambiarEstado = async (estado: string) => {
    try {
      await api.setIncidenciaEstado(incidenciaId, estado);
      await load(); onChanged();
      toast.success('Estado actualizado');
    } catch (e: any) { toast.error(e.message || 'Error'); }
  };
  const cambiarPrioridad = async (prioridad: string) => {
    try {
      await api.setIncidenciaPrioridad(incidenciaId, prioridad);
      await load(); onChanged();
    } catch (e: any) { toast.error(e.message || 'Error'); }
  };
  const asignar = async (uid: string) => {
    try {
      await api.asignarIncidencia(incidenciaId, uid === 'none' ? null : uid);
      await load(); onChanged();
      toast.success('Asignación actualizada');
    } catch (e: any) { toast.error(e.message || 'Error'); }
  };
  const enviarComentario = async () => {
    if (!nuevoComentario.trim() || nuevoComentario === '<p></p>') return;
    setSending(true);
    try {
      await api.addIncidenciaComentario(incidenciaId, nuevoComentario, esResolucion);
      setNuevoComentario(''); setEsResolucion(false);
      await load();
      toast.success('Comentario agregado');
    } catch (e: any) { toast.error(e.message || 'Error'); }
    setSending(false);
  };
  const eliminar = async () => {
    if (!confirm('¿Eliminar esta incidencia? Esta acción no se puede deshacer.')) return;
    if (!confirm('Confirma de nuevo: se borrarán también los comentarios y el historial.')) return;
    try {
      await api.deleteIncidencia(incidenciaId);
      toast.success('Incidencia eliminada');
      onChanged(); onClose();
    } catch (e: any) { toast.error(e.message || 'Error'); }
  };

  // Timeline combinado: actividad + comentarios ordenados por fecha
  const timeline = [
    ...actividad.map((a) => ({ kind: 'act' as const, fecha: a.fecha, data: a })),
    ...comentarios.map((c) => ({ kind: 'com' as const, fecha: c.fecha, data: c })),
  ].sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto" aria-describedby="inc-detail-desc">
        {loading || !inc ? (
          <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2 flex-wrap pr-8">
                <Badge variant="outline" className={cn('text-[10px]', tipoColor[inc.tipo])}>{inc.tipo}</Badge>
                <Badge variant="outline" className={cn('text-[10px]', prioridadColor[inc.prioridad])}>{inc.prioridad}</Badge>
                <Badge variant="outline" className={cn('text-[10px]', estadoColor[inc.estado])}>{estadoLabel[inc.estado]}</Badge>
                {inc.modulo && <span className="text-xs text-muted-foreground">· {inc.modulo}</span>}
              </div>
              <DialogTitle className="text-xl">{inc.titulo}</DialogTitle>
              <DialogDescription id="inc-detail-desc">
                Creada por {inc.creado_por_nombre || '—'} · {fmtDate(inc.fecha_creacion)}
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Columna principal */}
              <div className="lg:col-span-2 space-y-4">
                {inc.descripcion && (
                  <div className="rounded-lg border p-3 bg-card">
                    <RichTextViewer content={inc.descripcion} />
                  </div>
                )}

                {/* Timeline */}
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">Actividad</h4>
                  {timeline.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Sin actividad todavía.</p>
                  ) : (
                    <div className="space-y-2">
                      {timeline.map((item) => item.kind === 'act' ? (
                        <div key={`a-${item.data.id}`} className="flex items-start gap-2 text-xs">
                          <span className="mt-1 h-2 w-2 rounded-full bg-primary/60 shrink-0" />
                          <div>
                            <span className="text-muted-foreground">{(item.data as IncidenciaActividad).usuario_nombre}</span>{' '}
                            {(item.data as IncidenciaActividad).accion}
                            <span className="text-muted-foreground"> · {fmtDate(item.fecha)}</span>
                          </div>
                        </div>
                      ) : (
                        <div key={`c-${item.data.id}`} className={cn(
                          'rounded-lg border p-3',
                          (item.data as IncidenciaComentario).es_resolucion ? 'bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-800/60' : 'bg-muted/40'
                        )}>
                          <div className="flex items-center gap-2 mb-1.5">
                            <Avatar className="h-6 w-6">
                              {(item.data as IncidenciaComentario).usuario_avatar && <AvatarImage src={(item.data as IncidenciaComentario).usuario_avatar!} />}
                              <AvatarFallback className="text-[9px]">{getInitials((item.data as IncidenciaComentario).usuario_nombre || '?')}</AvatarFallback>
                            </Avatar>
                            <span className="text-xs font-medium">{(item.data as IncidenciaComentario).usuario_nombre}</span>
                            {(item.data as IncidenciaComentario).es_resolucion === 1 && (
                              <Badge className="text-[9px] bg-green-600">Resolución</Badge>
                            )}
                            <span className="text-[10px] text-muted-foreground ml-auto">{fmtDate(item.fecha)}</span>
                          </div>
                          <RichTextViewer content={(item.data as IncidenciaComentario).comentario} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Editor de comentario */}
                {inc.estado !== 'CERRADO' && (
                  <div className="space-y-2 pt-2 border-t">
                    <RichTextEditor
                      content={nuevoComentario}
                      onChange={setNuevoComentario}
                      placeholder="Escribe un comentario..."
                      minHeight="100px"
                    />
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <Checkbox checked={esResolucion} onCheckedChange={(v) => setEsResolucion(!!v)} />
                        Marcar como resolución
                      </label>
                      <Button size="sm" onClick={enviarComentario} disabled={sending}>
                        {sending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />} Comentar
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Sidebar gestión */}
              <div className="space-y-3">
                <div className="rounded-lg border p-3 space-y-3 bg-card">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Gestionar</h4>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Estado</Label>
                    <div className="grid grid-cols-2 gap-1">
                      {ESTADOS.map((e) => (
                        <Button
                          key={e}
                          size="sm"
                          variant={inc.estado === e ? 'default' : 'outline'}
                          className="text-[10px] h-7"
                          disabled={inc.estado === e}
                          onClick={() => cambiarEstado(e)}
                        >
                          {estadoLabel[e]}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Prioridad</Label>
                    <Select value={inc.prioridad} onValueChange={cambiarPrioridad}>
                      <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>{PRIORIDADES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  {isAdmin && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">Asignado a</Label>
                      <Select value={inc.asignado_a_id || 'none'} onValueChange={asignar}>
                        <SelectTrigger className="h-8"><SelectValue placeholder="Sin asignar" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sin asignar</SelectItem>
                          {asignables.map((u) => <SelectItem key={u.id} value={u.id}>{u.nombre}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                <div className="rounded-lg border p-3 space-y-1.5 bg-card text-xs text-muted-foreground">
                  <div>Creada: {fmtDate(inc.fecha_creacion)}</div>
                  <div>Actualizada: {fmtDate(inc.fecha_actualizacion)}</div>
                  {inc.fecha_cierre && <div>Cerrada: {fmtDate(inc.fecha_cierre)}</div>}
                </div>

                {isAdmin && (
                  <Button variant="outline" className="w-full text-red-600 hover:bg-red-50 gap-1.5" onClick={eliminar}>
                    <Trash2 className="h-4 w-4" /> Eliminar incidencia
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
