import { useEffect, useState } from 'react';
import * as api from '@/lib/apiClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { DepartmentSelect } from '@/components/tasks/DepartmentSelect';
import {
  Plus,
  FileStack,
  Loader2,
  Trash2,
  Edit,
  Check,
  X,
  ListTree,
} from 'lucide-react';

interface Template {
  id: string;
  name: string;
  description: string | null;
  created_by: string | null;
  is_public: number;
  task_count: number;
}

interface TemplateTask {
  id: string;
  titulo_tarea: string;
  detalle: string | null;
  prioridad: string;
  departamento: string | null;
  department_id: string | null;
  cantidad_entregables: number;
  story_points: number | null;
  relative_start_days: number;
  relative_due_days: number;
  parent_template_task_id: string | null;
  sort_order: number;
}

interface Brand {
  id: string;
  nombre: string;
}

interface Desk {
  id: string;
  nombre: string;
}

export default function Templates() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [desks, setDesks] = useState<Desk[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<(Template & { tasks?: TemplateTask[] }) | null>(null);
  const [form, setForm] = useState({ name: '', description: '' });
  const [applyForm, setApplyForm] = useState({ brand_id: '', desk_id: '', start_date: '' });
  const [saving, setSaving] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskPrioridad, setNewTaskPrioridad] = useState<string>('media');
  const [newTaskDepartmentId, setNewTaskDepartmentId] = useState<string | null>(null);
  const [newTaskStartDays, setNewTaskStartDays] = useState<number>(0);
  const [newTaskDueDays, setNewTaskDueDays] = useState<number>(7);
  const [newTaskSaving, setNewTaskSaving] = useState(false);
  const [editingTitle, setEditingTitle] = useState<Record<string, string>>({});

  const fetchTemplates = async () => {
    try {
      const data = await api.getTemplates();
      setTemplates(Array.isArray(data) ? data : []);
    } catch (e) {
      toast.error('Error al cargar plantillas');
    }
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [tData, bData, dData] = await Promise.all([
          api.getTemplates(),
          api.getBrands(),
          api.getDesks(),
        ]);
        setTemplates(Array.isArray(tData) ? tData : []);
        setBrands(Array.isArray(bData) ? bData.filter((b: Brand) => b) : []);
        setDesks(Array.isArray(dData) ? dData.filter((d: Desk) => d) : []);
      } catch (e) {
        toast.error('Error al cargar datos');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const openDetail = async (t: Template) => {
    try {
      const full = await api.getTemplate(t.id);
      setSelectedTemplate(full);
      setDetailOpen(true);
    } catch {
      toast.error('Error al cargar plantilla');
    }
  };

  const handleCreate = async () => {
    if (!form.name.trim()) {
      toast.error('Nombre requerido');
      return;
    }
    setSaving(true);
    try {
      await api.createTemplate({ name: form.name.trim(), description: form.description.trim() || undefined });
      toast.success('Plantilla creada');
      setCreateOpen(false);
      setForm({ name: '', description: '' });
      fetchTemplates();
    } catch (e) {
      toast.error('Error al crear plantilla');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async () => {
    if (!selectedTemplate || !form.name.trim()) return;
    setSaving(true);
    try {
      await api.patchTemplate(selectedTemplate.id, { name: form.name.trim(), description: form.description.trim() || undefined });
      toast.success('Plantilla actualizada');
      setEditOpen(false);
      setSelectedTemplate((prev) => prev ? { ...prev, name: form.name, description: form.description } : null);
      fetchTemplates();
    } catch {
      toast.error('Error al actualizar');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar esta plantilla? Se borrarán todas sus tareas.')) return;
    try {
      await api.deleteTemplate(id);
      toast.success('Plantilla eliminada');
      setDetailOpen(false);
      setSelectedTemplate(null);
      fetchTemplates();
    } catch {
      toast.error('Error al eliminar');
    }
  };

  const handleApply = async () => {
    if (!selectedTemplate || !applyForm.brand_id) {
      toast.error('Selecciona una marca');
      return;
    }
    setSaving(true);
    try {
      const res = await api.applyTemplate(selectedTemplate.id, {
        brand_id: applyForm.brand_id,
        desk_id: applyForm.desk_id || undefined,
        start_date: applyForm.start_date || undefined,
      });
      toast.success(`Se crearon ${res.count ?? 0} tareas`);
      setApplyOpen(false);
      setApplyForm({ brand_id: '', desk_id: '', start_date: '' });
    } catch (e) {
      toast.error((e as Error).message || 'Error al aplicar plantilla');
    } finally {
      setSaving(false);
    }
  };

  const handleAddTask = async () => {
    if (!selectedTemplate || !newTaskTitle.trim()) return;
    setNewTaskSaving(true);
    try {
      await api.addTemplateTask(selectedTemplate.id, {
        titulo_tarea: newTaskTitle.trim(),
        prioridad: newTaskPrioridad,
        department_id: newTaskDepartmentId,
        relative_start_days: newTaskStartDays,
        relative_due_days: newTaskDueDays,
      });
      toast.success('Tarea agregada');
      setNewTaskTitle('');
      setNewTaskPrioridad('media');
      setNewTaskDepartmentId(null);
      setNewTaskStartDays(0);
      setNewTaskDueDays(7);
      const full = await api.getTemplate(selectedTemplate.id);
      setSelectedTemplate(full);
    } catch {
      toast.error('Error al agregar tarea');
    } finally {
      setNewTaskSaving(false);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!selectedTemplate) return;
    try {
      await api.deleteTemplateTask(selectedTemplate.id, taskId);
      toast.success('Tarea eliminada');
      const full = await api.getTemplate(selectedTemplate.id);
      setSelectedTemplate(full);
    } catch {
      toast.error('Error al eliminar tarea');
    }
  };

  const handleUpdateTask = async (taskId: string, updates: { titulo_tarea?: string; prioridad?: string; department_id?: string | null; relative_start_days?: number; relative_due_days?: number }) => {
    if (!selectedTemplate?.tasks) return;
    try {
      await api.patchTemplateTask(selectedTemplate.id, taskId, updates);
      setSelectedTemplate({
        ...selectedTemplate,
        tasks: selectedTemplate.tasks.map((tt) =>
          tt.id === taskId ? { ...tt, ...updates } : tt
        ),
      });
    } catch {
      toast.error('Error al actualizar');
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6 min-w-0 overflow-x-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-foreground truncate">Plantillas de proyecto</h1>
          <p className="text-muted-foreground text-sm mt-1">Crea plantillas reutilizables y aplícalas a marcas para generar tareas automáticamente.</p>
        </div>
        <Button onClick={() => { setForm({ name: '', description: '' }); setCreateOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          Nueva plantilla
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : templates.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FileStack className="h-16 w-16 text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-center mb-4">No hay plantillas. Crea una para reutilizar conjuntos de tareas.</p>
            <Button onClick={() => { setForm({ name: '', description: '' }); setCreateOpen(true); }}>
              <Plus className="h-4 w-4 mr-2" />
              Crear plantilla
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => (
            <Card key={t.id} className="hover:border-primary/50 transition-colors">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between gap-2">
                  <span className="truncate">{t.name}</span>
                  <span className="text-xs font-normal text-muted-foreground shrink-0">{t.task_count} tareas</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {t.description && <p className="text-sm text-muted-foreground line-clamp-2">{t.description}</p>}
                <div className="flex gap-2 flex-wrap">
                  <Button variant="outline" size="sm" onClick={() => openDetail(t)}>
                    <ListTree className="h-3.5 w-3.5 mr-1" />
                    Ver
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => { setSelectedTemplate(t); setForm({ name: t.name, description: t.description || '' }); setEditOpen(true); }}>
                    <Edit className="h-3.5 w-3.5 mr-1" />
                    Editar
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => { setSelectedTemplate(t); setApplyForm({ brand_id: '', desk_id: '', start_date: '' }); setApplyOpen(true); }}>
                    <Check className="h-3.5 w-3.5 mr-1" />
                    Aplicar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Crear plantilla */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent aria-describedby="dialog-new-template-desc">
          <DialogHeader>
            <DialogTitle>Nueva plantilla</DialogTitle>
            <DialogDescription id="dialog-new-template-desc" className="mt-1 block text-foreground/90">Crea una plantilla de proyecto con nombre y descripción.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="create-name">Nombre</Label>
              <Input id="create-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Ej: Proyecto web estándar" />
            </div>
            <div>
              <Label htmlFor="create-desc">Descripción (opcional)</Label>
              <Textarea id="create-desc" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Descripción breve" rows={2} />
            </div>
            <Button onClick={handleCreate} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Crear</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Editar plantilla */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent aria-describedby="dialog-edit-template-desc">
          <DialogHeader>
            <DialogTitle>Editar plantilla</DialogTitle>
            <DialogDescription id="dialog-edit-template-desc" className="mt-1 block text-foreground/90">Modifica el nombre y la descripción de la plantilla.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-name">Nombre</Label>
              <Input id="edit-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="edit-desc">Descripción</Label>
              <Textarea id="edit-desc" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={2} />
            </div>
            <Button onClick={handleEdit} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Guardar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Aplicar plantilla */}
      <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
        <DialogContent aria-describedby="dialog-apply-template-desc">
          <DialogHeader>
            <DialogTitle>Aplicar plantilla{selectedTemplate ? `: ${selectedTemplate.name}` : ''}</DialogTitle>
            <DialogDescription id="dialog-apply-template-desc" className="mt-1 block text-foreground/90">Elige la marca y opciones para crear las tareas a partir de esta plantilla.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Marca *</Label>
              <Select value={applyForm.brand_id} onValueChange={(v) => setApplyForm((f) => ({ ...f, brand_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Seleccionar marca" /></SelectTrigger>
                <SelectContent>
                  {brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Mesa (opcional)</Label>
              <Select value={applyForm.desk_id || '_none_'} onValueChange={(v) => setApplyForm((f) => ({ ...f, desk_id: v === '_none_' ? '' : v }))}>
                <SelectTrigger><SelectValue placeholder="Ninguna" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none_">Ninguna</SelectItem>
                  {desks.map((d) => <SelectItem key={d.id} value={d.id}>{d.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="apply-date">Fecha inicio (opcional)</Label>
              <Input id="apply-date" type="date" value={applyForm.start_date} onChange={(e) => setApplyForm((f) => ({ ...f, start_date: e.target.value }))} />
            </div>
            <Button onClick={handleApply} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Crear tareas</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Detalle / tareas de plantilla */}
      <Dialog open={detailOpen} onOpenChange={(o) => { setDetailOpen(o); if (!o) setSelectedTemplate(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto mx-4 sm:mx-auto" aria-describedby="template-detail-desc">
          <DialogHeader>
            <DialogTitle>{selectedTemplate?.name}</DialogTitle>
            <DialogDescription id="template-detail-desc" className="mt-1 block text-foreground/90 min-h-[1.5rem]">
              {selectedTemplate?.description || 'Tareas y opciones de la plantilla.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row gap-2 sm:flex-wrap sm:items-end">
                <div className="flex-1 min-w-0 w-full sm:min-w-[140px]">
                  <Label className="text-xs text-muted-foreground">Tarea</Label>
                  <Input
                    placeholder="Nueva tarea..."
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddTask()}
                    className="mt-0.5"
                  />
                </div>
                <div className="w-full sm:w-24 shrink-0">
                  <Label className="text-xs text-muted-foreground">Prioridad</Label>
                  <Select value={newTaskPrioridad} onValueChange={setNewTaskPrioridad}>
                    <SelectTrigger className="mt-0.5 h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="alta">Alta</SelectItem>
                      <SelectItem value="media">Media</SelectItem>
                      <SelectItem value="baja">Baja</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-full sm:w-36 shrink-0">
                  <Label className="text-xs text-muted-foreground">Departamento</Label>
                  <DepartmentSelect
                    value={newTaskDepartmentId}
                    onChange={setNewTaskDepartmentId}
                    className="mt-0.5 h-9"
                  />
                </div>
                <div className="w-24 sm:w-20 shrink-0">
                  <Label className="text-xs text-muted-foreground">Inicio (+d)</Label>
                  <Input
                    type="number"
                    min={0}
                    className="mt-0.5 h-9"
                    value={newTaskStartDays}
                    onChange={(e) => { const n = parseInt(e.target.value, 10); if (!isNaN(n) && n >= 0) setNewTaskStartDays(n); }}
                  />
                </div>
                <div className="w-24 sm:w-20 shrink-0">
                  <Label className="text-xs text-muted-foreground">Entrega (+d)</Label>
                  <Input
                    type="number"
                    min={1}
                    className="mt-0.5 h-9"
                    value={newTaskDueDays}
                    onChange={(e) => { const n = parseInt(e.target.value, 10); if (!isNaN(n) && n >= 1) setNewTaskDueDays(n); }}
                  />
                </div>
                <Button onClick={handleAddTask} disabled={newTaskSaving || !newTaskTitle.trim()} className="shrink-0">
                  {newTaskSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => { setApplyForm({ brand_id: '', desk_id: '', start_date: '' }); setApplyOpen(true); }} disabled={!selectedTemplate?.tasks?.length}>
                Aplicar a marca
              </Button>
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={() => {
                  if (!selectedTemplate) return;
                  setForm({ name: selectedTemplate.name, description: selectedTemplate.description || '' });
                  setDetailOpen(false);
                  setEditOpen(true);
                }}
              >
                Editar plantilla
              </Button>
              <Button variant="destructive" size="sm" onClick={() => selectedTemplate && handleDelete(selectedTemplate.id)}>
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                Eliminar
              </Button>
            </div>
            <div className="overflow-x-auto -mx-px">
            <Table className="min-w-[500px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Tarea</TableHead>
                  <TableHead>Prioridad</TableHead>
                  <TableHead>Departamento</TableHead>
                  <TableHead>Inicio</TableHead>
                  <TableHead>Entrega</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(selectedTemplate?.tasks ?? []).map((tt) => (
                  <TableRow key={tt.id}>
                    <TableCell className="font-medium">
                      <Input
                        className="h-8 font-medium"
                        value={editingTitle[tt.id] ?? tt.titulo_tarea}
                        onChange={(e) => setEditingTitle((prev) => ({ ...prev, [tt.id]: e.target.value }))}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          setEditingTitle((prev) => { const next = { ...prev }; delete next[tt.id]; return next; });
                          if (v && v !== tt.titulo_tarea) handleUpdateTask(tt.id, { titulo_tarea: v });
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Select
                        value={tt.prioridad}
                        onValueChange={(v) => handleUpdateTask(tt.id, { prioridad: v })}
                      >
                        <SelectTrigger className="h-8 w-24">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="alta">Alta</SelectItem>
                          <SelectItem value="media">Media</SelectItem>
                          <SelectItem value="baja">Baja</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <DepartmentSelect
                        value={tt.department_id}
                        onChange={(v) => handleUpdateTask(tt.id, { department_id: v })}
                        className="h-8 w-36"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        className="h-8 w-16"
                        value={tt.relative_start_days}
                        onChange={(e) => {
                          const n = parseInt(e.target.value, 10);
                          if (!isNaN(n) && n >= 0) handleUpdateTask(tt.id, { relative_start_days: n });
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={1}
                        className="h-8 w-16"
                        value={tt.relative_due_days}
                        onChange={(e) => {
                          const n = parseInt(e.target.value, 10);
                          if (!isNaN(n) && n >= 1) handleUpdateTask(tt.id, { relative_due_days: n });
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDeleteTask(tt.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
            {(selectedTemplate?.tasks ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No hay tareas. Agrega una arriba.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
