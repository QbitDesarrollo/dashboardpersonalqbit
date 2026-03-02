import { useEffect, useState } from 'react';
import * as api from '@/lib/apiClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  Plus,
  Calendar,
  Loader2,
  ChevronRight,
  ChevronDown,
  Package,
  Target,
  Layers,
  TrendingUp,
  CheckCircle2,
  Zap,
  ArrowLeft,
  Tag,
  Rocket,
  BarChart3,
  Edit,
  Trash2,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useGlobalFilter } from '@/contexts/GlobalFilterContext';

interface Release {
  id: string;
  name: string;
  description: string | null;
  version: string | null;
  status: 'planning' | 'in_progress' | 'released' | 'cancelled';
  target_date: string | null;
  released_date: string | null;
  brand_id: string | null;
  sprint_count: number;
  brands?: { nombre: string } | null;
}

interface SprintSummary {
  id: string;
  name: string;
  status: 'planned' | 'active' | 'completed';
  start_date: string;
  end_date: string;
  goal: string | null;
  totalTasks: number;
  completedTasks: number;
  totalPoints: number;
  completedPoints: number;
}

interface FeatureSummary {
  featureId: string;
  name: string;
  tasks: number;
  points: number;
  completed: number;
}

interface ReleaseDetail {
  release: Release;
  sprints: SprintSummary[];
  totalTasks: number;
  totalPoints: number;
  completedTasks: number;
  completedPoints: number;
  remainingPoints: number;
  progressPercent: number;
  pointsPercent: number;
  byFeature: FeatureSummary[];
  byStatus: Record<string, number>;
}

const STATUS_LABELS: Record<string, string> = {
  planning: 'Planificando',
  in_progress: 'En progreso',
  released: 'Publicado',
  cancelled: 'Cancelado',
};

const STATUS_COLORS: Record<string, string> = {
  planning: 'bg-blue-500',
  in_progress: 'bg-amber-500',
  released: 'bg-emerald-500',
  cancelled: 'bg-red-500',
};

const STATUS_BADGE_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  planning: 'secondary',
  in_progress: 'default',
  released: 'outline',
  cancelled: 'destructive',
};

const TASK_STATUS_LABELS: Record<string, string> = {
  backlog: 'Backlog', en_proceso: 'En proceso', en_revision: 'En revisión',
  aprobado: 'Aprobado', entregado: 'Entregado', bloqueado: 'Bloqueado',
};
const TASK_STATUS_COLORS: Record<string, string> = {
  backlog: 'bg-slate-400', en_proceso: 'bg-blue-500', en_revision: 'bg-amber-500',
  aprobado: 'bg-emerald-500', entregado: 'bg-green-600', bloqueado: 'bg-red-500',
};

