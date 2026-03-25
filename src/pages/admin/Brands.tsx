import { useEffect, useState } from 'react';
import * as api from '@/lib/apiClient';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
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
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Plus, Edit, Loader2, Tags, Trash2 } from 'lucide-react';

interface Brand {
  id: string;
  nombre: string;
  cliente_id: string | null;
  activo: boolean;
  clients?: { nombre: string };
}

interface Client {
  id: string;
  nombre: string;
}

export default function AdminBrands() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);

  const [formData, setFormData] = useState({
    nombre: '',
    cliente_id: '',
    activo: true,
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [brandsData, clientsData] = await Promise.all([api.getBrands(), api.getClients()]);
      if (Array.isArray(brandsData)) setBrands(brandsData.map((b: any) => ({ ...b, clients: (b.cliente_nombre || b.clients?.nombre) ? { nombre: b.cliente_nombre || b.clients?.nombre } : undefined })));
      if (Array.isArray(clientsData)) setClients(clientsData.filter((c: any) => c.activo));
    } catch (error) {
      toast.error('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const data = {
        nombre: formData.nombre,
        cliente_id: formData.cliente_id || null,
        activo: formData.activo,
      };

      if (selectedBrand) {
        const result: any = await api.patchBrand(selectedBrand.id, data);
        if (result?.error) throw new Error(result.error);
        toast.success('Marca actualizada');
      } else {
        const result: any = await api.createBrand(data);
        if (result?.error) throw new Error(result.error);
        toast.success('Marca creada');
      }

      setDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error: any) {
      toast.error('Error', { description: error.message });
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setFormData({ nombre: '', cliente_id: '', activo: true });
    setSelectedBrand(null);
  };

  const handleDelete = async (brand: Brand) => {
    if (!confirm(`¿Eliminar la marca "${brand.nombre}"? Las tareas asociadas se conservarán.`)) return;
    try {
      const result: any = await api.deleteBrand(brand.id);
      if (result?.error) throw new Error(result.error);
      toast.success('Marca eliminada');
      fetchData();
    } catch (error: any) {
      toast.error('Error al eliminar', { description: error.message });
    }
  };

  const openEditDialog = (brand: Brand) => {
    setSelectedBrand(brand);
    setFormData({
      nombre: brand.nombre,
      cliente_id: brand.cliente_id || '',
      activo: brand.activo,
    });
    setDialogOpen(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-foreground">Marcas</h2>
          <p className="text-sm text-muted-foreground">Gestiona las marcas de tus clientes</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button className="gradient-primary w-full sm:w-auto">
              <Plus className="h-4 w-4 mr-2" />
              Nueva Marca
            </Button>
          </DialogTrigger>
          <DialogContent className="mx-4 sm:mx-auto" aria-describedby="brand-form-desc">
            <DialogHeader>
              <DialogTitle>{selectedBrand ? 'Editar' : 'Nueva'} Marca</DialogTitle>
              <DialogDescription id="brand-form-desc">Crea o edita una marca y su cliente asociado.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Nombre *</Label>
                <Input
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Cliente</Label>
                <Select
                  value={formData.cliente_id || "__none__"}
                  onValueChange={(value) => setFormData({ ...formData, cliente_id: value === "__none__" ? "" : value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sin cliente</SelectItem>
                    {clients.map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <Label>Activa</Label>
                <Switch
                  checked={formData.activo}
                  onCheckedChange={(checked) => setFormData({ ...formData, activo: checked })}
                />
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  {selectedBrand ? 'Guardar' : 'Crear'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="glass-card">
        <CardContent className="p-0">
          {/* Mobile View */}
          <div className="block sm:hidden divide-y divide-border">
            {brands.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Tags className="h-12 w-12 mx-auto mb-2 opacity-50" />
                No hay marcas
              </div>
            ) : (
              brands.map((brand) => (
                <div key={brand.id} className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{brand.nombre}</span>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEditDialog(brand)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(brand)} className="text-destructive hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">{brand.clients?.nombre || '-'}</p>
                  <Badge variant={brand.activo ? "default" : "secondary"}>
                    {brand.activo ? 'Activa' : 'Inactiva'}
                  </Badge>
                </div>
              ))
            )}
          </div>
          
          {/* Desktop View */}
          <div className="hidden sm:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead>Nombre</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {brands.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      <Tags className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      No hay marcas
                    </TableCell>
                  </TableRow>
                ) : (
                  brands.map((brand) => (
                    <TableRow key={brand.id} className="border-border hover:bg-muted/50">
                      <TableCell className="font-medium">{brand.nombre}</TableCell>
                      <TableCell>{brand.clients?.nombre || '-'}</TableCell>
                      <TableCell>
                        <Badge variant={brand.activo ? "default" : "secondary"}>
                          {brand.activo ? 'Activa' : 'Inactiva'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEditDialog(brand)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(brand)} className="text-destructive hover:text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
