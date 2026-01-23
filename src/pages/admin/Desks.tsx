import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { Plus, Edit, Loader2, LayoutDashboard } from 'lucide-react';

interface Desk {
  id: string;
  nombre: string;
  activo: boolean;
}

export default function AdminDesks() {
  const [desks, setDesks] = useState<Desk[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedDesk, setSelectedDesk] = useState<Desk | null>(null);

  const [formData, setFormData] = useState({
    nombre: '',
    activo: true,
  });

  useEffect(() => {
    fetchDesks();
  }, []);

  const fetchDesks = async () => {
    try {
      const { data, error } = await supabase.from('desks').select('*').order('nombre');
      if (error) throw error;
      setDesks(data);
    } catch (error) {
      toast.error('Error al cargar mesas');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      if (selectedDesk) {
        const { error } = await supabase.from('desks').update(formData).eq('id', selectedDesk.id);
        if (error) throw error;
        toast.success('Mesa actualizada');
      } else {
        const { error } = await supabase.from('desks').insert(formData);
        if (error) throw error;
        toast.success('Mesa creada');
      }

      setDialogOpen(false);
      resetForm();
      fetchDesks();
    } catch (error: any) {
      toast.error('Error', { description: error.message });
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setFormData({ nombre: '', activo: true });
    setSelectedDesk(null);
  };

  const openEditDialog = (desk: Desk) => {
    setSelectedDesk(desk);
    setFormData({ nombre: desk.nombre, activo: desk.activo });
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
          <h2 className="text-xl sm:text-2xl font-bold text-foreground">Mesas de Trabajo</h2>
          <p className="text-sm text-muted-foreground">Gestiona las mesas de trabajo</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button className="gradient-primary w-full sm:w-auto">
              <Plus className="h-4 w-4 mr-2" />
              Nueva Mesa
            </Button>
          </DialogTrigger>
          <DialogContent className="mx-4 sm:mx-auto">
            <DialogHeader>
              <DialogTitle>{selectedDesk ? 'Editar' : 'Nueva'} Mesa</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Nombre *</Label>
                <Input
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  placeholder="Ej: Mesa 1"
                  required
                />
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
                  {selectedDesk ? 'Guardar' : 'Crear'}
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
            {desks.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <LayoutDashboard className="h-12 w-12 mx-auto mb-2 opacity-50" />
                No hay mesas
              </div>
            ) : (
              desks.map((desk) => (
                <div key={desk.id} className="p-4 flex items-center justify-between">
                  <div className="space-y-1">
                    <span className="font-medium">{desk.nombre}</span>
                    <div>
                      <Badge variant={desk.activo ? "default" : "secondary"}>
                        {desk.activo ? 'Activa' : 'Inactiva'}
                      </Badge>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => openEditDialog(desk)}>
                    <Edit className="h-4 w-4" />
                  </Button>
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
                  <TableHead>Estado</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {desks.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                      <LayoutDashboard className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      No hay mesas
                    </TableCell>
                  </TableRow>
                ) : (
                  desks.map((desk) => (
                    <TableRow key={desk.id} className="border-border hover:bg-muted/50">
                      <TableCell className="font-medium">{desk.nombre}</TableCell>
                      <TableCell>
                        <Badge variant={desk.activo ? "default" : "secondary"}>
                          {desk.activo ? 'Activa' : 'Inactiva'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => openEditDialog(desk)}>
                          <Edit className="h-4 w-4" />
                        </Button>
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
