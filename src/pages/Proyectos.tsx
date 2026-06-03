import { useEffect, useState } from 'react';
import * as api from '@/lib/apiClient';
import type { Project, ProjectTask } from '@/lib/apiClient';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Loader2, FolderKanban, Plus, ArrowLeft, CalendarDays, Users, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn, getInitials } from '@/lib/utils';
import { Link } from 'react-router-dom';

interface Brand { id: string; nombre: string }

const ESTADO_LABEL: Record<string, string> = { en_curso: 'En curso', pausado: 'Pausado', terminado: 'Terminado', cancelado: 'Cancelado' };
const ESTADO_CLS: Record<string, string> = {
  en_curso: 'bg-blue-100 text-blue-700 border-blue-200', pausado: 'bg-amber-100 text-amber-700 border-amber-200',
  terminado: 'bg-emerald-100 text-emerald-700 border-emerald-200', cancelado: 'bg-slate-100 text-slate-500 border-slate-200',
};
const SALUD_DOT: Record<string, string> = { verde: 'bg-emerald-500', amarillo: 'bg-amber-500', rojo: 'bg-rose-500' };
const SALUD_LABEL: Record<string, string> = { verde: 'A tiempo', amarillo: 'Atención', rojo: 'En riesgo' };

function fmt(s: string | null): string {
  if (!s) return '—';
  try { return new Date(s.slice(0, 10) + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return s; }
}
function ProgressBar({ pct, salud }: { pct: number; salud: string }) {
  const color = salud === 'rojo' ? '#ef4444' : salud === 'amarillo' ? '#f59e0b' : '#10b981';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} /></div>
      <span className="text-xs font-medium text-muted-foreground w-9 text-right">{pct}%</span>
    </div>
  );
}

