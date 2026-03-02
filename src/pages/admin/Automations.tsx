import { useEffect, useState } from 'react';
import * as api from '@/lib/apiClient';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Plus, Loader2, Trash2, Zap } from 'lucide-react';

const TRIGGER_LABELS: Record<string, string> = {
  status_change: 'Cambio de estado',
  date_reached: 'Fecha alcanzada',
  assignment_change: 'Cambio de asignación',
  task_created: 'Tarea creada',
  priority_change: 'Cambio de prioridad',
  comment_added: 'Comentario añadido',
};
const ACTION_LABELS: Record<string, string> = {
  change_status: 'Cambiar estado',
  send_notification: 'Enviar notificación',
  send_email: 'Enviar email',
  assign_user: 'Asignar usuario',
  change_priority: 'Cambiar prioridad',
  add_comment: 'Añadir comentario',
  create_subtask: 'Crear subtarea',
};

export default function Automations() {
  const [items, setItems] = useState<{ id: string; name: string; brand_nombre: string; trigger_type: string; action_type: string; is_active: number; trigger_count: number }[]>([]);
  const [brands, setBrands] = useState<{ id: string; nombre: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    name: '', brand_id: '', trigger_type: 'status_change', action_type: 'send_notification',
    trigger_config: {} as Record<string, unknown>, action_config: {} as Record<string, unknown>,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [aData, bData] = await Promise.all([api.getAutomations(), api.getBrands()]);
        setItems(Array.isArray(aData) ? aData : []);
        setBrands(Array.isArray(bData) ? bData : []);
      } catch {
        toast.error('Error al cargar');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleCreate = async () => {
    if (!form.name) { toast.error('Nombre requerido'); return; }
    setSaving(true);
    try {
      await api.createAutomation(form);
      toast.success('Automatización creada');
      setDialogOpen(false);
      setForm({ name: '', brand_id: '', trigger_type: 'status_change', action_type: 'send_notification', trigger_config: {}, action_config: {} });
      const data = await api.getAutomations();
      setItems(Array.isArray(data) ? data : []);
    } catch {
      toast.error('Error al crear');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (id: string, isActive: number) => {
    try {
      await api.patchAutomation(id, { is_active: !isActive });
      setItems((prev) => prev.map((a) => (a.id === id ? { ...a, is_active: !isActive ? 1 : 0 } : a)));
    } catch {
      toast.error('Error');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar?')) return;
    try {
      await api.deleteAutomation(id);
      setItems((prev) => prev.filter((a) => a.id !== id));
      toast.success('Eliminada');
    } catch {
      toast.error('Error');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Automatizaciones</h1>
          <p className="text-muted-foreground text-sm">Reglas que se ejecutan al ocurrir eventos</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nueva
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">No hay automatizaciones. Crea una para automatizar acciones.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Marca</TableHead>
                  <TableHead>Disparador</TableHead>
                  <TableHead>Acción</TableHead>
                  <TableHead>Ejecuciones</TableHead>
                  <TableHead>Activa</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.name}</TableCell>
                    <TableCell>{a.brand_nombre || '-'}</TableCell>
                    <TableCell>{TRIGGER_LABELS[a.trigger_type] || a.trigger_type}</TableCell>
                    <TableCell>{ACTION_LABELS[a.action_type] || a.action_type}</TableCell>
                    <TableCell>{a.trigger_count}</TableCell>
                    <TableCell>
                      <Switch checked={!!a.is_active} onCheckedChange={() => handleToggle(a.id, a.is_active)} />
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDelete(a.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent aria-describedby="auto-desc">
          <DialogHeader>
            <DialogTitle>Nueva automatización</DialogTitle>
            <DialogDescription id="auto-desc">Configura reglas que se ejecutan cuando ocurre un evento.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nombre</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Ej: Notificar al aprobar" />
            </div>
            <div>
              <Label>Marca</Label>
              <Select value={form.brand_id || '__none__'} onValueChange={(v) => setForm((f) => ({ ...f, brand_id: v === '__none__' ? '' : v }))}>
                <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Todas</SelectItem>
                  {brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Disparador</Label>
              <Select value={form.trigger_type} onValueChange={(v) => setForm((f) => ({ ...f, trigger_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TRIGGER_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Acción</Label>
              <Select value={form.action_type} onValueChange={(v) => setForm((f) => ({ ...f, action_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ACTION_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleCreate} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Crear</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