export default function ReleasePlanning() {
  const { pinnedBrandId } = useGlobalFilter();
  const [releases, setReleases] = useState<Release[]>([]);
  const [allSprints, setAllSprints] = useState<{ id: string; name: string; status: string; start_date: string; end_date: string }[]>([]);
  const [brands, setBrands] = useState<{ id: string; nombre: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ReleaseDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [sprintDialogOpen, setSprintDialogOpen] = useState(false);
  const [selectedSprintIds, setSelectedSprintIds] = useState<string[]>([]);
  const [savingSprints, setSavingSprints] = useState(false);

  const [editingRelease, setEditingRelease] = useState<Release | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  const [form, setForm] = useState({
    name: '', description: '', version: '', target_date: '', brand_id: '',
  });
  const [editForm, setEditForm] = useState({
    name: '', description: '', version: '', target_date: '', status: '' as string, brand_id: '',
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const [releasesRes, sprintsRes, brandsRes] = await Promise.all([
        api.getReleases(pinnedBrandId || undefined),
        api.getSprints() as Promise<any[]>,
        api.getBrands() as Promise<{ id: string; nombre: string; activo?: boolean }[]>,
      ]);
      setReleases(Array.isArray(releasesRes) ? releasesRes : []);
      setAllSprints(Array.isArray(sprintsRes) ? sprintsRes : []);
      setBrands(Array.isArray(brandsRes) ? brandsRes.filter((b) => b.activo !== false) : []);
    } catch {
      toast.error('Error al cargar releases');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [pinnedBrandId]);

  const expandRelease = async (releaseId: string) => {
    if (expandedId === releaseId) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    setExpandedId(releaseId);
    setLoadingDetail(true);
    try {
      const data = await api.getRelease(releaseId);
      setDetail(data);
    } catch {
      toast.error('Error al cargar detalles del release');
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) { toast.error('Nombre obligatorio'); return; }
    setSaving(true);
    try {
      await api.createRelease({
        name: form.name,
        description: form.description || undefined,
        version: form.version || undefined,
        target_date: form.target_date || undefined,
        brand_id: form.brand_id || undefined,
      });
      toast.success('Release creado');
      setDialogOpen(false);
      setForm({ name: '', description: '', version: '', target_date: '', brand_id: '' });
      fetchData();
    } catch { toast.error('Error al crear release'); }
    finally { setSaving(false); }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRelease) return;
    setSaving(true);
    try {
      await api.patchRelease(editingRelease.id, {
        name: editForm.name,
        description: editForm.description || null,
        version: editForm.version || null,
        target_date: editForm.target_date || null,
        status: editForm.status,
        brand_id: editForm.brand_id || null,
      });
      toast.success('Release actualizado');
      setEditDialogOpen(false);
      setEditingRelease(null);
      fetchData();
      if (expandedId === editingRelease.id) expandRelease(editingRelease.id);
    } catch { toast.error('Error al actualizar'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (releaseId: string) => {
    if (!confirm('¿Eliminar este release?')) return;
    try {
      await api.deleteRelease(releaseId);
      toast.success('Release eliminado');
      if (expandedId === releaseId) { setExpandedId(null); setDetail(null); }
      fetchData();
    } catch { toast.error('Error al eliminar'); }
  };

  const handleStatusChange = async (releaseId: string, newStatus: string) => {
    try {
      const data: Record<string, unknown> = { status: newStatus };
      if (newStatus === 'released') data.released_date = new Date().toISOString().slice(0, 10);
      await api.patchRelease(releaseId, data);
      toast.success(`Release ${STATUS_LABELS[newStatus]?.toLowerCase() || newStatus}`);
      fetchData();
      if (expandedId === releaseId) expandRelease(releaseId);
    } catch { toast.error('Error al cambiar estado'); }
  };

  const openSprintAssignment = (release: Release) => {
    setSprintDialogOpen(true);
    setEditingRelease(release);
    if (detail && detail.release.id === release.id) {
      setSelectedSprintIds(detail.sprints.map((s) => s.id));
    } else {
      setSelectedSprintIds([]);
    }
  };

  const handleSaveSprints = async () => {
    if (!editingRelease) return;
    setSavingSprints(true);
    try {
      await api.setReleaseSprints(editingRelease.id, selectedSprintIds);
      toast.success('Sprints asignados');
      setSprintDialogOpen(false);
      fetchData();
      if (expandedId === editingRelease.id) expandRelease(editingRelease.id);
    } catch { toast.error('Error al asignar sprints'); }
    finally { setSavingSprints(false); }
  };

  const openEditDialog = (release: Release) => {
    setEditingRelease(release);
    setEditForm({
      name: release.name,
      description: release.description || '',
      version: release.version || '',
      target_date: release.target_date ? release.target_date.slice(0, 10) : '',
      status: release.status,
      brand_id: release.brand_id || '',
    });
    setEditDialogOpen(true);
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-[300px]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const planningReleases = releases.filter((r) => r.status === 'planning');
  const inProgressReleases = releases.filter((r) => r.status === 'in_progress');
  const releasedReleases = releases.filter((r) => r.status === 'released');
  const cancelledReleases = releases.filter((r) => r.status === 'cancelled');

  const renderReleaseRow = (release: Release) => {
    const isExpanded = expandedId === release.id;
    const daysUntil = release.target_date
      ? Math.ceil((new Date(release.target_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : null;

    return (
      <div key={release.id} className="border rounded-lg overflow-hidden">
        <div
          className={cn(
            'flex items-center gap-3 p-4 cursor-pointer hover:bg-muted/50 transition-colors',
            isExpanded && 'bg-muted/30 border-b'
          )}
          onClick={() => expandRelease(release.id)}
        >
          {isExpanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold">{release.name}</span>
              {release.version && <Badge variant="outline" className="text-xs font-mono"><Tag className="h-3 w-3 mr-1" />{release.version}</Badge>}
              <Badge variant={STATUS_BADGE_VARIANT[release.status]}>{STATUS_LABELS[release.status]}</Badge>
              {release.brands?.nombre && <Badge variant="outline" className="text-xs">{release.brands.nombre}</Badge>}
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
              {release.target_date && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Meta: {new Date(release.target_date).toLocaleDateString('es')}
                  {daysUntil !== null && release.status !== 'released' && release.status !== 'cancelled' && (
                    <span className={cn('ml-1', daysUntil < 0 ? 'text-red-500 font-medium' : daysUntil <= 7 ? 'text-amber-500' : '')}>
                      ({daysUntil < 0 ? `${Math.abs(daysUntil)}d atrasado` : `${daysUntil}d restantes`})
                    </span>
                  )}
                </span>
              )}
              {release.released_date && (
                <span className="flex items-center gap-1"><Rocket className="h-3 w-3" />Publicado: {new Date(release.released_date).toLocaleDateString('es')}</span>
              )}
              <span>{release.sprint_count} sprint{release.sprint_count !== 1 ? 's' : ''}</span>
              {release.description && <span className="truncate max-w-[200px]">{release.description}</span>}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
            {release.status === 'planning' && (
              <Button size="sm" variant="default" onClick={() => handleStatusChange(release.id, 'in_progress')}>
                <Rocket className="h-3 w-3 mr-1" /> Iniciar
              </Button>
            )}
            {release.status === 'in_progress' && (
              <Button size="sm" variant="outline" onClick={() => handleStatusChange(release.id, 'released')}>
                <CheckCircle2 className="h-3 w-3 mr-1" /> Publicar
              </Button>
            )}
            {(release.status === 'released' || release.status === 'cancelled') && (
              <Button size="sm" variant="ghost" onClick={() => handleStatusChange(release.id, 'planning')}>
                Reabrir
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => openEditDialog(release)} title="Editar">
              <Edit className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => handleDelete(release.id)} title="Eliminar">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {isExpanded && (
          <div className="p-4 space-y-6 bg-muted/10">
            {loadingDetail ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : detail ? (
              <>
                {/* KPIs */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <Card>
                    <CardContent className="p-3 text-center">
                      <div className="text-2xl font-bold text-primary">{detail.sprints.length}</div>
                      <div className="text-xs text-muted-foreground">Sprints</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-3 text-center">
                      <div className="text-2xl font-bold">{detail.totalTasks}</div>
                      <div className="text-xs text-muted-foreground">Tareas</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-3 text-center">
                      <div className="text-2xl font-bold text-emerald-500">{detail.completedTasks}</div>
                      <div className="text-xs text-muted-foreground">Completadas</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-3 text-center">
                      <div className="text-2xl font-bold text-blue-500">{detail.totalPoints}</div>
                      <div className="text-xs text-muted-foreground">Story Points</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-3 text-center">
                      <div className="text-2xl font-bold text-amber-500">{detail.remainingPoints}</div>
                      <div className="text-xs text-muted-foreground">Restantes</div>
                    </CardContent>
                  </Card>
                </div>

                {/* Progress */}
                <div className="grid md:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Progreso de Tareas</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between text-sm mb-2">
                        <span>{detail.completedTasks} / {detail.totalTasks}</span>
                        <span className="font-bold">{detail.progressPercent}%</span>
                      </div>
                      <Progress value={detail.progressPercent} className="h-3" />
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2"><Zap className="h-4 w-4" /> Progreso de Puntos</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between text-sm mb-2">
                        <span>{detail.completedPoints} / {detail.totalPoints} pts</span>
                        <span className="font-bold">{detail.pointsPercent}%</span>
                      </div>
                      <Progress value={detail.pointsPercent} className="h-3" />
                    </CardContent>
                  </Card>
                </div>

                {/* Status Distribution */}
                {Object.keys(detail.byStatus).length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Distribución por Estado</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex gap-1 h-8 rounded-lg overflow-hidden mb-3">
                        {Object.entries(detail.byStatus).map(([status, count]) => {
                          const pct = detail.totalTasks > 0 ? (count / detail.totalTasks) * 100 : 0;
                          if (pct === 0) return null;
                          return (
                            <div
                              key={status}
                              className={cn('transition-all', TASK_STATUS_COLORS[status] || 'bg-gray-400')}
                              style={{ width: `${pct}%` }}
                              title={`${TASK_STATUS_LABELS[status] || status}: ${count}`}
                            />
                          );
                        })}
                      </div>
                      <div className="flex flex-wrap gap-3">
                        {Object.entries(detail.byStatus).map(([status, count]) => (
                          <div key={status} className="flex items-center gap-1.5 text-xs">
                            <div className={cn('w-2.5 h-2.5 rounded-full', TASK_STATUS_COLORS[status] || 'bg-gray-400')} />
                            <span>{TASK_STATUS_LABELS[status] || status}: <strong>{count}</strong></span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Sprints Timeline */}
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm flex items-center gap-2"><Layers className="h-4 w-4" /> Sprints del Release ({detail.sprints.length})</CardTitle>
                      <Button size="sm" variant="outline" onClick={() => openSprintAssignment(release)}>
                        <Plus className="h-3 w-3 mr-1" /> Asignar Sprints
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {detail.sprints.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No hay sprints asignados a este release. Haz clic en "Asignar Sprints" para agregarlos.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {detail.sprints.map((sprint) => {
                          const pct = sprint.totalTasks > 0 ? Math.round((sprint.completedTasks / sprint.totalTasks) * 100) : 0;
                          const sprintBadge = sprint.status === 'active'
                            ? <Badge className="bg-primary text-primary-foreground text-xs">Activo</Badge>
                            : sprint.status === 'completed'
                              ? <Badge variant="outline" className="text-xs">Completado</Badge>
                              : <Badge variant="secondary" className="text-xs">Planificado</Badge>;
                          return (
                            <div key={sprint.id} className="border rounded-lg p-3">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-sm">{sprint.name}</span>
                                  {sprintBadge}
                                </div>
                                <span className="text-xs text-muted-foreground">
                                  {new Date(sprint.start_date).toLocaleDateString('es')} – {new Date(sprint.end_date).toLocaleDateString('es')}
                                </span>
                              </div>
                              {sprint.goal && <p className="text-xs text-muted-foreground mb-2">{sprint.goal}</p>}
                              <div className="grid grid-cols-3 gap-2 mb-2 text-xs">
                                <div>
                                  <span className="text-muted-foreground">Tareas:</span>{' '}
                                  <strong>{sprint.completedTasks}/{sprint.totalTasks}</strong>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Puntos:</span>{' '}
                                  <strong>{sprint.completedPoints}/{sprint.totalPoints}</strong>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Progreso:</span>{' '}
                                  <strong>{pct}%</strong>
                                </div>
                              </div>
                              <Progress value={pct} className="h-2" />
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* By Feature */}
                {detail.byFeature.length > 0 && detail.byFeature.some((f) => f.featureId !== '_none_') && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2"><Target className="h-4 w-4" /> Por Feature</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {detail.byFeature.map((f) => {
                          const maxTasks = Math.max(...detail.byFeature.map((x) => x.tasks), 1);
                          const pct = (f.tasks / maxTasks) * 100;
                          const completePct = f.tasks > 0 ? (f.completed / f.tasks) * 100 : 0;
                          return (
                            <div key={f.featureId}>
                              <div className="flex justify-between text-sm mb-1">
                                <span className="font-medium">{f.name}</span>
                                <span className="text-muted-foreground">{f.completed}/{f.tasks} tareas · {f.points} pts</span>
                              </div>
                              <div className="flex gap-0.5 h-5 rounded overflow-hidden bg-muted/50" style={{ width: `${pct}%`, minWidth: '60px' }}>
                                <div className="bg-emerald-500 transition-all" style={{ width: `${completePct}%` }} />
                                <div className="bg-blue-400 flex-1" />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            ) : null}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/scrum"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <h2 className="text-xl font-bold text-foreground">Release Planning</h2>
            <p className="text-sm text-muted-foreground">Planificación de versiones y releases</p>
          </div>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gradient-primary"><Plus className="h-4 w-4 mr-2" /> Nuevo Release</Button>
          </DialogTrigger>
          <DialogContent aria-describedby="release-desc">
            <DialogHeader>
              <DialogTitle>Crear Release</DialogTitle>
              <DialogDescription id="release-desc">Define una nueva versión o release del producto.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <Label>Nombre *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Release v1.0" required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Versión</Label>
                  <Input value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} placeholder="v1.0.0" />
                </div>
                <div>
                  <Label>Fecha objetivo</Label>
                  <Input type="date" value={form.target_date} onChange={(e) => setForm({ ...form, target_date: e.target.value })} />
                </div>
              </div>
              <div>
                <Label>Descripción</Label>
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Objetivos del release..." rows={2} />
              </div>
              <div>
                <Label>Marca / Proyecto</Label>
                <Select value={form.brand_id || 'none'} onValueChange={(v) => setForm({ ...form, brand_id: v === 'none' ? '' : v })}>
                  <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Todas</SelectItem>
                    {brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Crear'}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4 flex items-center gap-3"><Package className="h-8 w-8 text-blue-500" /><div><div className="text-xl font-bold">{planningReleases.length}</div><div className="text-xs text-muted-foreground">Planificando</div></div></CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3"><Rocket className="h-8 w-8 text-amber-500" /><div><div className="text-xl font-bold">{inProgressReleases.length}</div><div className="text-xs text-muted-foreground">En progreso</div></div></CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3"><CheckCircle2 className="h-8 w-8 text-emerald-500" /><div><div className="text-xl font-bold">{releasedReleases.length}</div><div className="text-xs text-muted-foreground">Publicados</div></div></CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3"><Target className="h-8 w-8 text-primary" /><div><div className="text-xl font-bold">{releases.length}</div><div className="text-xs text-muted-foreground">Total</div></div></CardContent></Card>
      </div>

      {/* Release list */}
      {releases.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Package className="h-12 w-12 mb-4 text-muted-foreground/50" />
            <p className="text-lg font-medium mb-1">No hay releases</p>
            <p className="text-sm mb-4">Crea tu primer release para planificar versiones.</p>
            <Button onClick={() => setDialogOpen(true)} className="gradient-primary">
              <Plus className="h-4 w-4 mr-2" /> Crear Release
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {inProgressReleases.length > 0 && (
            <>
              <h3 className="text-sm font-semibold text-muted-foreground pt-2">En Progreso ({inProgressReleases.length})</h3>
              {inProgressReleases.map(renderReleaseRow)}
            </>
          )}
          {planningReleases.length > 0 && (
            <>
              <h3 className="text-sm font-semibold text-muted-foreground pt-2">Planificando ({planningReleases.length})</h3>
              {planningReleases.map(renderReleaseRow)}
            </>
          )}
          {releasedReleases.length > 0 && (
            <>
              <h3 className="text-sm font-semibold text-muted-foreground pt-2">Publicados ({releasedReleases.length})</h3>
              {releasedReleases.map(renderReleaseRow)}
            </>
          )}
          {cancelledReleases.length > 0 && (
            <>
              <h3 className="text-sm font-semibold text-muted-foreground pt-2">Cancelados ({cancelledReleases.length})</h3>
              {cancelledReleases.map(renderReleaseRow)}
            </>
          )}
        </div>
      )}

      {/* Edit Release Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent aria-describedby="edit-release-desc">
          <DialogHeader>
            <DialogTitle>Editar Release</DialogTitle>
            <DialogDescription id="edit-release-desc">Modifica los datos del release.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEdit} className="space-y-4">
            <div>
              <Label>Nombre *</Label>
              <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Versión</Label>
                <Input value={editForm.version} onChange={(e) => setEditForm({ ...editForm, version: e.target.value })} placeholder="v1.0.0" />
              </div>
              <div>
                <Label>Fecha objetivo</Label>
                <Input type="date" value={editForm.target_date} onChange={(e) => setEditForm({ ...editForm, target_date: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Estado</Label>
              <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="planning">Planificando</SelectItem>
                  <SelectItem value="in_progress">En progreso</SelectItem>
                  <SelectItem value="released">Publicado</SelectItem>
                  <SelectItem value="cancelled">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Descripción</Label>
              <Textarea value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} rows={2} />
            </div>
            <div>
              <Label>Marca / Proyecto</Label>
              <Select value={editForm.brand_id || 'none'} onValueChange={(v) => setEditForm({ ...editForm, brand_id: v === 'none' ? '' : v })}>
                <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Todas</SelectItem>
                  {brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Assign Sprints Dialog */}
      <Dialog open={sprintDialogOpen} onOpenChange={setSprintDialogOpen}>
        <DialogContent aria-describedby="assign-sprints-desc" className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Asignar Sprints al Release</DialogTitle>
            <DialogDescription id="assign-sprints-desc">Selecciona los sprints que forman parte de este release.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[400px] overflow-y-auto space-y-2 py-2">
            {allSprints.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No hay sprints disponibles.</p>
            ) : (
              allSprints.map((sprint) => {
                const isSelected = selectedSprintIds.includes(sprint.id);
                return (
                  <label
                    key={sprint.id}
                    className={cn(
                      'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
                      isSelected ? 'bg-primary/5 border-primary/30' : 'hover:bg-muted/50'
                    )}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedSprintIds([...selectedSprintIds, sprint.id]);
                        } else {
                          setSelectedSprintIds(selectedSprintIds.filter((id) => id !== sprint.id));
                        }
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{sprint.name}</span>
                        <Badge variant={sprint.status === 'active' ? 'default' : sprint.status === 'completed' ? 'outline' : 'secondary'} className="text-xs">
                          {sprint.status === 'active' ? 'Activo' : sprint.status === 'completed' ? 'Completado' : 'Planificado'}
                        </Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(sprint.start_date).toLocaleDateString('es')} – {new Date(sprint.end_date).toLocaleDateString('es')}
                      </span>
                    </div>
                  </label>
                );
              })
            )}
          </div>
          <div className="flex justify-between items-center pt-2">
            <span className="text-xs text-muted-foreground">{selectedSprintIds.length} sprint{selectedSprintIds.length !== 1 ? 's' : ''} seleccionado{selectedSprintIds.length !== 1 ? 's' : ''}</span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setSprintDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleSaveSprints} disabled={savingSprints}>
                {savingSprints ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
