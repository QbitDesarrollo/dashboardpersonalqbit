import { useEffect, useState } from 'react';
import * as api from '@/lib/apiClient';
import { useGlobalFilter } from '@/contexts/GlobalFilterContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { toast } from 'sonner';
import { cn } from 'lucide-react';
import { ArrowLeft, Loader2, Plus, Edit, Layers } from 'lucide-react';
import { Link } from 'react-router-dom';

interface Feature {
  id: string;
  name: string;
  description: string | null;
  brand_id: string | null;
  status: 'backlog' | 'en_progreso' | 'completado';
  brands?: { nombre: string } | null;
}

const STATUS_LABELS: Record<string, string> = {
  backlog: 'Backlog',
  en_progreso: 'En progreso',
  completado: 'Completado',
};

export default function ScrumFeatures() {
  const { pinnedBrandId } = useGlobalFilter();
  const [features, setFeatures] = useState<Feature[]>([]);
  const [brands, setBrands] = useState<{ id: string; nombre: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [primeraCarga, setPrimeraCarga] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingFeature, setEditingFeature] = useState<Feature | null>(null);
  const [form, setForm] = useState({ name: '', description: '', brand_id: '', status: 'backlog' as const });

  const fetchData = async () => {
    try {
      setLoading(true);
      const [featuresRes, brandsRes] = await Promise.all([
        api.getFeatures(pinnedBrandId || undefined) as Promise<Feature[]>,
        api.getBrands() as Promise<{ id: string; nombre: string; activo?: boolean }[]>,
      ]);
      setFeatures(Array.isArray(featuresRes) ? featuresRes : []);
      setBrands(Array.isArray(brandsRes) ? brandsRes.filter((b) => b.activo !== false) : []);
    } catch (e) {
      console.error(e);
      toast.error('Error al cargar features');
    } finally {
      setLoading(false);
      setPrimeraCarga(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [pinnedBrandId]);

  const openCreate = () => {
    setEditingFeature(null);
    setForm({ name: '', description: '', brand_id: pinnedBrandId || '', status: 'backlog' });
    setDialogOpen(true);
  };

  const openEdit = (f: Feature) => {
    setEditingFeature(f);
    setForm({
      name: f.name,
      description: f.description || '',
      brand_id: f.brand_id || '',
      status: f.status,
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error('Nombre obligatorio');
      return;
    }
    setSaving(true);
    try {
      if (editingFeature) {
        await api.patchFeature(editingFeature.id, {
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          brand_id: form.brand_id || undefined,
          status: form.status,
        });
        toast.success('Feature actualizado');
      } else {
        await api.createFeature({
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          brand_id: form.brand_id || undefined,
          status: form.status,
        });
        toast.success('Feature creado');
      }
      setDialogOpen(false);
      fetchData();
    } catch {
      toast.error('Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  // Solo la PRIMERA carga reemplaza la pantalla. Con `loading` a secas, cada
  // recarga (buscar, filtrar, paginar) desmontaba la pagina entera: se perdia
  // el foco del input y los dialogos abiertos se cerraban solos.
  if (loading && primeraCarga) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/scrum"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <h2 className="text-xl font-bold text-foreground">Features</h2>
            <p className="text-sm text-muted-foreground">
              Características y épicas · {features.length} en total
            </p>
          </div>
        </div>
        <Button onClick={openCreate} className="gradient-primary">
          <Plus className="h-4 w-4 mr-2" />
          Nuevo feature
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {features.length === 0 ? (
          <Card className="sm:col-span-2 lg:col-span-3">
            <CardContent className="py-12 text-center">
              <Layers className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground mb-4">No hay features. Crea uno para agrupar tareas.</p>
              <Button onClick={openCreate} variant="outline">
                <Plus className="h-4 w-4 mr-2" />
                Crear feature
              </Button>
            </CardContent>
          </Card>
        ) : (
          features.map((f) => (
            <Card key={f.id} className="hover:border-primary/50 transition-colors">
              <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2">
                <CardTitle className="text-base font-medium line-clamp-2">{f.name}</CardTitle>
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => openEdit(f)}>
                  <Edit className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent>
                {f.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{f.description}</p>
                )}
                <div className="flex items-center justify-between gap-2">
                  <Badge variant={f.status === 'completado' ? 'secondary' : f.status === 'en_progreso' ? 'default' : 'outline'}>
                    {STATUS_LABELS[f.status] || f.status}
                  </Badge>
                  {f.brands?.nombre && (
                    <span className="text-xs text-muted-foreground truncate">{f.brands.nombre}</span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent aria-describedby="scrum-feature-desc">
          <DialogHeader>
            <DialogTitle>{editingFeature ? 'Editar feature' : 'Nuevo feature'}</DialogTitle>
            <DialogDescription id="scrum-feature-desc">Crea o edita una característica del backlog.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Nombre *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ej: Login con redes sociales"
                required
              />
            </div>
            <div>
              <Label>Descripción</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Descripción de la característica"
                rows={3}
              />
            </div>
            <div>
              <Label>Marca / Proyecto</Label>
              <Select value={form.brand_id || '__none__'} onValueChange={(v) => setForm({ ...form, brand_id: v === '__none__' ? '' : v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Sin marca" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sin marca</SelectItem>
                  {brands.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Estado</Label>
              <Select value={form.status} onValueChange={(v: 'backlog' | 'en_progreso' | 'completado') => setForm({ ...form, status: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="backlog">Backlog</SelectItem>
                  <SelectItem value="en_progreso">En progreso</SelectItem>
                  <SelectItem value="completado">Completado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {editingFeature ? 'Guardar' : 'Crear'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
