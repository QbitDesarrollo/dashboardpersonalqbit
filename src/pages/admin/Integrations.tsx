import { useEffect, useState } from 'react';
import * as api from '@/lib/apiClient';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Plus, Loader2, Trash2, MessageCircle, Calendar, Github } from 'lucide-react';

const TYPE_LABELS: Record<string, { label: string; icon: React.ReactNode }> = {
  slack: { label: 'Slack', icon: <MessageCircle className="h-4 w-4" /> },
  google_calendar: { label: 'Google Calendar', icon: <Calendar className="h-4 w-4" /> },
  github: { label: 'GitHub', icon: <Github className="h-4 w-4" /> },
  gitlab: { label: 'GitLab', icon: <Github className="h-4 w-4" /> },
};

export default function Integrations() {
  const [items, setItems] = useState<{ id: string; type: string; name: string; brand_nombre: string; is_active: number }[]>([]);
  const [brands, setBrands] = useState<{ id: string; nombre: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ type: 'slack' as string, name: '', brand_id: '', webhook_url: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [iData, bData] = await Promise.all([api.getIntegrations(), api.getBrands()]);
        setItems(Array.isArray(iData) ? iData : []);
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
      const config = form.type === 'slack' ? { webhook_url: form.webhook_url } : {};
      await api.createIntegration({
        type: form.type,
        name: form.name,
        config,
        brand_id: form.brand_id || undefined,
      });
      toast.success('Integración creada');
      setDialogOpen(false);
      setForm({ type: 'slack', name: '', brand_id: '', webhook_url: '' });
      const data = await api.getIntegrations();
      setItems(Array.isArray(data) ? data : []);
    } catch {
      toast.error('Error al crear');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (id: string, isActive: number) => {
    try {
      await api.patchIntegration(id, { is_active: !isActive });
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, is_active: !isActive ? 1 : 0 } : i)));
    } catch {
      toast.error('Error');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar integración?')) return;
    try {
      await api.deleteIntegration(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
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
          <h1 className="text-2xl font-bold">Integraciones</h1>
          <p className="text-muted-foreground text-sm">Conecta Slack, Google Calendar, GitHub...</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nueva
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">No hay integraciones. Añade Slack, Google Calendar o GitHub.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Marca</TableHead>
                  <TableHead>Activa</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        {TYPE_LABELS[i.type]?.icon}
                        {TYPE_LABELS[i.type]?.label || i.type}
                      </span>
                    </TableCell>
                    <TableCell className="font-medium">{i.name}</TableCell>
                    <TableCell>{i.brand_nombre || '-'}</TableCell>
                    <TableCell>
                      <Switch checked={!!i.is_active} onCheckedChange={() => handleToggle(i.id, i.is_active)} />
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDelete(i.id)}>
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
        <DialogContent aria-describedby="int-desc">
          <DialogHeader>
            <DialogTitle>Nueva integración</DialogTitle>
            <DialogDescription id="int-desc">Conecta Slack, Google Calendar, GitHub y otras herramientas.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Tipo</Label>
              <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TYPE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      <span className="flex items-center gap-2">{v.icon} {v.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Nombre</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Ej: Canal #proyectos" />
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
            {form.type === 'slack' && (
              <div>
                <Label>Webhook URL</Label>
                <Input
                  type="url"
                  value={form.webhook_url}
                  onChange={(e) => setForm((f) => ({ ...f, webhook_url: e.target.value }))}
                  placeholder="https://hooks.slack.com/..."
                />
              </div>
            )}
            <Button onClick={handleCreate} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Crear</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
