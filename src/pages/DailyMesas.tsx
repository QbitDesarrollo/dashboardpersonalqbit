import { useEffect, useState, useMemo } from 'react';
import * as api from '@/lib/apiClient';
import { useAuth } from '@/contexts/AuthContext';
import { useGlobalFilter } from '@/contexts/GlobalFilterContext';
import { TaskDetailDialog } from '@/components/tasks/TaskDetailDialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { toast } from 'sonner';
import { cn, getInitials } from '@/lib/utils';
import {
  Users,
  Loader2,
  ChevronDown,
  ChevronRight,
  Download,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ListTodo,
  Package,
  BarChart3,
  Video,
} from 'lucide-react';
import { exportDailyToPDF, exportDailyToExcel } from '@/lib/exportUtils';

interface Task {
  id: string;
  titulo_tarea: string;
  brand_id: string;
  desk_id: string | null;
  responsable_user_id: string | null;
  estado: 'backlog' | 'en_proceso' | 'en_revision' | 'aprobado' | 'entregado' | 'bloqueado';
  prioridad: 'alta' | 'media' | 'baja';
  fecha_entrega: string;
  fecha_inicio: string | null;
  cantidad_entregables: number;
  tiempo_trabajado: number;
  tipo_entregable_id?: string | null;
  brands?: { nombre: string };
  desks?: { nombre: string };
  responsables?: { user_id: string; nombre: string; avatar_url?: string | null }[];
  deliverable_type?: { nombre: string } | null;
}

interface Desk {
  id: string;
  nombre: string;
}

interface Brand {
  id: string;
  nombre: string;
}

interface DeliverableType {
  id: string;
  nombre: string;
}

interface MeetingMember {
  user_id: string;
  nombre: string;
  connected: boolean;
  total_hours: number;
  events: { summary: string; start: string; end: string; duration_min: number }[];
}

interface MemberSwimline {
  userId: string;
  nombre: string;
  avatarUrl: string | null;
  tasks: Task[];
  total: number;
  enProceso: number;
  enRevision: number;
  entregadas: number;
  atrasadas: number;
  bloqueadas: number;
  tiempoTrabajado: number;
  byDeliverableType: Record<string, number>;
  meetingHours: number;
  meetingEvents: { summary: string; start: string; end: string; duration_min: number }[];
  googleConnected: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  backlog: 'bg-slate-500',
  en_proceso: 'bg-blue-500 text-white',
  en_revision: 'bg-amber-500 text-white',
  aprobado: 'bg-green-500 text-white',
  entregado: 'bg-emerald-600 text-white',
  bloqueado: 'bg-red-500 text-white',
};

const STATUS_LABELS: Record<string, string> = {
  backlog: 'Pendiente',
  en_proceso: 'En Proceso',
  en_revision: 'En Revision',
  aprobado: 'Aprobado',
  entregado: 'Entregado',
  bloqueado: 'Bloqueado',
};

const PRIORITY_COLORS: Record<string, string> = {
  alta: 'text-red-500',
  media: 'text-amber-500',
  baja: 'text-slate-400',
};

const formatTime = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

