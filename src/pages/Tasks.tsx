import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  Plus,
  Search,
  Filter,
  Eye,
  Edit,
  MessageSquare,
  Paperclip,
  Calendar,
  Loader2,
  X,
  Timer,
  Package,
} from 'lucide-react';

import { TaskTimer } from '@/components/tasks/TaskTimer';
import { TaskFiles } from '@/components/tasks/TaskFiles';
import { DeliverableProgress } from '@/components/tasks/DeliverableProgress';
import { ResponsableMetrics } from '@/components/tasks/ResponsableMetrics';
import { formatTimeDisplay } from '@/hooks/useTaskTimer';

interface Task {
  id: string;
  check_done: boolean;
  brand_id: string;
  desk_id: string | null;
  titulo_tarea: string;
  detalle: string | null;
  cantidad_entregables: number;
  responsable_user_id: string | null;
  departamento: string | null;
  prioridad: 'alta' | 'media' | 'baja';
  estado: 'backlog' | 'en_proceso' | 'en_revision' | 'aprobado' | 'entregado' | 'bloqueado';
  fecha_inicio: string | null;
  fecha_entrega: string;
  enlaces: string[] | null;
  estado_envio: 'pendiente' | 'enviado';
  qa_checklist: any;
  created_at: string;
  updated_at: string;
  tiempo_trabajado: number;
  timer_activo: boolean;
  timer_inicio: string | null;
  brands?: { nombre: string };
  desks?: { nombre: string };
  profiles?: { nombre: string };
}

interface Brand {
  id: string;
  nombre: string;
}

interface Desk {
  id: string;
  nombre: string;
}

interface Profile {
  id: string;
  nombre: string;
}