export default function Proyectos() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [fBrand, setFBrand] = useState('all');
  const [fEstado, setFEstado] = useState('all');
  const [selected, setSelected] = useState<Project | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      setProjects(await api.getProjects({ brand_id: fBrand !== 'all' ? fBrand : undefined, estado: fEstado !== 'all' ? fEstado : undefined }));
    } catch { toast.error('Error al cargar proyectos'); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [fBrand, fEstado]);
  useEffect(() => { api.getBrands().then((b: any) => setBrands(Array.isArray(b) ? b.filter((x: any) => x.activo) : [])).catch(() => {}); }, []);

  const [createOpen, setCreateOpen] = useState(false);
  const [nBrand, setNBrand] = useState(''); const [nNombre, setNNombre] = useState('');
  const [nIni, setNIni] = useState(''); const [nFin, setNFin] = useState(''); const [creating, setCreating] = useState(false);
  const handleCreate = async () => {
    if (!nBrand || !nNombre.trim()) return;
    setCreating(true);
    try {
      await api.createProject({ brand_id: nBrand, nombre: nNombre.trim(), fecha_inicio: nIni || undefined, fecha_fin: nFin || undefined });
      toast.success('Proyecto creado'); setCreateOpen(false); setNBrand(''); setNNombre(''); setNIni(''); setNFin(''); load();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo'); } finally { setCreating(false); }
  };

  if (selected) return <ProjectDetail project={selected} onBack={() => { setSelected(null); load(); }} />;

  const stats = {
    en_curso: projects.filter((p) => p.estado === 'en_curso').length,
    riesgo: projects.filter((p) => p.salud === 'rojo').length,
    avgAvance: projects.length ? Math.round(projects.reduce((s, p) => s + p.avance, 0) / projects.length) : 0,
  };

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-5">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center"><FolderKanban className="h-5 w-5 text-primary" /></div>
        <div className="flex-1"><h1 className="text-2xl font-bold">Proyectos</h1><p className="text-sm text-muted-foreground">Proyectos por cliente, con avance y estado.</p></div>
        <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" />Nuevo proyecto</Button>
      </div>

      {/* mini stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">En curso</div><div className="text-2xl font-bold">{stats.en_curso}</div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">En riesgo</div><div className="text-2xl font-bold text-rose-600">{stats.riesgo}</div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Avance promedio</div><div className="text-2xl font-bold">{stats.avgAvance}%</div></CardContent></Card>
      </div>

      {/* filtros */}
      <div className="flex gap-2 flex-wrap">
        <Select value={fBrand} onValueChange={setFBrand}><SelectTrigger className="w-44 h-9 text-sm"><SelectValue placeholder="Marca" /></SelectTrigger><SelectContent><SelectItem value="all">Todas las marcas</SelectItem>{brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.nombre}</SelectItem>)}</SelectContent></Select>
        <Select value={fEstado} onValueChange={setFEstado}><SelectTrigger className="w-40 h-9 text-sm"><SelectValue placeholder="Estado" /></SelectTrigger><SelectContent><SelectItem value="all">Todos</SelectItem>{Object.entries(ESTADO_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
      </div>

      {loading ? <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        : projects.length === 0 ? <Card><CardContent className="py-14 text-center text-sm text-muted-foreground">No hay proyectos. Creá el primero.</CardContent></Card>
        : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {projects.map((p) => (
              <Card key={p.id} className="hover:border-primary/40 transition-colors cursor-pointer" onClick={() => setSelected(p)}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold flex items-center gap-2"><span className={cn('inline-block h-2.5 w-2.5 rounded-full', SALUD_DOT[p.salud])} title={SALUD_LABEL[p.salud]} />{p.nombre}</div>
                      <div className="text-xs text-muted-foreground">{p.brand_nombre}{p.lider_nombre && <> · {p.lider_nombre}</>}</div>
                    </div>
                    <Badge variant="outline" className={cn('text-[10px] shrink-0', ESTADO_CLS[p.estado])}>{ESTADO_LABEL[p.estado]}</Badge>
                  </div>
                  <ProgressBar pct={p.avance} salud={p.salud} />
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{p.tareas_listas}/{p.total_tareas} tareas{p.vencidas > 0 && <span className="text-rose-500"> · {p.vencidas} vencida(s)</span>}</span>
                    {p.fecha_fin && <span className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{fmt(p.fecha_fin)}</span>}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Nuevo proyecto</DialogTitle><DialogDescription>Agrupá las tareas de un cliente en un proyecto.</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label className="text-xs">Cliente / Marca *</Label><Select value={nBrand} onValueChange={setNBrand}><SelectTrigger><SelectValue placeholder="Seleccionar marca" /></SelectTrigger><SelectContent>{brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.nombre}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label className="text-xs">Nombre del proyecto *</Label><Input value={nNombre} onChange={(e) => setNNombre(e.target.value)} placeholder="ej. Campaña Día del Padre 2026" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5"><Label className="text-xs">Inicio</Label><Input type="date" value={nIni} onChange={(e) => setNIni(e.target.value)} /></div>
              <div className="space-y-1.5"><Label className="text-xs">Entrega objetivo</Label><Input type="date" value={nFin} onChange={(e) => setNFin(e.target.value)} /></div>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button><Button onClick={handleCreate} disabled={creating || !nBrand || !nNombre.trim()}>{creating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Crear</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProjectDetail({ project, onBack }: { project: Project; onBack: () => void }) {
  const [data, setData] = useState<{ project: Project; tasks: ProjectTask[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const load = async () => { try { setLoading(true); setData(await api.getProject(project.id)); } catch { toast.error('Error'); } finally { setLoading(false); } };
  useEffect(() => { load(); }, [project.id]);

  const setEstado = async (estado: string) => { try { await api.patchProject(project.id, { estado }); load(); toast.success('Estado actualizado'); } catch { toast.error('Error'); } };

  if (loading || !data) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  const p = data.project;

  // agrupar tareas por estado
  const STATUS_ORDER = ['backlog', 'en_proceso', 'en_revision', 'revision_interna', 'revision_cliente', 'aprobado', 'entregado', 'bloqueado'];
  const STATUS_LABEL: Record<string, string> = { backlog: 'Pendiente', en_proceso: 'En proceso', en_revision: 'En revisión', revision_interna: 'Revisión interna', revision_cliente: 'Revisión cliente', aprobado: 'Aprobado', entregado: 'Entregado', bloqueado: 'Bloqueado' };
  const grouped: Record<string, ProjectTask[]> = {};
  for (const t of data.tasks) (grouped[t.estado] ||= []).push(t);

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}><ArrowLeft className="h-5 w-5" /></Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold flex items-center gap-2"><span className={cn('inline-block h-3 w-3 rounded-full', SALUD_DOT[p.salud])} />{p.nombre}</h1>
          <p className="text-sm text-muted-foreground">{p.brand_nombre}{p.lider_nombre && <> · Líder: {p.lider_nombre}</>}</p>
        </div>
        <Select value={p.estado} onValueChange={setEstado}><SelectTrigger className="w-36 h-9 text-sm"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(ESTADO_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
      </div>

      {/* resumen */}
      <Card><CardContent className="p-4 space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div><div className="text-xs text-muted-foreground">Avance</div><div className="text-xl font-bold">{p.avance}%</div></div>
          <div><div className="text-xs text-muted-foreground">Tareas</div><div className="text-xl font-bold">{p.tareas_listas}/{p.total_tareas}</div></div>
          <div><div className="text-xs text-muted-foreground">Salud</div><div className="text-xl font-bold flex items-center gap-1.5"><span className={cn('inline-block h-3 w-3 rounded-full', SALUD_DOT[p.salud])} />{SALUD_LABEL[p.salud]}</div></div>
          <div><div className="text-xs text-muted-foreground">Entrega objetivo</div><div className="text-lg font-semibold">{fmt(p.fecha_fin)}</div></div>
        </div>
        <ProgressBar pct={p.avance} salud={p.salud} />
      </CardContent></Card>

      {/* tareas agrupadas por estado */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Tareas del proyecto</h2>
          <Button variant="outline" size="sm" asChild><Link to={`/tareas?project=${p.id}`}><Link2 className="h-4 w-4" />Ver en Tareas</Link></Button>
        </div>
        {data.tasks.length === 0 ? <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Sin tareas en este proyecto todavía. Asignalas desde la vista de Tareas o el detalle de cada tarea.</CardContent></Card>
          : STATUS_ORDER.filter((st) => grouped[st]?.length).map((st) => (
            <div key={st} className="space-y-1.5">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground"><span>{STATUS_LABEL[st]}</span><Badge variant="secondary" className="text-[10px]">{grouped[st].length}</Badge></div>
              <Card><CardContent className="p-0"><div className="divide-y">
                {grouped[st].map((t) => (
                  <div key={t.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <span className="font-medium text-sm">{t.titulo_tarea}</span>
                    <div className="flex items-center gap-3 shrink-0">
                      {t.fecha_entrega && <span className="text-xs text-muted-foreground flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{fmt(t.fecha_entrega)}</span>}
                      {t.responsable_nombre && <Avatar className="h-6 w-6">{t.responsable_avatar && <AvatarImage src={t.responsable_avatar} />}<AvatarFallback className="text-[9px]">{getInitials(t.responsable_nombre)}</AvatarFallback></Avatar>}
                    </div>
                  </div>
                ))}
              </div></CardContent></Card>
            </div>
          ))}
      </div>
    </div>
  );
}
