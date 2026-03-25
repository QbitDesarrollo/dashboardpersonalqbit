import { useEffect, useState } from 'react';
import * as api from '@/lib/apiClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { toast } from 'sonner';
import { Plus, Loader2, ExternalLink, Trash2, Eye } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || (typeof window !== 'undefined' ? window.location.origin : '');

export default function PublicForms() {
  const [forms, setForms] = useState<{ id: string; name: string; slug: string; brand_nombre: string; submissions_count: number; is_active: number }[]>([]);
  const [brands, setBrands] = useState<{ id: string; nombre: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submissionsOpen, setSubmissionsOpen] = useState(false);
  const [selectedForm, setSelectedForm] = useState<{ id: string; name: string } | null>(null);
  const [submissions, setSubmissions] = useState<{ id: string; data: Record<string, unknown>; task_id: string | null; created_at: string }[]>([]);
  const [form, setForm] = useState({ name: '', description: '', slug: '', brand_id: '', default_prioridad: 'media' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [formsData, brandsData] = await Promise.all([api.getPublicForms(), api.getBrands()]);
        setForms(Array.isArray(formsData) ? formsData : []);
        setBrands(Array.isArray(brandsData) ? brandsData : []);
      } catch (e) {
        toast.error('Error al cargar');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleCreate = async () => {
    if (!form.name || !form.brand_id) { toast.error('Nombre y marca requeridos'); return; }
    setSaving(true);
    try {
      await api.createPublicForm({
        brand_id: form.brand_id,
        name: form.name,
        description: form.description || undefined,
        slug: form.slug || undefined,
        fields_config: [],
        default_prioridad: form.default_prioridad,
      });
      toast.success('Formulario creado');
      setDialogOpen(false);
      setForm({ name: '', description: '', slug: '', brand_id: '', default_prioridad: 'media' });
      const data = await api.getPublicForms();
      setForms(Array.isArray(data) ? data : []);
    } catch (e) {
      toast.error('Error al crear');
    } finally {
      setSaving(false);
    }
  };

  const openSubmissions = async (f: { id: string; name: string }) => {
    setSelectedForm(f);
    setSubmissionsOpen(true);
    try {
      const data = await api.getFormSubmissions(f.id);
      setSubmissions(Array.isArray(data) ? data : []);
    } catch {
      setSubmissions([]);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este formulario?')) return;
    try {
      await api.deletePublicForm(id);
      toast.success('Eliminado');
      setForms((prev) => prev.filter((f) => f.id !== id));
    } catch {
      toast.error('Error al eliminar');
    }
  };

  const formUrl = (slug: string) => `${API_BASE}/form/${slug}`;

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Formularios públicos</h1>
          <p className="text-muted-foreground text-sm">Crea formularios accesibles sin login que generan tareas</p>
        </div>
        <Button className="w-full sm:w-auto" onClick={() => { setForm({ name: '', description: '', slug: '', brand_id: '', default_prioridad: 'media' }); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          Nuevo formulario
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {forms.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">No hay formularios. Crea uno para recibir solicitudes.</div>
          ) : (
            <div className="overflow-x-auto">
            <Table className="min-w-[600px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Marca</TableHead>
                  <TableHead>Envíos</TableHead>
                  <TableHead className="w-40">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {forms.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="font-medium">{f.name}</TableCell>
                    <TableCell><code className="text-xs">{f.slug}</code></TableCell>
                    <TableCell>{f.brand_nombre}</TableCell>
                    <TableCell>{f.submissions_count}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm" asChild>
                          <a href={formUrl(f.slug)} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-4 w-4 mr-1" />
                            Abrir
                          </a>
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => openSubmissions(f)}>
                          <Eye className="h-4 w-4 mr-1" />
                          Envíos
                        </Button>
                        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDelete(f.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="mx-4 sm:mx-auto" aria-describedby="pf-desc">
          <DialogHeader>
            <DialogTitle>Nuevo formulario</DialogTitle>
            <DialogDescription id="pf-desc">Crea un formulario público para capturar solicitudes.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Marca *</Label>
              <Select value={form.brand_id} onValueChange={(v) => setForm((f) => ({ ...f, brand_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  {brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Nombre *</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Contacto" />
            </div>
            <div>
              <Label>Slug (URL)</Label>
              <Input value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} placeholder="contacto" />
              <p className="text-xs text-muted-foreground mt-1">URL: /form/{form.slug || 'contacto'}</p>
            </div>
            <div>
              <Label>Descripción</Label>
              <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Opcional" />
            </div>
            <div>
              <Label>Prioridad por defecto</Label>
              <Select value={form.default_prioridad} onValueChange={(v) => setForm((f) => ({ ...f, default_prioridad: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="baja">Baja</SelectItem>
                  <SelectItem value="media">Media</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleCreate} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Crear</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={submissionsOpen} onOpenChange={setSubmissionsOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto mx-4 sm:mx-auto" aria-describedby="pf-subs-desc">
          <DialogHeader>
            <DialogTitle>Envíos {selectedForm?.name && `· ${selectedForm.name}`}</DialogTitle>
            <DialogDescription id="pf-subs-desc">Listado de envíos recibidos por el formulario.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {submissions.length === 0 ? (
              <p className="text-muted-foreground">Sin envíos</p>
            ) : (
              submissions.map((s) => (
                <Card key={s.id}>
                  <CardContent className="p-4">
                    <pre className="text-xs whitespace-pre-wrap break-words">{JSON.stringify(s.data, null, 2)}</pre>
                    <p className="text-xs text-muted-foreground mt-2">
                      {new Date(s.created_at).toLocaleString('es-ES')}
                      {s.task_id && (
                        <a href={`/tareas?task=${s.task_id}`} className="ml-2 text-primary hover:underline">Ver tarea</a>
                      )}
                    </p>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
