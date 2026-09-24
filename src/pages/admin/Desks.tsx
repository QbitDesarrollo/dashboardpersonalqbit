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
import { Plus, Edit, Loader2, LayoutDashboard, Users, Trash2, Tag, Check, X, Search } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';

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

interface Brand {
  id: string;
  nombre: string;
  clients?: { nombre: string } | null;
}

export default function AdminDesks() {
  const [desks, setDesks] = useState<Desk[]>([]);
  const [allUsers, setAllUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [primeraCarga, setPrimeraCarga] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [membersDialogOpen, setMembersDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedDesk, setSelectedDesk] = useState<Desk | null>(null);
  const [deskMembers, setDeskMembers] = useState<Profile[]>([]);
  const [usersToAdd, setUsersToAdd] = useState<Set<string>>(new Set());
  const [userSearch, setUserSearch] = useState('');

  const [allBrands, setAllBrands] = useState<Brand[]>([]);
  const [deskBrands, setDeskBrands] = useState<Brand[]>([]);
  const [brandsToAdd, setBrandsToAdd] = useState<Set<string>>(new Set());
  const [brandSearch, setBrandSearch] = useState('');
  const [configTab, setConfigTab] = useState<'members' | 'brands'>('members');

  const [formData, setFormData] = useState({
    nombre: '',
    activo: true,
  });

  useEffect(() => {
    fetchDesks();
  }, []);

  const fetchDesks = async () => {
    try {
      const [data, users, brands] = await Promise.all([api.getDesks(), api.getProfiles(), api.getBrands()]);
      if (Array.isArray(data)) setDesks(data);
      if (Array.isArray(users)) setAllUsers(users);
      if (Array.isArray(brands)) setAllBrands(brands);
    } catch (error) {
      toast.error('Error al cargar mesas');
    } finally {
      setLoading(false);
      setPrimeraCarga(false);
    }
  };

  const openMembersDialog = async (desk: Desk) => {
    setSelectedDesk(desk);
    setUsersToAdd(new Set());
    setUserSearch('');
    setBrandsToAdd(new Set());
    setBrandSearch('');
    setConfigTab('members');
    try {
      const [members, brands] = await Promise.all([
        api.getDeskMembers(desk.id),
        api.getDeskBrands(desk.id),
      ]);
      setDeskMembers(Array.isArray(members) ? members : []);
      setDeskBrands(Array.isArray(brands) ? brands : []);
    } catch {
      setDeskMembers([]);
      setDeskBrands([]);
    }
    setMembersDialogOpen(true);
  };

  const handleAddMember = async () => {
    if (!selectedDesk || usersToAdd.size === 0) return;
    const ids = Array.from(usersToAdd);
    try {
      const result: any = await api.addDeskMembers(selectedDesk.id, ids);
      if (result?.error) throw new Error(result.error);
      const members = await api.getDeskMembers(selectedDesk.id);
      setDeskMembers(Array.isArray(members) ? members : []);
      setUsersToAdd(new Set());
      setUserSearch('');
      toast.success(`${ids.length} ${ids.length === 1 ? 'usuario añadido' : 'usuarios añadidos'}`);
    } catch (err: any) {
      toast.error(err.message || 'Error al añadir');
    }
  };

  const toggleUser = (id: string) => {
    setUsersToAdd((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const filteredUsersToAdd = () => usersNotInDesk.filter((u) => {
    if (!userSearch.trim()) return true;
    const q = userSearch.toLowerCase();
    return u.nombre.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });

  const selectAllUsers = () => setUsersToAdd(new Set(filteredUsersToAdd().map((u) => u.id)));
  const clearUsers = () => setUsersToAdd(new Set());

  const toggleSoporte = async (m: any) => {
    if (!selectedDesk) return;
    try {
      await api.setDeskMemberSoporte(selectedDesk.id, m.id, !m.es_soporte);
      setDeskMembers((prev) => prev.map((x) => (x.id === m.id ? { ...x, es_soporte: !m.es_soporte } : x)));
      toast.success(!m.es_soporte ? `${m.nombre} marcado como soporte (no cuenta para el % de la mesa)` : `${m.nombre} vuelve al equipo base`);
    } catch (err: any) {
      toast.error(err.message || 'Error');
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

  const handleAddBrand = async () => {
    if (!selectedDesk || brandsToAdd.size === 0) return;
    const ids = Array.from(brandsToAdd);
    try {
      const result: any = await api.addDeskBrands(selectedDesk.id, ids);
      if (result?.error) throw new Error(result.error);
      const brands = await api.getDeskBrands(selectedDesk.id);
      setDeskBrands(Array.isArray(brands) ? brands : []);
      setBrandsToAdd(new Set());
      setBrandSearch('');
      toast.success(`${ids.length} ${ids.length === 1 ? 'marca asignada' : 'marcas asignadas'}`);
    } catch (err: any) {
      toast.error(err.message || 'Error al asignar');
    }
  };

  const toggleBrand = (id: string) => {
    setBrandsToAdd((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const filteredBrandsToAdd = () => brandsNotInDesk.filter((b) => {
    if (!brandSearch.trim()) return true;
    const q = brandSearch.toLowerCase();
    return b.nombre.toLowerCase().includes(q) || (b.clients?.nombre || '').toLowerCase().includes(q);
  });

  const selectAllBrands = () => setBrandsToAdd(new Set(filteredBrandsToAdd().map((b) => b.id)));
  const clearSelection = () => setBrandsToAdd(new Set());

  const handleRemoveBrand = async (brandId: string) => {
    if (!selectedDesk) return;
    try {
      const result: any = await api.removeDeskBrand(selectedDesk.id, brandId);
      if (result?.error) throw new Error(result.error);
      setDeskBrands((prev) => prev.filter((b) => b.id !== brandId));
      toast.success('Marca quitada de la mesa');
    } catch (err: any) {
      toast.error(err.message || 'Error al quitar');
    }
  };

  const usersNotInDesk = allUsers.filter((u) => !deskMembers.some((m) => m.id === u.id));
  const brandsNotInDesk = allBrands.filter((b) => !deskBrands.some((db) => db.id === b.id));

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

  // Solo la PRIMERA carga reemplaza la pantalla. Con `loading` a secas, cada
  // recarga (buscar, filtrar, paginar) desmontaba la pagina entera: se perdia
  // el foco del input y los dialogos abiertos se cerraban solos.
  if (loading && primeraCarga) {
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
        <DialogContent className="max-w-md mx-4 sm:mx-auto" aria-describedby="desk-config-desc">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Configurar: {selectedDesk?.nombre}
            </DialogTitle>
            <DialogDescription id="desk-config-desc">
              Gestiona el equipo y las marcas asignadas a esta mesa.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-1 border-b border-border mb-4">
            <button
              onClick={() => setConfigTab('members')}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${configTab === 'members' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            >
              <Users className="h-4 w-4" /> Miembros
            </button>
            <button
              onClick={() => setConfigTab('brands')}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${configTab === 'brands' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            >
              <Tag className="h-4 w-4" /> Marcas
            </button>
          </div>

          {configTab === 'members' && (
            <div className="space-y-4">
              {usersNotInDesk.length === 0 ? (
                <div className="text-sm text-muted-foreground py-3 text-center bg-muted/40 rounded-lg">
                  Todos los usuarios ya están asignados a esta mesa
                </div>
              ) : (
                <div className="border rounded-lg p-3 space-y-3 bg-muted/20">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Buscar por nombre o correo..."
                        value={userSearch}
                        onChange={(e) => setUserSearch(e.target.value)}
                        className="pl-9 h-9"
                      />
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={selectAllUsers} className="gap-1">
                      <Check className="h-3.5 w-3.5" /> Todos
                    </Button>
                    {usersToAdd.size > 0 && (
                      <Button type="button" variant="ghost" size="sm" onClick={clearUsers} className="gap-1">
                        <X className="h-3.5 w-3.5" /> Limpiar
                      </Button>
                    )}
                  </div>

                  <ScrollArea className="h-[220px] rounded border bg-background">
                    <div className="p-1">
                      {filteredUsersToAdd().map((u) => {
                        const checked = usersToAdd.has(u.id);
                        return (
                          <label
                            key={u.id}
                            className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-sm hover:bg-muted/60 ${checked ? 'bg-primary/10' : ''}`}
                          >
                            <Checkbox checked={checked} onCheckedChange={() => toggleUser(u.id)} />
                            <span className="flex-1">{u.nombre}</span>
                            <span className="text-xs text-muted-foreground">{u.email}</span>
                          </label>
                        );
                      })}
                    </div>
                  </ScrollArea>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs text-muted-foreground">
                      {usersToAdd.size === 0 ? 'Selecciona uno o varios usuarios' : `${usersToAdd.size} ${usersToAdd.size === 1 ? 'usuario seleccionado' : 'usuarios seleccionados'}`}
                    </span>
                    <Button onClick={handleAddMember} disabled={usersToAdd.size === 0} size="sm">
                      Añadir{usersToAdd.size > 0 ? ` (${usersToAdd.size})` : ''}
                    </Button>
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <Label>Equipo asignado</Label>
                {deskMembers.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">Ningún usuario asignado</p>
                ) : (
                  <div className="space-y-1">
                    {deskMembers.map((m) => (
                      <div key={m.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                        <span className="font-medium text-sm flex items-center gap-1.5">
                          {m.nombre}
                          {m.es_soporte && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200">Soporte</span>}
                        </span>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" className={`h-8 text-xs ${m.es_soporte ? 'text-amber-700' : 'text-muted-foreground'}`} onClick={() => toggleSoporte(m)} title="Marcar como soporte: se muestra pero no cuenta para el % de la mesa">
                            {m.es_soporte ? 'Es soporte' : 'Marcar soporte'}
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleRemoveMember(m.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {configTab === 'brands' && (
            <div className="space-y-4">
              {brandsNotInDesk.length === 0 ? (
                <div className="text-sm text-muted-foreground py-3 text-center bg-muted/40 rounded-lg">
                  Todas las marcas ya están asignadas a esta mesa
                </div>
              ) : (
                <div className="border rounded-lg p-3 space-y-3 bg-muted/20">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Buscar marca..."
                        value={brandSearch}
                        onChange={(e) => setBrandSearch(e.target.value)}
                        className="pl-9 h-9"
                      />
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={selectAllBrands} className="gap-1">
                      <Check className="h-3.5 w-3.5" /> Todas
                    </Button>
                    {brandsToAdd.size > 0 && (
                      <Button type="button" variant="ghost" size="sm" onClick={clearSelection} className="gap-1">
                        <X className="h-3.5 w-3.5" /> Limpiar
                      </Button>
                    )}
                  </div>

                  <ScrollArea className="h-[220px] rounded border bg-background">
                    <div className="p-1">
                      {filteredBrandsToAdd().map((b) => {
                        const checked = brandsToAdd.has(b.id);
                        return (
                          <label
                            key={b.id}
                            className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-sm hover:bg-muted/60 ${checked ? 'bg-primary/10' : ''}`}
                          >
                            <Checkbox checked={checked} onCheckedChange={() => toggleBrand(b.id)} />
                            <span className="flex-1">{b.nombre}</span>
                            {b.clients?.nombre && (
                              <span className="text-xs text-muted-foreground">{b.clients.nombre}</span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  </ScrollArea>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs text-muted-foreground">
                      {brandsToAdd.size === 0 ? 'Selecciona una o varias marcas' : `${brandsToAdd.size} ${brandsToAdd.size === 1 ? 'marca seleccionada' : 'marcas seleccionadas'}`}
                    </span>
                    <Button onClick={handleAddBrand} disabled={brandsToAdd.size === 0} size="sm">
                      Añadir{brandsToAdd.size > 0 ? ` (${brandsToAdd.size})` : ''}
                    </Button>
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <Label>Marcas asignadas</Label>
                {deskBrands.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">Sin marcas asignadas (la mesa ve todas las marcas)</p>
                ) : (
                  <div className="space-y-1">
                    {deskBrands.map((b) => (
                      <div key={b.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                        <div>
                          <span className="font-medium text-sm">{b.nombre}</span>
                          {b.clients?.nombre && (
                            <span className="text-xs text-muted-foreground ml-1">({b.clients.nombre})</span>
                          )}
                        </div>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleRemoveBrand(b.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