export default function Tasks() {
  const { profile, isAdmin, isOps, isEquipo } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [desks, setDesks] = useState<Desk[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBrand, setFilterBrand] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [filterResponsable, setFilterResponsable] = useState<string>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    titulo_tarea: '',
    detalle: '',
    brand_id: '',
    desk_id: '',
    responsable_user_id: '',
    departamento: '',
    prioridad: 'media' as 'alta' | 'media' | 'baja',
    estado: 'backlog' as Task['estado'],
    fecha_inicio: '',
    fecha_entrega: '',
    cantidad_entregables: 1,
    enlaces: '',
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [tasksRes, brandsRes, desksRes, usersRes] = await Promise.all([
        supabase.from('tasks').select(`*, brands (nombre), desks (nombre)`),
        supabase.from('brands').select('*').eq('activo', true),
        supabase.from('desks').select('*').eq('activo', true),
        supabase.from('profiles').select('id, nombre').eq('activo', true),
      ]);

      if (tasksRes.data) setTasks(tasksRes.data as Task[]);
      if (brandsRes.data) setBrands(brandsRes.data);
      if (desksRes.data) setDesks(desksRes.data);
      if (usersRes.data) setUsers(usersRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const taskData = {
        titulo_tarea: formData.titulo_tarea,
        detalle: formData.detalle || null,
        brand_id: formData.brand_id,
        desk_id: formData.desk_id || null,
        responsable_user_id: formData.responsable_user_id || null,
        departamento: formData.departamento || null,
        prioridad: formData.prioridad,
        estado: formData.estado,
        fecha_inicio: formData.fecha_inicio || null,
        fecha_entrega: formData.fecha_entrega,
        cantidad_entregables: formData.cantidad_entregables,
        enlaces: formData.enlaces ? formData.enlaces.split('\n').filter(Boolean) : null,
      };

      if (selectedTask) {
        const { error } = await supabase
          .from('tasks')
          .update(taskData)
          .eq('id', selectedTask.id);

        if (error) throw error;
        toast.success('Tarea actualizada');
      } else {
        const { data: insertedTask, error } = await supabase
          .from('tasks')
          .insert(taskData)
          .select()
          .single();
          
        if (error) throw error;
        toast.success('Tarea creada');

        // Send email notification if a responsible user is assigned
        if (formData.responsable_user_id) {
          const assignedUser = users.find(u => u.id === formData.responsable_user_id);
          const brandName = brands.find(b => b.id === formData.brand_id)?.nombre || 'Sin marca';
          
          if (assignedUser) {
            // Get user email from profiles
            const { data: userProfile } = await supabase
              .from('profiles')
              .select('email, nombre')
              .eq('id', formData.responsable_user_id)
              .single();

            if (userProfile?.email) {
              try {
                await supabase.functions.invoke('send-task-notification', {
                  body: {
                    taskTitle: formData.titulo_tarea,
                    brandName,
                    fechaEntrega: formData.fecha_entrega,
                    prioridad: formData.prioridad,
                    recipientEmail: userProfile.email,
                    recipientName: userProfile.nombre,
                  },
                });
                toast.success('Notificación enviada al responsable');
              } catch (emailError) {
                console.error('Error sending email:', emailError);
                // Don't show error to user, task was created successfully
              }
            }
          }
        }
      }

      setDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error: any) {
      toast.error('Error al guardar', { description: error.message });
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setFormData({
      titulo_tarea: '',
      detalle: '',
      brand_id: '',
      desk_id: '',
      responsable_user_id: '',
      departamento: '',
      prioridad: 'media',
      estado: 'backlog',
      fecha_inicio: '',
      fecha_entrega: '',
      cantidad_entregables: 1,
      enlaces: '',
    });
    setSelectedTask(null);
  };

  const openEditDialog = (task: Task) => {
    setSelectedTask(task);
    setFormData({
      titulo_tarea: task.titulo_tarea,
      detalle: task.detalle || '',
      brand_id: task.brand_id,
      desk_id: task.desk_id || '',
      responsable_user_id: task.responsable_user_id || '',
      departamento: task.departamento || '',
      prioridad: task.prioridad,
      estado: task.estado,
      fecha_inicio: task.fecha_inicio || '',
      fecha_entrega: task.fecha_entrega,
      cantidad_entregables: task.cantidad_entregables,
      enlaces: task.enlaces?.join('\n') || '',
    });
    setDialogOpen(true);
  };

  const updateTaskStatus = async (taskId: string, status: Task['estado']) => {
    try {
      const { error } = await supabase
        .from('tasks')
        .update({ estado: status })
        .eq('id', taskId);

      if (error) throw error;
      toast.success('Estado actualizado');
      fetchData();
    } catch (error: any) {
      toast.error('Error', { description: error.message });
    }
  };

  const toggleCheck = async (taskId: string, checked: boolean) => {
    try {
      const { error } = await supabase
        .from('tasks')
        .update({ check_done: checked })
        .eq('id', taskId);

      if (error) throw error;
      fetchData();
    } catch (error: any) {
      toast.error('Error', { description: error.message });
    }
  };

  const filteredTasks = tasks.filter(task => {
    const matchesSearch = task.titulo_tarea.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesBrand = filterBrand === 'all' || task.brand_id === filterBrand;
    const matchesStatus = filterStatus === 'all' || task.estado === filterStatus;
    const matchesPriority = filterPriority === 'all' || task.prioridad === filterPriority;
    const matchesResponsable = filterResponsable === 'all' || task.responsable_user_id === filterResponsable;
    return matchesSearch && matchesBrand && matchesStatus && matchesPriority && matchesResponsable;
  });

  const getPriorityColor = (prioridad: string) => {
    switch (prioridad) {
      case 'alta': return 'bg-priority-high text-white';
      case 'media': return 'bg-priority-medium text-black';
      case 'baja': return 'bg-priority-low text-white';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getStatusColor = (estado: string) => {
    const colors: Record<string, string> = {
      backlog: 'bg-status-backlog text-white',
      en_proceso: 'bg-status-in-progress text-white',
      en_revision: 'bg-status-in-review text-black',
      aprobado: 'bg-status-approved text-white',
      entregado: 'bg-status-delivered text-white',
      bloqueado: 'bg-status-blocked text-white',
    };
    return colors[estado] || 'bg-muted text-muted-foreground';
  };

  const getStatusLabel = (estado: string) => {
    const labels: Record<string, string> = {
      backlog: 'Backlog',
      en_proceso: 'En Proceso',
      en_revision: 'En Revisión',
      aprobado: 'Aprobado',
      entregado: 'Entregado',
      bloqueado: 'Bloqueado',
    };
    return labels[estado] || estado;
  };

  const getDaysRemaining = (fechaEntrega: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const entrega = new Date(fechaEntrega);
    entrega.setHours(0, 0, 0, 0);
    return Math.ceil((entrega.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  };

  const canEditTask = (task: Task) => {
    if (isAdmin || isOps) return true;
    if (isEquipo && task.responsable_user_id === profile?.id) return true;
    return false;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Tareas</h2>
          <p className="text-muted-foreground">Gestiona todas las tareas del equipo</p>
        </div>
        {(isAdmin || isOps || isEquipo) && (
          <Dialog open={dialogOpen} onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button className="gradient-primary">
                <Plus className="h-4 w-4 mr-2" />
                Nueva Tarea
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {selectedTask ? 'Editar Tarea' : 'Nueva Tarea'}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 space-y-2">
                    <Label htmlFor="titulo">Título *</Label>
                    <Input
                      id="titulo"
                      value={formData.titulo_tarea}
                      onChange={(e) => setFormData({ ...formData, titulo_tarea: e.target.value })}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="brand">Marca *</Label>
                    <Select
                      value={formData.brand_id}
                      onValueChange={(value) => setFormData({ ...formData, brand_id: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar marca" />
                      </SelectTrigger>
                      <SelectContent>
                        {brands.map((brand) => (
                          <SelectItem key={brand.id} value={brand.id}>
                            {brand.nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="desk">Mesa</Label>
                    <Select
                      value={formData.desk_id}
                      onValueChange={(value) => setFormData({ ...formData, desk_id: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar mesa" />
                      </SelectTrigger>
                      <SelectContent>
                        {desks.map((desk) => (
                          <SelectItem key={desk.id} value={desk.id}>
                            {desk.nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="responsable">Responsable</Label>
                    <Select
                      value={formData.responsable_user_id}
                      onValueChange={(value) => setFormData({ ...formData, responsable_user_id: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Asignar responsable" />
                      </SelectTrigger>
                      <SelectContent>
                        {users.map((user) => (
                          <SelectItem key={user.id} value={user.id}>
                            {user.nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="departamento">Departamento</Label>
                    <Input
                      id="departamento"
                      value={formData.departamento}
                      onChange={(e) => setFormData({ ...formData, departamento: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="prioridad">Prioridad</Label>
                    <Select
                      value={formData.prioridad}
                      onValueChange={(value: 'alta' | 'media' | 'baja') => 
                        setFormData({ ...formData, prioridad: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="alta">Alta</SelectItem>
                        <SelectItem value="media">Media</SelectItem>
                        <SelectItem value="baja">Baja</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="estado">Estado</Label>
                    <Select
                      value={formData.estado}
                      onValueChange={(value: Task['estado']) => 
                        setFormData({ ...formData, estado: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="backlog">Backlog</SelectItem>
                        <SelectItem value="en_proceso">En Proceso</SelectItem>
                        <SelectItem value="en_revision">En Revisión</SelectItem>
                        <SelectItem value="aprobado">Aprobado</SelectItem>
                        <SelectItem value="entregado">Entregado</SelectItem>
                        <SelectItem value="bloqueado">Bloqueado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="fecha_inicio">Fecha Inicio</Label>
                    <Input
                      id="fecha_inicio"
                      type="date"
                      value={formData.fecha_inicio}
                      onChange={(e) => setFormData({ ...formData, fecha_inicio: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="fecha_entrega">Fecha Entrega *</Label>
                    <Input
                      id="fecha_entrega"
                      type="date"
                      value={formData.fecha_entrega}
                      onChange={(e) => setFormData({ ...formData, fecha_entrega: e.target.value })}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="cantidad">Cantidad Entregables</Label>
                    <Input
                      id="cantidad"
                      type="number"
                      min={1}
                      value={formData.cantidad_entregables}
                      onChange={(e) => setFormData({ ...formData, cantidad_entregables: parseInt(e.target.value) || 1 })}
                    />
                  </div>

                  <div className="col-span-2 space-y-2">
                    <Label htmlFor="detalle">Detalle</Label>
                    <Textarea
                      id="detalle"
                      value={formData.detalle}
                      onChange={(e) => setFormData({ ...formData, detalle: e.target.value })}
                      rows={3}
                    />
                  </div>

                  <div className="col-span-2 space-y-2">
                    <Label htmlFor="enlaces">Enlaces (uno por línea)</Label>
                    <Textarea
                      id="enlaces"
                      value={formData.enlaces}
                      onChange={(e) => setFormData({ ...formData, enlaces: e.target.value })}
                      rows={2}
                      placeholder="https://..."
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={saving}>
                    {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    {selectedTask ? 'Guardar Cambios' : 'Crear Tarea'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Filters */}
      <Card className="glass-card">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar tareas..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={filterBrand} onValueChange={setFilterBrand}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="Marca" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las marcas</SelectItem>
                {brands.map((brand) => (
                  <SelectItem key={brand.id} value={brand.id}>
                    {brand.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="backlog">Backlog</SelectItem>
                <SelectItem value="en_proceso">En Proceso</SelectItem>
                <SelectItem value="en_revision">En Revisión</SelectItem>
                <SelectItem value="aprobado">Aprobado</SelectItem>
                <SelectItem value="entregado">Entregado</SelectItem>
                <SelectItem value="bloqueado">Bloqueado</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterPriority} onValueChange={setFilterPriority}>
              <SelectTrigger className="w-full sm:w-32">
                <SelectValue placeholder="Prioridad" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="alta">Alta</SelectItem>
                <SelectItem value="media">Media</SelectItem>
                <SelectItem value="baja">Baja</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterResponsable} onValueChange={setFilterResponsable}>
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue placeholder="Responsable" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los responsables</SelectItem>
                {users.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Tasks Table */}
      <Card className="glass-card">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead className="w-12"></TableHead>
                  <TableHead>Tarea</TableHead>
                  <TableHead>Marca</TableHead>
                  <TableHead>Mesa</TableHead>
                  <TableHead>Responsable</TableHead>
                  <TableHead className="text-center">Entregables</TableHead>
                  <TableHead>Timer</TableHead>
                  <TableHead>Archivos</TableHead>
                  <TableHead>Prioridad</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Entrega</TableHead>
                  <TableHead>Días</TableHead>
                  <TableHead className="w-24">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTasks.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={13} className="text-center py-8 text-muted-foreground">
                      No se encontraron tareas
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredTasks.map((task) => {
                    const dias = getDaysRemaining(task.fecha_entrega);
                    return (
                      <TableRow key={task.id} className="border-border hover:bg-muted/50">
                        <TableCell>
                          <Checkbox
                            checked={task.check_done}
                            onCheckedChange={(checked) => toggleCheck(task.id, checked as boolean)}
                            disabled={!canEditTask(task)}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-foreground">{task.titulo_tarea}</div>
                          {task.departamento && (
                            <div className="text-xs text-muted-foreground">{task.departamento}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{task.brands?.nombre || '-'}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{task.desks?.nombre || '-'}</span>
                        </TableCell>
                        <TableCell>
                          {task.responsable_user_id ? (
                            <ResponsableMetrics
                              userId={task.responsable_user_id}
                              userName={users.find(u => u.id === task.responsable_user_id)?.nombre || 'Sin asignar'}
                              allTasks={tasks}
                              compact
                            />
                          ) : (
                            <span className="text-sm text-muted-foreground">Sin asignar</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Package className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{task.cantidad_entregables}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <TaskTimer
                            taskId={task.id}
                            initialTime={task.tiempo_trabajado}
                            isActive={task.timer_activo}
                            startTime={task.timer_inicio}
                            canEdit={canEditTask(task)}
                            compact
                            onUpdate={fetchData}
                          />
                        </TableCell>
                        <TableCell>
                          <TaskFiles
                            taskId={task.id}
                            canEdit={canEditTask(task)}
                            compact
                          />
                        </TableCell>
                        <TableCell>
                          <Badge className={cn("text-xs", getPriorityColor(task.prioridad))}>
                            {task.prioridad.toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={cn("text-xs", getStatusColor(task.estado))}>
                            {getStatusLabel(task.estado)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            {new Date(task.fecha_entrega).toLocaleDateString('es-ES')}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className={cn(
                            "text-sm font-medium px-2 py-0.5 rounded",
                            dias < 0 ? "bg-destructive/20 text-destructive" :
                            dias === 0 ? "bg-warning/20 text-warning" :
                            dias <= 2 ? "bg-info/20 text-info" :
                            "text-muted-foreground"
                          )}>
                            {dias < 0 ? `${Math.abs(dias)}d atrás` : dias === 0 ? 'Hoy' : `${dias}d`}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => {
                                setSelectedTask(task);
                                setDetailDialogOpen(true);
                              }}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            {canEditTask(task) && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => openEditDialog(task)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Task Detail Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalle de Tarea</DialogTitle>
          </DialogHeader>
          {selectedTask && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">{selectedTask.titulo_tarea}</h3>
                <div className="flex gap-2">
                  <Badge className={getPriorityColor(selectedTask.prioridad)}>
                    {selectedTask.prioridad.toUpperCase()}
                  </Badge>
                  <Badge className={getStatusColor(selectedTask.estado)}>
                    {getStatusLabel(selectedTask.estado)}
                  </Badge>
                </div>
              </div>

              {/* Timer Section */}
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-2">Tiempo Trabajado</h4>
                <TaskTimer
                  taskId={selectedTask.id}
                  initialTime={selectedTask.tiempo_trabajado}
                  isActive={selectedTask.timer_activo}
                  startTime={selectedTask.timer_inicio}
                  canEdit={canEditTask(selectedTask)}
                  onUpdate={fetchData}
                />
              </div>

              {/* Responsable Section */}
              {selectedTask.responsable_user_id && (
                <div className="p-4 rounded-lg border border-border bg-muted/30">
                  <h4 className="text-sm font-medium text-muted-foreground mb-3">Responsable</h4>
                  <ResponsableMetrics
                    userId={selectedTask.responsable_user_id}
                    userName={users.find(u => u.id === selectedTask.responsable_user_id)?.nombre || 'Sin asignar'}
                    allTasks={tasks}
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Marca:</span>
                  <span className="ml-2 font-medium">{selectedTask.brands?.nombre}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Mesa:</span>
                  <span className="ml-2 font-medium">{selectedTask.desks?.nombre || '-'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Fecha Entrega:</span>
                  <span className="ml-2 font-medium">
                    {new Date(selectedTask.fecha_entrega).toLocaleDateString('es-ES')}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Entregables:</span>
                  <span className="ml-2 font-medium">{selectedTask.cantidad_entregables}</span>
                </div>
              </div>

              {/* Deliverable Progress */}
              <DeliverableProgress
                taskId={selectedTask.id}
                expectedCount={selectedTask.cantidad_entregables}
              />

              {/* Files Section */}
              <TaskFiles
                taskId={selectedTask.id}
                canEdit={canEditTask(selectedTask)}
              />

              {selectedTask.detalle && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-1">Detalle</h4>
                  <p className="text-sm bg-muted/50 p-3 rounded-lg">{selectedTask.detalle}</p>
                </div>
              )}

              {selectedTask.enlaces && selectedTask.enlaces.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-1">Enlaces</h4>
                  <div className="space-y-1">
                    {selectedTask.enlaces.map((link, i) => (
                      <a
                        key={i}
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block text-sm text-primary hover:underline truncate"
                      >
                        {link}
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {canEditTask(selectedTask) && (
                <div className="pt-4 border-t border-border">
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">Cambiar Estado</h4>
                  <div className="flex flex-wrap gap-2">
                    {['backlog', 'en_proceso', 'en_revision', 'aprobado', 'entregado', 'bloqueado'].map((status) => (
                      <Button
                        key={status}
                        variant={selectedTask.estado === status ? "default" : "outline"}
                        size="sm"
                        onClick={() => {
                          updateTaskStatus(selectedTask.id, status as Task['estado']);
                          setSelectedTask({ ...selectedTask, estado: status as Task['estado'] });
                        }}
                      >
                        {getStatusLabel(status)}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
