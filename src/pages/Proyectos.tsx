import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as api from '@/lib/apiClient';
import type { Project } from '@/lib/apiClient';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, FolderKanban, Plus, CalendarDays, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { ESTADO_CLS, ESTADO_LABEL, fmt, ProgressBar, SALUD_DOT, SALUD_LABEL } from '@/components/proyectos/comun';
import { DetalleProyecto } from '@/components/proyectos/DetalleProyecto';
import { NuevoProyectoDialog } from '@/components/proyectos/NuevoProyectoDialog';

interface Brand { id: string; nombre: string }
interface Persona { id: string; nombre: string }

export default function Proyectos() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [fBrand, setFBrand] = useState('all');
  const [fEstado, setFEstado] = useState('all');
  const [selected, setSelected] = useState<Project | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  // Link from the "your report is ready" email: open that project and report.
  const proyectoEnlace = searchParams.get('proyecto');
  const reporteEnlace = searchParams.get('reporte') ?? undefined;

  const load = async () => {
    try {
      setLoading(true);
      setProjects(await api.getProjects({ brand_id: fBrand !== 'all' ? fBrand : undefined, estado: fEstado !== 'all' ? fEstado : undefined }));
    } catch { toast.error('Error al cargar proyectos'); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [fBrand, fEstado]);
  useEffect(() => {
    api.getBrands()
      .then((b: unknown) => setBrands(Array.isArray(b) ? (b as (Brand & { activo?: unknown })[]).filter((x) => x.activo !== false && x.activo !== 0) : []))
      .catch(() => {});
  }, []);
  useEffect(() => {
    api.getProfiles()
      .then((ps: unknown) => setPersonas(Array.isArray(ps)
        ? (ps as (Persona & { rol?: string; activo?: unknown })[]).filter((p) => p.rol !== 'cliente' && p.activo !== false && p.activo !== 0).map((p) => ({ id: p.id, nombre: p.nombre }))
        : []))
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!proyectoEnlace || selected) return;
    const p = projects.find((x) => x.id === proyectoEnlace);
    if (p) setSelected(p);
  }, [proyectoEnlace, projects, selected]);

  const volver = () => {
    setSelected(null);
    if (proyectoEnlace) setSearchParams({}, { replace: true });
    load();
  };

  if (selected) {
    return <DetalleProyecto project={selected} personas={personas} onBack={volver} reporteInicial={selected.id === proyectoEnlace ? reporteEnlace : undefined} />;
  }

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

      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">En curso</div><div className="text-2xl font-bold">{stats.en_curso}</div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">En riesgo</div><div className="text-2xl font-bold text-rose-600">{stats.riesgo}</div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Avance promedio</div><div className="text-2xl font-bold">{stats.avgAvance}%</div></CardContent></Card>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Select value={fBrand} onValueChange={setFBrand}><SelectTrigger className="w-44 h-9 text-sm"><SelectValue placeholder="Marca" /></SelectTrigger><SelectContent><SelectItem value="all">Todas las marcas</SelectItem>{brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.nombre}</SelectItem>)}</SelectContent></Select>
        <Select value={fEstado} onValueChange={setFEstado}><SelectTrigger className="w-40 h-9 text-sm"><SelectValue placeholder="Estado" /></SelectTrigger><SelectContent><SelectItem value="all">Todos</SelectItem>{Object.entries(ESTADO_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
      </div>

      {loading ? <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        : projects.length === 0 ? <Card><CardContent className="py-14 text-center text-sm text-muted-foreground">No hay proyectos. Crea el primero.</CardContent></Card>
        : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {projects.map((p) => (
              <Card key={p.id} className="hover:border-primary/40 transition-colors cursor-pointer" onClick={() => setSelected(p)}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold flex items-center gap-2"><span className={cn('inline-block h-2.5 w-2.5 rounded-full', SALUD_DOT[p.salud])} title={SALUD_LABEL[p.salud]} />{p.nombre}</div>
                      <div className="text-xs text-muted-foreground">
                        {p.brand_nombre}{p.lider_nombre ? <> · {p.lider_nombre}</> : <> · <span className="font-medium text-amber-600">Sin líder</span></>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Badge variant="outline" className={cn('text-[10px]', ESTADO_CLS[p.estado])}>{ESTADO_LABEL[p.estado]}</Badge>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (!window.confirm(`¿Eliminar el proyecto "${p.nombre}"? Sus tareas NO se borran: pasan a "Sin proyecto".`)) return;
                          try { await api.deleteProject(p.id); toast.success('Proyecto eliminado'); load(); }
                          catch { toast.error('No se pudo eliminar'); }
                        }}
                        className="rounded p-1 text-muted-foreground/50 hover:text-rose-600 hover:bg-rose-50"
                        title="Eliminar proyecto (las tareas pasan a Sin proyecto)"
                      ><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
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

      <NuevoProyectoDialog abierto={createOpen} onOpenChange={setCreateOpen} marcas={brands} personas={personas} onCreado={load} />
    </div>
  );
}
