import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Edit, Loader2, Settings, FileBox, CheckSquare } from 'lucide-react';

interface ItemType {
  id: string;
  nombre: string;
  activo: boolean;
}

export default function AdminConfig() {
  const [taskTypes, setTaskTypes] = useState<ItemType[]>([]);
  const [deliverableTypes, setDeliverableTypes] = useState<ItemType[]>([]);
  const [loading, setLoading] = useState(true);

  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [delDialogOpen, setDelDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({ nombre: '', activo: true });
  const [selectedItem, setSelectedItem] = useState<{ type: 'task' | 'deliverable'; item: ItemType } | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [taskRes, delRes] = await Promise.all([
        supabase.from('task_types').select('*').order('nombre'),
        supabase.from('deliverable_types').select('*').order('nombre'),
      ]);

      if (taskRes.data) setTaskTypes(taskRes.data);
      if (delRes.data) setDeliverableTypes(delRes.data);
    } catch (error) {
      toast.error('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (type: 'task' | 'deliverable') => {
    setSaving(true);
    const table = type === 'task' ? 'task_types' : 'deliverable_types';

    try {
      if (selectedItem) {
        const { error } = await supabase.from(table).update(formData).eq('id', selectedItem.item.id);
        if (error) throw error;
        toast.success('Tipo actualizado');
      } else {
        const { error } = await supabase.from(table).insert(formData);
        if (error) throw error;
        toast.success('Tipo creado');
      }

      type === 'task' ? setTaskDialogOpen(false) : setDelDialogOpen(false);
      setFormData({ nombre: '', activo: true });
      setSelectedItem(null);
      fetchData();
    } catch (error: any) {
      toast.error('Error', { description: error.message });
    } finally {
      setSaving(false);
    }
  };

  const openEditDialog = (type: 'task' | 'deliverable', item: ItemType) => {
    setSelectedItem({ type, item });
    setFormData({ nombre: item.nombre, activo: item.activo });
    type === 'task' ? setTaskDialogOpen(true) : setDelDialogOpen(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const TypeDialog = ({ type, open, onOpenChange }: { type: 'task' | 'deliverable'; open: boolean; onOpenChange: (open: boolean) => void }) => (
    <Dialog open={open} onOpenChange={(o) => {
      onOpenChange(o);
      if (!o) {
        setFormData({ nombre: '', activo: true });
        setSelectedItem(null);
      }
    }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="h-4 w-4 mr-1" />
          Añadir
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {selectedItem ? 'Editar' : 'Nuevo'} Tipo de {type === 'task' ? 'Tarea' : 'Entregable'}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); handleSubmit(type); }} className="space-y-4">
          <div className="space-y-2">
            <Label>Nombre *</Label>
            <Input
              value={formData.nombre}
              onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
              required
            />
          </div>
          <div className="flex items-center justify-between">
            <Label>Activo</Label>
            <Switch
              checked={formData.activo}
              onCheckedChange={(checked) => setFormData({ ...formData, activo: checked })}
            />
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {selectedItem ? 'Guardar' : 'Crear'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold text-foreground">Configuración</h2>
        <p className="text-sm text-muted-foreground">Gestiona tipos de tareas y entregables</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4 sm:gap-6">
        {/* Task Types */}
        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2 sm:pb-4">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <CheckSquare className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
              <span className="truncate">Tipos de Tarea</span>
            </CardTitle>
            <TypeDialog type="task" open={taskDialogOpen} onOpenChange={setTaskDialogOpen} />
          </CardHeader>
          <CardContent>
            {taskTypes.length === 0 ? (
              <p className="text-center py-4 text-muted-foreground">No hay tipos</p>
            ) : (
              <div className="space-y-2">
                {taskTypes.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-2 sm:p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors gap-2"
                  >
                    <span className="font-medium text-sm truncate">{item.nombre}</span>
                    <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                      <Badge variant={item.activo ? "default" : "secondary"} className="text-[10px] sm:text-xs">
                        {item.activo ? 'Activo' : 'Inactivo'}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 sm:h-8 sm:w-8"
                        onClick={() => openEditDialog('task', item)}
                      >
                        <Edit className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Deliverable Types */}
        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2 sm:pb-4">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <FileBox className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
              <span className="truncate">Tipos de Entregable</span>
            </CardTitle>
            <TypeDialog type="deliverable" open={delDialogOpen} onOpenChange={setDelDialogOpen} />
          </CardHeader>
          <CardContent>
            {deliverableTypes.length === 0 ? (
              <p className="text-center py-4 text-muted-foreground text-sm">No hay tipos</p>
            ) : (
              <div className="space-y-2">
                {deliverableTypes.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-2 sm:p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors gap-2"
                  >
                    <span className="font-medium text-sm truncate">{item.nombre}</span>
                    <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                      <Badge variant={item.activo ? "default" : "secondary"} className="text-[10px] sm:text-xs">
                        {item.activo ? 'Activo' : 'Inactivo'}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 sm:h-8 sm:w-8"
                        onClick={() => openEditDialog('deliverable', item)}
                      >
                        <Edit className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
