import { useEffect, useState } from 'react';
import * as api from '@/lib/apiClient';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
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
import { cn } from '@/lib/utils';
import { Plus, Search, ExternalLink, Loader2, FileBox, CheckCircle } from 'lucide-react';

interface Deliverable {
  id: string;
  task_id: string;
  tipo_entregable_id: string | null;
  version: string;
  estado: 'borrador' | 'en_revision' | 'aprobado' | 'rechazado' | 'final';
  link_final: string | null;
  aprobado_por: string | null;
  aprobado_en: string | null;
  created_at: string;
  tasks?: { titulo_tarea: string; brands?: { nombre: string } };
  deliverable_types?: { nombre: string };
}

interface Task {
  id: string;
  titulo_tarea: string;
  brands?: { nombre: string };
}

interface DeliverableType {
  id: string;
  nombre: string;
}

export default function Deliverables() {
  const { profile, isAdmin, isEjecutivo } = useAuth();
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [types, setTypes] = useState<DeliverableType[]>([]);
  const [loading, setLoading] = useState(true);
  const [primeraCarga, setPrimeraCarga] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(0);
  const [totalDeliverables, setTotalDeliverables] = useState(0);
  const pageSize = 20;

  const [formData, setFormData] = useState({
    task_id: '',
    tipo_entregable_id: '',
    version: 'v1',
    estado: 'borrador' as Deliverable['estado'],
    link_final: '',
  });

  useEffect(() => {
    fetchData();
  }, [page]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [delRes, tasksRes, typesData] = await Promise.all([
        api.getDeliverables({ limit: pageSize, offset: page * pageSize }),
        api.getTasks({ limit: 200 }),
        api.getDeliverableTypes(),
      ]);
      setDeliverables((delRes.deliverables || []) as Deliverable[]);
      setTotalDeliverables(delRes.total ?? 0);
      setTasks((tasksRes.tasks || []) as Task[]);
      if (Array.isArray(typesData)) setTypes(typesData.filter((t: { activo?: boolean }) => t.activo));
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Error al cargar datos');
    } finally {
      setLoading(false);
      setPrimeraCarga(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const result: any = await api.createDeliverable({
        task_id: formData.task_id,
        tipo_entregable_id: formData.tipo_entregable_id || null,
        version: formData.version,
        estado: formData.estado,
      });
      if (result?.error) throw new Error(result.error);
      toast.success('Entregable creado');
      setDialogOpen(false);
      setFormData({
        task_id: '',
        tipo_entregable_id: '',
        version: 'v1',
        estado: 'borrador',
        link_final: '',
      });
      fetchData();
    } catch (error: any) {
      toast.error('Error al crear', { description: error.message });
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (id: string, estado: Deliverable['estado']) => {
    try {
      const result: any = await api.patchDeliverable(id, { estado });
      if (result?.error) throw new Error(result.error);
      toast.success('Estado actualizado');
      fetchData();
    } catch (error: any) {
      toast.error('Error', { description: error.message });
    }
  };

  const filteredDeliverables = deliverables.filter(d => {
    const matchesSearch = 
      d.tasks?.titulo_tarea?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.tasks?.brands?.nombre?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'all' || d.estado === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const getStatusColor = (estado: string) => {
    const colors: Record<string, string> = {
      borrador: 'bg-status-backlog text-white',
      en_revision: 'bg-status-in-review text-black',
      aprobado: 'bg-status-approved text-white',
      rechazado: 'bg-status-blocked text-white',
      final: 'bg-status-delivered text-white',
    };
    return colors[estado] || 'bg-muted text-muted-foreground';
  };

  const getStatusLabel = (estado: string) => {
    const labels: Record<string, string> = {
      borrador: 'Borrador',
      en_revision: 'En Revisión',
      aprobado: 'Aprobado',
      rechazado: 'Rechazado',
      final: 'Final',
    };
    return labels[estado] || estado;
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
          <h2 className="text-xl sm:text-2xl font-bold text-foreground">Entregables</h2>
          <p className="text-sm text-muted-foreground">Gestiona versiones y aprobaciones</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gradient-primary w-full sm:w-auto">
              <Plus className="h-4 w-4 mr-2" />
              Nuevo Entregable
            </Button>
          </DialogTrigger>
          <DialogContent className="mx-4 sm:mx-auto" aria-describedby="deliv-add-desc">
            <DialogHeader>
              <DialogTitle>Nuevo Entregable</DialogTitle>
              <DialogDescription id="deliv-add-desc">Crea un entregable vinculado a una tarea.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Tarea *</Label>
                <Select
                  value={formData.task_id}
                  onValueChange={(value) => setFormData({ ...formData, task_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar tarea" />
                  </SelectTrigger>
                  <SelectContent>
                    {tasks.map((task) => (
                      <SelectItem key={task.id} value={task.id}>
                        {task.titulo_tarea} ({task.brands?.nombre})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Tipo de Entregable</Label>
                <Select
                  value={formData.tipo_entregable_id}
                  onValueChange={(value) => setFormData({ ...formData, tipo_entregable_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {types.map((type) => (
                      <SelectItem key={type.id} value={type.id}>
                        {type.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Versión</Label>
                  <Input
                    value={formData.version}
                    onChange={(e) => setFormData({ ...formData, version: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Estado</Label>
                  <Select
                    value={formData.estado}
                    onValueChange={(value: Deliverable['estado']) => 
                      setFormData({ ...formData, estado: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="borrador">Borrador</SelectItem>
                      <SelectItem value="en_revision">En Revisión</SelectItem>
                      <SelectItem value="aprobado">Aprobado</SelectItem>
                      <SelectItem value="final">Final</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Link Final</Label>
                <Input
                  type="url"
                  value={formData.link_final}
                  onChange={(e) => setFormData({ ...formData, link_final: e.target.value })}
                  placeholder="https://..."
                />
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={saving || !formData.task_id}>
                  {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Crear Entregable
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <Card className="glass-card">
        <CardContent className="p-3 sm:p-4">
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por tarea o marca..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="borrador">Borrador</SelectItem>
                <SelectItem value="en_revision">En Revisión</SelectItem>
                <SelectItem value="aprobado">Aprobado</SelectItem>
                <SelectItem value="rechazado">Rechazado</SelectItem>
                <SelectItem value="final">Final</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table - Desktop / Cards - Mobile */}
      <Card className="glass-card">
        <CardContent className="p-0">
          {/* Mobile View */}
          <div className="block sm:hidden">
            {filteredDeliverables.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileBox className="h-12 w-12 mx-auto mb-2 opacity-50" />
                No hay entregables
              </div>
            ) : (
              <div className="divide-y divide-border">
                {filteredDeliverables.map((del) => (
                  <div key={del.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-foreground truncate">{del.tasks?.titulo_tarea}</p>
                        <p className="text-xs text-muted-foreground">{del.tasks?.brands?.nombre || '-'}</p>
                      </div>
                      <Badge className={cn("text-xs ml-2 shrink-0", getStatusColor(del.estado))}>
                        {getStatusLabel(del.estado)}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Badge variant="outline">{del.version}</Badge>
                      <span className="text-muted-foreground">{del.deliverable_types?.nombre || '-'}</span>
                    </div>
                    <div className="flex items-center justify-between pt-2">
                      {del.link_final ? (
                        <a
                          href={del.link_final}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-primary hover:underline text-sm"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Ver
                        </a>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                      {(isAdmin || isEjecutivo) && del.estado !== 'final' && (
                        <Select
                          value={del.estado}
                          onValueChange={(value: Deliverable['estado']) => updateStatus(del.id, value)}
                        >
                          <SelectTrigger className="h-8 w-28">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="borrador">Borrador</SelectItem>
                            <SelectItem value="en_revision">En Revisión</SelectItem>
                            <SelectItem value="aprobado">Aprobado</SelectItem>
                            <SelectItem value="rechazado">Rechazado</SelectItem>
                            <SelectItem value="final">Final</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          {/* Desktop View */}
          <div className="hidden sm:block overflow-x-auto -mx-px">
            <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead>Tarea</TableHead>
                  <TableHead>Marca</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Versión</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Link</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDeliverables.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      <FileBox className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      No hay entregables
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredDeliverables.map((del) => (
                    <TableRow key={del.id} className="border-border hover:bg-muted/50">
                      <TableCell className="font-medium">{del.tasks?.titulo_tarea}</TableCell>
                      <TableCell>{del.tasks?.brands?.nombre || '-'}</TableCell>
                      <TableCell>{del.deliverable_types?.nombre || '-'}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{del.version}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={cn("text-xs", getStatusColor(del.estado))}>
                          {getStatusLabel(del.estado)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {del.link_final ? (
                          <a
                            href={del.link_final}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-primary hover:underline text-sm"
                          >
                            <ExternalLink className="h-3 w-3" />
                            Ver
                          </a>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell>
                        {(isAdmin || isEjecutivo) && del.estado !== 'final' && (
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => updateStatus(del.id, 'aprobado')}
                              className="text-success hover:text-success"
                            >
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                            <Select
                              value={del.estado}
                              onValueChange={(value: Deliverable['estado']) => updateStatus(del.id, value)}
                            >
                              <SelectTrigger className="h-8 w-28">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="borrador">Borrador</SelectItem>
                                <SelectItem value="en_revision">En Revisión</SelectItem>
                                <SelectItem value="aprobado">Aprobado</SelectItem>
                                <SelectItem value="rechazado">Rechazado</SelectItem>
                                <SelectItem value="final">Final</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            {totalDeliverables > pageSize && (
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 px-3 py-3 border-t">
                <p className="text-xs sm:text-sm text-muted-foreground order-2 sm:order-1">
                  Página {page + 1} de {Math.max(1, Math.ceil(totalDeliverables / pageSize))}                   ({totalDeliverables} entregables)
                </p>
                <div className="flex gap-2 order-1 sm:order-2 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page === 0 || loading}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                  >
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= Math.ceil(totalDeliverables / pageSize) - 1 || loading}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Siguiente
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
