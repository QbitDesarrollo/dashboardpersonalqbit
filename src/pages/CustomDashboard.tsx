import { useEffect, useState } from 'react';
import * as api from '@/lib/apiClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Plus, Trash2, Loader2, Settings2, Save, X } from 'lucide-react';
import { WidgetRenderer } from '@/components/dashboard/WidgetRenderer';

interface Widget {
  id: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  config?: Record<string, unknown>;
}

interface DashboardItem {
  id: string;
  name: string;
  layout: Widget[];
  is_default: boolean;
}

const WIDGET_TYPES: { value: string; label: string }[] = [
  { value: 'task_count_by_status', label: 'Tareas por Estado' },
  { value: 'task_count_by_priority', label: 'Tareas por Prioridad' },
  { value: 'tasks_due_this_week', label: 'Entregas esta Semana' },
  { value: 'time_tracked_chart', label: 'Tiempo Trabajado' },
  { value: 'tasks_by_brand', label: 'Tareas por Marca' },
  { value: 'tasks_by_user', label: 'Tareas por Usuario' },
];

export default function CustomDashboard() {
  const [dashboards, setDashboards] = useState<DashboardItem[]>([]);
  const [activeDashboard, setActiveDashboard] = useState<DashboardItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [addWidgetOpen, setAddWidgetOpen] = useState(false);
  const [newWidgetType, setNewWidgetType] = useState('task_count_by_status');

  const fetchDashboards = async () => {
    try {
      const data = await api.getDashboards();
      const list = Array.isArray(data) ? data : [];
      setDashboards(list);
      if (list.length > 0 && !activeDashboard) {
        const def = list.find((d: DashboardItem) => d.is_default) || list[0];
        loadDashboard(def.id);
      }
    } catch {
      toast.error('Error al cargar dashboards');
    } finally {
      setLoading(false);
    }
  };

  const loadDashboard = async (id: string) => {
    try {
      const data = await api.getDashboard(id);
      setActiveDashboard(data);
    } catch {
      toast.error('Error al cargar dashboard');
    }
  };

  useEffect(() => { fetchDashboards(); }, []);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const created = await api.createDashboard({ name: newName.trim(), layout: [], is_default: dashboards.length === 0 });
      setCreateOpen(false);
      setNewName('');
      await fetchDashboards();
      loadDashboard(created.id);
      toast.success('Dashboard creado');
    } catch {
      toast.error('Error al crear');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!activeDashboard) return;
    if (!confirm('¿Eliminar este dashboard?')) return;
    try {
      await api.deleteDashboard(activeDashboard.id);
      setActiveDashboard(null);
      fetchDashboards();
      toast.success('Dashboard eliminado');
    } catch {
      toast.error('Error al eliminar');
    }
  };

  const addWidget = () => {
    if (!activeDashboard) return;
    const newWidget: Widget = {
      id: crypto.randomUUID(),
      type: newWidgetType,
      x: 0,
      y: (activeDashboard.layout?.length || 0) * 4,
      w: 6,
      h: 4,
      config: {},
    };
    const updated = { ...activeDashboard, layout: [...(activeDashboard.layout || []), newWidget] };
    setActiveDashboard(updated);
    setAddWidgetOpen(false);
  };

  const removeWidget = (widgetId: string) => {
    if (!activeDashboard) return;
    const updated = { ...activeDashboard, layout: activeDashboard.layout.filter(w => w.id !== widgetId) };
    setActiveDashboard(updated);
  };

  const saveLayout = async () => {
    if (!activeDashboard) return;
    setSaving(true);
    try {
      await api.patchDashboard(activeDashboard.id, { layout: activeDashboard.layout });
      setEditMode(false);
      toast.success('Layout guardado');
    } catch {
      toast.error('Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Mi Dashboard</h2>
          {dashboards.length > 0 && (
            <Select
              value={activeDashboard?.id || ''}
              onValueChange={(id) => loadDashboard(id)}
            >
              <SelectTrigger className="w-48 h-8">
                <SelectValue placeholder="Seleccionar..." />
              </SelectTrigger>
              <SelectContent>
                {dashboards.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="flex items-center gap-2">
          {activeDashboard && !editMode && (
            <Button variant="outline" size="sm" onClick={() => setEditMode(true)}>
              <Settings2 className="h-4 w-4 mr-1" />
              Editar
            </Button>
          )}
          {editMode && (
            <>
              <Button variant="outline" size="sm" onClick={() => setAddWidgetOpen(true)}>
                <Plus className="h-4 w-4 mr-1" />
                Widget
              </Button>
              <Button variant="destructive" size="sm" onClick={handleDelete}>
                <Trash2 className="h-4 w-4 mr-1" />
                Eliminar
              </Button>
              <Button size="sm" onClick={saveLayout} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                Guardar
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { setEditMode(false); loadDashboard(activeDashboard!.id); }}>
                <X className="h-4 w-4" />
              </Button>
            </>
          )}
          <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Nuevo
          </Button>
        </div>
      </div>

      {/* Widget grid */}
      {activeDashboard ? (
        activeDashboard.layout && activeDashboard.layout.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {activeDashboard.layout.map((widget) => (
              <Card key={widget.id} className="relative">
                {editMode && (
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute top-2 right-2 h-6 w-6 z-10"
                    onClick={() => removeWidget(widget.id)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">
                    {WIDGET_TYPES.find(w => w.value === widget.type)?.label || widget.type}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <WidgetRenderer type={widget.type} config={widget.config} />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            <p>Dashboard vacío. Haz clic en "Editar" y luego "Widget" para agregar widgets.</p>
          </div>
        )
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <p>No tienes dashboards. Crea uno para empezar.</p>
          <Button className="mt-4" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Crear Dashboard
          </Button>
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent aria-describedby="create-dash-desc">
          <DialogHeader>
            <DialogTitle>Nuevo Dashboard</DialogTitle>
            <DialogDescription id="create-dash-desc">Crea un dashboard personalizado con widgets.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleCreate(); }} className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre *</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} required placeholder="Mi Dashboard" />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Crear
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add widget dialog */}
      <Dialog open={addWidgetOpen} onOpenChange={setAddWidgetOpen}>
        <DialogContent aria-describedby="add-widget-desc">
          <DialogHeader>
            <DialogTitle>Agregar Widget</DialogTitle>
            <DialogDescription id="add-widget-desc">Selecciona el tipo de widget.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={newWidgetType} onValueChange={setNewWidgetType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WIDGET_TYPES.map((w) => (
                    <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAddWidgetOpen(false)}>Cancelar</Button>
              <Button onClick={addWidget}>Agregar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
