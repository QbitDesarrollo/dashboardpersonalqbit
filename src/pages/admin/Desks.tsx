import { useEffect, useState } from 'react';
import * as api from '@/lib/apiClient';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { Plus, Edit, Loader2, LayoutDashboard, Users, Trash2 } from 'lucide-react';

interface Desk {
  id: string;
  nombre: string;
  activo: boolean;
}

interface Profile {
  id: string;
  nombre: string;
  email: string;
}

export default function AdminDesks() {
  const [desks, setDesks] = useState<Desk[]>([]);
  const [allUsers, setAllUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [membersDialogOpen, setMembersDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedDesk, setSelectedDesk] = useState<Desk | null>(null);
  const [deskMembers, setDeskMembers] = useState<Profile[]>([]);
  const [userToAdd, setUserToAdd] = useState<string>('');

  const [formData, setFormData] = useState({
    nombre: '',
    activo: true,
  });

  useEffect(() => {
    fetchDesks();
  }, []);

  const fetchDesks = async () => {
    try {
      const [data, users] = await Promise.all([api.getDesks(), api.getProfiles()]);
      if (Array.isArray(data)) setDesks(data);
      if (Array.isArray(users)) setAllUsers(users);
    } catch (error) {
      toast.error('Error al cargar mesas');
    } finally {
      setLoading(false);
    }
  };

  const openMembersDialog = async (desk: Desk) => {
    setSelectedDesk(desk);
    setUserToAdd('');
    try {
      const members = await api.getDeskMembers(desk.id);
      setDeskMembers(Array.isArray(members) ? members : []);
    } catch {
      setDeskMembers([]);
    }
    setMembersDialogOpen(true);
  };

  const handleAddMember = async () => {
    if (!selectedDesk || !userToAdd) return;
    try {
      const result: any = await api.addDeskMember(selectedDesk.id, userToAdd);
      if (result?.error) throw new Error(result.error);
      const members = await api.getDeskMembers(selectedDesk.id);
      setDeskMembers(Array.isArray(members) ? members : []);
      setUserToAdd('');
      toast.success('Usuario añadido a la mesa');
    } catch (err: any) {
      toast.error(err.message || 'Error al añadir');
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!selectedDesk) return;
    try {
      const result: any = await api.removeDeskMember(selectedDesk.id, userId);
      if (result?.error) throw new Error(result.error);
      setDeskMembers((prev) => prev.filter((m) => m.id !== userId));
      toast.success('Usuario quitado de la mesa');
    } catch (err: any) {
      toast.error(err.message || 'Error al quitar');
    }
  };

  const usersNotInDesk = allUsers.filter((u) => !deskMembers.some((m) => m.id === u.id));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      if (selectedDesk) {
        const result: any = await api.patchDesk(selectedDesk.id, formData);
        if (result?.error) throw new Error(result.error);
        toast.success('Mesa actualizada');
      } else {
        const result: any = await api.createDesk(formData);
        if (result?.error) throw new Error(result.error);
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
          <DialogContent className="mx-4 sm:mx-auto" aria-describedby="desk-form-desc">
            <DialogHeader>
              <DialogTitle>{selectedDesk ? 'Editar' : 'Nueva'} Mesa</DialogTitle>
              <DialogDescription id="desk-form-desc">Crea o edita una mesa de trabajo.</DialogDescription>
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
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openMembersDialog(desk)} title="Equipo de trabajo">
                      <Users className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => openEditDialog(desk)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                  </div>
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
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openMembersDialog(desk)} title="Equipo de trabajo">
                            <Users className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => openEditDialog(desk)}>
                            <Edit className="h-4 w-4" />
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

      <Dialog open={membersDialogOpen} onOpenChange={(o) => { setMembersDialogOpen(o); if (!o) setSelectedDesk(null); }}>
        <DialogContent className="max-w-md" aria-describedby="desk-members-desc">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Equipo de trabajo: {selectedDesk?.nombre}
            </DialogTitle>
            <DialogDescription id="desk-members-desc">
              Los usuarios asignados a esta mesa aparecerán como responsables al crear tareas.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Select value={userToAdd || '__none__'} onValueChange={(v) => setUserToAdd(v === '__none__' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Añadir usuario..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__" disabled>
                    {usersNotInDesk.length ? 'Seleccionar usuario...' : 'Todos asignados'}
                  </SelectItem>
                  {usersNotInDesk.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.nombre} ({u.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={handleAddMember} disabled={!userToAdd}>
                Añadir
              </Button>
            </div>
            <div className="space-y-2">
              <Label>Equipo asignado</Label>
              {deskMembers.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">Ningún usuario asignado</p>
              ) : (
                <div className="space-y-1">
                  {deskMembers.map((m) => (
                    <div key={m.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                      <span className="font-medium text-sm">{m.nombre}</span>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleRemoveMember(m.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