const parseLocalDate = (dateStr: string | null | undefined): Date => {
  if (!dateStr) return new Date(NaN);
  const clean = dateStr.substring(0, 10);
  const [y, m, d] = clean.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const isOverdue = (fechaEntrega: string, estado: string) => {
  if (['entregado', 'aprobado', 'revision_cliente'].includes(estado)) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const entrega = parseLocalDate(fechaEntrega);
  return entrega.getTime() < today.getTime();
};

const getDaysRemaining = (fechaEntrega: string) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const entrega = parseLocalDate(fechaEntrega);
  return Math.ceil((entrega.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
};

export default function DailyMesas() {
  const { isAdmin, isEjecutivo, profile } = useAuth();
  const { pinnedDeskId, pinnedBrandId } = useGlobalFilter();
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [desks, setDesks] = useState<Desk[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [deliverableTypes, setDeliverableTypes] = useState<DeliverableType[]>([]);
  const [loading, setLoading] = useState(true);

  const [filterDesk, setFilterDesk] = useState<string>(pinnedDeskId || 'all');
  const [filterBrand, setFilterBrand] = useState<string>(pinnedBrandId || 'all');

  // Sync filters when global pinned desk/brand changes from sidebar
  useEffect(() => {
    setFilterDesk(pinnedDeskId || 'all');
  }, [pinnedDeskId]);
  useEffect(() => {
    setFilterBrand(pinnedBrandId || 'all');
  }, [pinnedBrandId]);
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  const [meetingsMap, setMeetingsMap] = useState<Record<string, MeetingMember>>({});
  const [meetingsLoading, setMeetingsLoading] = useState(false);
  const [collapsedMembers, setCollapsedMembers] = useState<Set<string>>(new Set());
  const [expandedMeetings, setExpandedMeetings] = useState<Set<string>>(new Set());
  const [siteSettings, setSiteSettings] = useState<Record<string, string | null>>({});

  // Default date range: current month
  useEffect(() => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    setDateFrom(firstDay.toISOString().substring(0, 10));
    setDateTo(lastDay.toISOString().substring(0, 10));
  }, []);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [tasksRes, desksData, brandsData, dtData, settingsData] = await Promise.all([
        api.getTasks({ limit: 500 }),
        api.getDesks(),
        api.getBrands(),
        api.getDeliverableTypes(),
        api.getSiteSettings().catch(() => ({})),
      ]);
      setTasks((tasksRes.tasks || []) as Task[]);
      if (Array.isArray(desksData)) setDesks(desksData.filter((d: { activo?: unknown }) => d.activo !== 0 && d.activo !== false));
      if (Array.isArray(brandsData)) setBrands(brandsData.filter((b: { activo?: unknown }) => b.activo !== 0 && b.activo !== false));
      if (Array.isArray(dtData)) setDeliverableTypes(dtData.filter((t: { activo?: unknown }) => t.activo !== 0 && t.activo !== false));
      if (settingsData && typeof settingsData === 'object') setSiteSettings(settingsData);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  };

  // Determine if meetings should be visible based on site settings
  const showMeetings = useMemo(() => {
    const allowedRolesStr = siteSettings.daily_meetings_roles ?? '';
    const allowedRoles = allowedRolesStr.split(',').map(r => r.trim()).filter(Boolean);
    if (allowedRoles.length === 0) return false;
    const userRole = profile?.rol || '';
    if (!allowedRoles.includes(userRole)) return false;

    const allowedDesksStr = siteSettings.daily_meetings_desk_ids ?? '';
    const allowedDesks = allowedDesksStr.split(',').map(s => s.trim()).filter(Boolean);
    if (allowedDesks.length === 0) return false;
    // Si es "all", mostrar si hay al menos una mesa habilitada
    if (filterDesk === 'all') return allowedDesks.length > 0;
    return allowedDesks.includes(filterDesk);
  }, [siteSettings, profile, filterDesk]);

  // Cargar reuniones de Google Calendar para la mesa seleccionada (solo si está habilitado)
  useEffect(() => {
    if (!dateFrom || !dateTo || !showMeetings) {
      setMeetingsMap({});
      return;
    }
    setMeetingsLoading(true);
    api.getDeskMeetings(filterDesk, dateFrom, dateTo)
      .then((data) => {
        const map: Record<string, MeetingMember> = {};
        for (const m of data.meetings || []) {
          map[m.user_id] = m;
        }
        setMeetingsMap(map);
      })
      .catch(() => setMeetingsMap({}))
      .finally(() => setMeetingsLoading(false));
  }, [filterDesk, dateFrom, dateTo, showMeetings]);

  // Filtered tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (filterDesk !== 'all' && t.desk_id !== filterDesk) return false;
      if (filterBrand !== 'all' && t.brand_id !== filterBrand) return false;
      if (dateFrom && t.fecha_entrega) {
        const entrega = (t.fecha_entrega || "").substring(0, 10);
        if (entrega < dateFrom) return false;
      }
      if (dateTo && t.fecha_entrega) {
        const entrega = (t.fecha_entrega || "").substring(0, 10);
        if (entrega > dateTo) return false;
      }
      return true;
    });
  }, [tasks, filterDesk, filterBrand, dateFrom, dateTo]);

  // Build deliverable type name map
  const dtNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    deliverableTypes.forEach((dt) => { map[dt.id] = dt.nombre; });
    return map;
  }, [deliverableTypes]);

  // Summary stats
  const stats = useMemo(() => {
    let total = 0, enProceso = 0, atrasadas = 0, entregadas = 0, bloqueadas = 0;
    for (const t of filteredTasks) {
      total++;
      if (t.estado === 'en_proceso') enProceso++;
      if (t.estado === 'entregado' || t.estado === 'aprobado') entregadas++;
      if (t.estado === 'bloqueado') bloqueadas++;
      if (isOverdue(t.fecha_entrega, t.estado)) atrasadas++;
    }
    return { total, enProceso, atrasadas, entregadas, bloqueadas };
  }, [filteredTasks]);

  // Deliverable type distribution
  const typeDistribution = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of filteredTasks) {
      const typeName = t.deliverable_type?.nombre || (t.tipo_entregable_id ? (dtNameMap[t.tipo_entregable_id] || 'Sin tipo') : 'Sin tipo');
      map[typeName] = (map[typeName] || 0) + 1;
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [filteredTasks, dtNameMap]);

  const maxTypeCount = typeDistribution.length > 0 ? typeDistribution[0][1] : 1;

  // Member swimlines
  const swimlines = useMemo(() => {
    const map: Record<string, MemberSwimline> = {};

    for (const t of filteredTasks) {
      // Get all responsables for the task
      const responsables = t.responsables && t.responsables.length > 0
        ? t.responsables
        : t.responsable_user_id
          ? [{ user_id: t.responsable_user_id, nombre: 'Sin nombre', avatar_url: null }]
          : [{ user_id: '_unassigned_', nombre: 'Sin asignar', avatar_url: null }];

      for (const r of responsables) {
        if (!map[r.user_id]) {
          const meeting = meetingsMap[r.user_id];
          map[r.user_id] = {
            userId: r.user_id,
            nombre: r.nombre || 'Sin nombre',
            avatarUrl: r.avatar_url || null,
            tasks: [],
            total: 0,
            enProceso: 0,
            enRevision: 0,
            entregadas: 0,
            atrasadas: 0,
            bloqueadas: 0,
            tiempoTrabajado: 0,
            byDeliverableType: {},
            meetingHours: meeting?.total_hours || 0,
            meetingEvents: meeting?.events || [],
            googleConnected: meeting?.connected || false,
          };
        }
        const sw = map[r.user_id];
        sw.tasks.push(t);
        sw.total++;
        if (t.estado === 'en_proceso') sw.enProceso++;
        if (t.estado === 'en_revision') sw.enRevision++;
        if (t.estado === 'entregado' || t.estado === 'aprobado') sw.entregadas++;
        if (t.estado === 'bloqueado') sw.bloqueadas++;
        if (isOverdue(t.fecha_entrega, t.estado)) sw.atrasadas++;
        sw.tiempoTrabajado += t.tiempo_trabajado || 0;

        const typeName = t.deliverable_type?.nombre || (t.tipo_entregable_id ? (dtNameMap[t.tipo_entregable_id] || 'Sin tipo') : 'Sin tipo');
        sw.byDeliverableType[typeName] = (sw.byDeliverableType[typeName] || 0) + 1;
      }
    }

    // Sort: unassigned last, then by total descending
    return Object.values(map).sort((a, b) => {
      if (a.userId === '_unassigned_') return 1;
      if (b.userId === '_unassigned_') return -1;
      if (a.bloqueadas !== b.bloqueadas) return b.bloqueadas - a.bloqueadas;
      return b.total - a.total;
    });
  }, [filteredTasks, dtNameMap, meetingsMap]);

  const maxTasks = swimlines.length > 0 ? Math.max(...swimlines.map((s) => s.total)) : 1;

  const toggleMember = (userId: string) => {
    setCollapsedMembers((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const selectedDeskName = desks.find((d) => d.id === filterDesk)?.nombre || 'Todas las Mesas';

  const handleExportPDF = () => {
    exportDailyToPDF(swimlines, filteredTasks, selectedDeskName, dtNameMap);
    toast.success('PDF descargado');
  };

  const handleExportExcel = () => {
    exportDailyToExcel(swimlines, filteredTasks, selectedDeskName, dtNameMap);
    toast.success('Excel descargado');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Daily de Mesas</h1>
          <p className="text-sm text-muted-foreground">Vista diaria de carga de trabajo por persona y tipo de entregable</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExportPDF} disabled={filteredTasks.length === 0}>
            <Download className="h-4 w-4 mr-1" />
            PDF
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportExcel} disabled={filteredTasks.length === 0}>
            <FileSpreadsheet className="h-4 w-4 mr-1" />
            Excel
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="glass-card">
        <CardContent className="p-3 sm:p-4">
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 flex-wrap">
            <div className="w-full sm:w-48">
              <label className="text-xs text-muted-foreground mb-1 block">Mesa</label>
              <Select value={filterDesk} onValueChange={setFilterDesk}>
                <SelectTrigger>
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las mesas</SelectItem>
                  {desks.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-full sm:w-48">
              <label className="text-xs text-muted-foreground mb-1 block">Marca</label>
              <Select value={filterBrand} onValueChange={setFilterBrand}>
                <SelectTrigger>
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las marcas</SelectItem>
                  {brands.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-full sm:w-40">
              <label className="text-xs text-muted-foreground mb-1 block">Desde</label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div className="w-full sm:w-40">
              <label className="text-xs text-muted-foreground mb-1 block">Hasta</label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Stats */}
      <div className={cn("grid grid-cols-2 gap-3", showMeetings ? "sm:grid-cols-6" : "sm:grid-cols-5")}>
        <Card className="glass-card">
          <CardContent className="p-4 text-center">
            <ListTodo className="h-5 w-5 mx-auto mb-1 text-primary" />
            <div className="text-2xl font-bold">{stats.total}</div>
            <div className="text-xs text-muted-foreground">Total Tareas</div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-4 text-center">
            <Clock className="h-5 w-5 mx-auto mb-1 text-blue-500" />
            <div className="text-2xl font-bold">{stats.enProceso}</div>
            <div className="text-xs text-muted-foreground">En Proceso</div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-4 text-center">
            <AlertTriangle className="h-5 w-5 mx-auto mb-1 text-destructive" />
            <div className="text-2xl font-bold text-destructive">{stats.atrasadas}</div>
            <div className="text-xs text-muted-foreground">Atrasadas</div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-4 text-center">
            <CheckCircle2 className="h-5 w-5 mx-auto mb-1 text-success" />
            <div className="text-2xl font-bold text-success">{stats.entregadas}</div>
            <div className="text-xs text-muted-foreground">Entregadas</div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-4 text-center">
            <AlertTriangle className="h-5 w-5 mx-auto mb-1 text-red-500" />
            <div className="text-2xl font-bold">{stats.bloqueadas}</div>
            <div className="text-xs text-muted-foreground">Bloqueadas</div>
          </CardContent>
        </Card>
        {showMeetings && (
          <Card className="glass-card">
            <CardContent className="p-4 text-center">
              <Video className="h-5 w-5 mx-auto mb-1 text-purple-500" />
              <div className="text-2xl font-bold text-purple-500">
                {meetingsLoading ? '...' : `${Math.round(swimlines.reduce((sum, s) => sum + s.meetingHours, 0))}h`}
              </div>
              <div className="text-xs text-muted-foreground">Hrs Reuniones</div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Deliverable Type Distribution */}
      {typeDistribution.length > 0 && (
        <Card className="glass-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Carga por Tipo de Entregable
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {typeDistribution.map(([name, count]) => (
              <div key={name} className="flex items-center gap-3">
                <span className="text-sm w-32 truncate text-muted-foreground">{name}</span>
                <div className="flex-1">
                  <Progress value={(count / maxTypeCount) * 100} className="h-3" />
                </div>
                <span className="text-sm font-medium w-8 text-right">{count}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Member Swimlines */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Users className="h-5 w-5" />
          Carga por Persona ({swimlines.length})
        </h2>

        {swimlines.length === 0 && (
          <Card className="glass-card">
            <CardContent className="p-8 text-center text-muted-foreground">
              No hay tareas para los filtros seleccionados.
            </CardContent>
          </Card>
        )}

        {swimlines.map((member) => {
          const isOpen = !collapsedMembers.has(member.userId);
          const completionPct = member.total > 0 ? Math.round((member.entregadas / member.total) * 100) : 0;

          return (
            <Card key={member.userId} className={cn("glass-card", member.bloqueadas > 0 && "border-red-500/30")}>
              <Collapsible open={isOpen} onOpenChange={() => toggleMember(member.userId)}>
                <CollapsibleTrigger asChild>
                  <CardHeader className="pb-2 cursor-pointer hover:bg-muted/30 transition-colors rounded-t-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                        <Avatar className="h-8 w-8">
                          {member.avatarUrl ? (
                            <AvatarImage src={member.avatarUrl} alt={member.nombre} className="object-cover" />
                          ) : null}
                          <AvatarFallback className={cn("text-xs font-semibold", member.userId === '_unassigned_' ? "bg-muted text-muted-foreground" : "bg-primary/20 text-primary")}>
                            {getInitials(member.nombre)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium">{member.nombre}</div>
                          <div className="text-xs text-muted-foreground flex items-center gap-2">
                            <span>{member.total} tarea{member.total !== 1 ? 's' : ''}</span>
                            {member.tiempoTrabajado > 0 && <span>{formatTime(member.tiempoTrabajado)}</span>}
                            {showMeetings && member.meetingHours > 0 && (
                              <span className="flex items-center gap-0.5 text-purple-500 font-medium">
                                <Video className="h-3 w-3" />
                                {member.meetingHours}h reuniones
                              </span>
                            )}
                            {showMeetings && member.googleConnected === false && member.userId !== '_unassigned_' && (
                              <span className="text-muted-foreground/50 italic">Sin Google</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {member.atrasadas > 0 && (
                          <Badge className="bg-destructive/20 text-destructive text-[10px]">{member.atrasadas} atrasada{member.atrasadas > 1 ? 's' : ''}</Badge>
                        )}
                        {member.bloqueadas > 0 && (
                          <Badge className="bg-red-500/20 text-red-500 text-[10px]">{member.bloqueadas} bloqueada{member.bloqueadas > 1 ? 's' : ''}</Badge>
                        )}
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-muted-foreground">{completionPct}%</span>
                          <Progress value={completionPct} className={cn("h-2 w-20", completionPct === 100 && "[&>div]:bg-success")} />
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>

                <CollapsibleContent>
                  <CardContent className="pt-0 pb-4 space-y-4">
                    {/* Status & Type Summary */}
                    <div className="flex flex-wrap gap-4 text-xs p-3 rounded-lg bg-muted/20 border border-border">
                      <div className="flex items-center gap-1">
                        <div className="h-2 w-2 rounded-full bg-blue-500" />
                        <span className="text-muted-foreground">En proceso:</span>
                        <span className="font-medium">{member.enProceso}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="h-2 w-2 rounded-full bg-amber-500" />
                        <span className="text-muted-foreground">En revision:</span>
                        <span className="font-medium">{member.enRevision}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="h-2 w-2 rounded-full bg-emerald-500" />
                        <span className="text-muted-foreground">Entregadas:</span>
                        <span className="font-medium">{member.entregadas}</span>
                      </div>
                      {Object.entries(member.byDeliverableType).length > 0 && (
                        <>
                          <div className="w-px h-4 bg-border" />
                          {Object.entries(member.byDeliverableType).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
                            <div key={type} className="flex items-center gap-1">
                              <Package className="h-3 w-3 text-muted-foreground" />
                              <span className="text-muted-foreground">{type}:</span>
                              <span className="font-medium">{count}</span>
                            </div>
                          ))}
                        </>
                      )}
                    </div>

                    {/* Meeting Details (collapsible) */}
                    {showMeetings && member.meetingEvents.length > 0 && (
                      <Collapsible
                        open={expandedMeetings.has(member.userId)}
                        onOpenChange={() => {
                          setExpandedMeetings(prev => {
                            const next = new Set(prev);
                            if (next.has(member.userId)) next.delete(member.userId);
                            else next.add(member.userId);
                            return next;
                          });
                        }}
                      >
                        <div className="rounded-lg bg-purple-500/5 border border-purple-500/20">
                          <CollapsibleTrigger asChild>
                            <button className="flex items-center gap-1.5 text-xs font-medium text-purple-500 p-3 w-full text-left hover:bg-purple-500/10 transition-colors rounded-lg">
                              {expandedMeetings.has(member.userId)
                                ? <ChevronDown className="h-3.5 w-3.5" />
                                : <ChevronRight className="h-3.5 w-3.5" />
                              }
                              <Video className="h-3.5 w-3.5" />
                              Reuniones ({member.meetingEvents.length}) — {member.meetingHours}h total
                            </button>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <div className="px-3 pb-3 space-y-1.5">
                              {member.meetingEvents.map((ev, i) => {
                                const start = new Date(ev.start);
                                const end = new Date(ev.end);
                                const timeStr = `${start.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} - ${end.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;
                                const h = Math.floor(ev.duration_min / 60);
                                const m = ev.duration_min % 60;
                                const dur = h > 0 ? `${h}h${m > 0 ? ` ${m}m` : ''}` : `${m}m`;
                                const dateStr = start.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
                                return (
                                  <div key={i} className="flex items-center gap-2 text-xs">
                                    <span className="text-muted-foreground shrink-0 w-16">{dateStr}</span>
                                    <span className="text-muted-foreground shrink-0 w-28">{timeStr}</span>
                                    <span className="flex-1 truncate">{ev.summary}</span>
                                    <span className="text-purple-500 font-medium shrink-0">{dur}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </CollapsibleContent>
                        </div>
                      </Collapsible>
                    )}

                    {/* Task List */}
                    <div className="space-y-1">
                      {member.tasks
                        .sort((a, b) => {
                          // Bloqueadas primero, luego atrasadas, luego por fecha
                          if (a.estado === 'bloqueado' && b.estado !== 'bloqueado') return -1;
                          if (b.estado === 'bloqueado' && a.estado !== 'bloqueado') return 1;
                          const aOverdue = isOverdue(a.fecha_entrega, a.estado);
                          const bOverdue = isOverdue(b.fecha_entrega, b.estado);
                          if (aOverdue && !bOverdue) return -1;
                          if (bOverdue && !aOverdue) return 1;
                          return (a.fecha_entrega || "").localeCompare(b.fecha_entrega || "");
                        })
                        .map((task) => {
                          const overdue = isOverdue(task.fecha_entrega, task.estado);
                          const dias = getDaysRemaining(task.fecha_entrega);
                          const finished = task.estado === 'entregado' || task.estado === 'aprobado';
                          return (
                            <div
                              key={task.id}
                              className={cn(
                                "flex items-center gap-2 px-3 py-2 rounded-md text-sm cursor-pointer hover:bg-muted/50 transition-colors",
                                overdue && "bg-destructive/5 border border-destructive/20",
                                task.estado === 'bloqueado' && "bg-red-500/5 border border-red-500/20",
                                finished && "opacity-60"
                              )}
                              onClick={() => setDetailTaskId(task.id)}
                              title="Ver detalle de tarea"
                            >
                              <span className={cn("font-medium flex-1 min-w-0 truncate", finished && "line-through text-muted-foreground")}>
                                {task.titulo_tarea}
                              </span>
                              <span className="text-[10px] text-muted-foreground shrink-0">{task.brands?.nombre || '-'}</span>
                              {task.deliverable_type && (
                                <Badge variant="outline" className="text-[10px] shrink-0">{task.deliverable_type.nombre}</Badge>
                              )}
                              <Badge className={cn("text-[10px] shrink-0", STATUS_COLORS[task.estado])}>
                                {STATUS_LABELS[task.estado]}
                              </Badge>
                              {finished ? (
                                <span className="text-[10px] text-success shrink-0">Listo</span>
                              ) : overdue ? (
                                <span className="text-[10px] text-destructive font-medium shrink-0">{Math.abs(dias)}d atras</span>
                              ) : (
                                <span className={cn("text-[10px] shrink-0", dias <= 2 ? "text-amber-500 font-medium" : "text-muted-foreground")}>
                                  {task.fecha_entrega ? parseLocalDate(task.fecha_entrega).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) : <span className="text-muted-foreground italic">—</span>}
                                </span>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          );
        })}
      </div>

      <TaskDetailDialog
        taskId={detailTaskId}
        open={!!detailTaskId}
        onOpenChange={(open) => { if (!open) setDetailTaskId(null); }}
      />
    </div>
  );
}
