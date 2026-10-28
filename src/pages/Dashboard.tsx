import { DashboardTareasDialog } from '@/components/dashboard/DashboardTareasDialog';
import { useDashboardDatos } from '@/components/dashboard/useDashboardDatos';
import { metricasResponsables, metricasMarcas, seleccionarTareas, type SeleccionDashboard } from '@/lib/dashboardSeleccion';
import { CHART_COLORS, formatTime, calcStats } from '@/lib/dashboardDatos';
import { DashboardKpis } from '@/components/dashboard/DashboardKpis';
import { GraficoResponsables } from '@/components/dashboard/GraficoResponsables';
import { GraficoMarcas } from '@/components/dashboard/GraficoMarcas';
import { DashboardEquipoGraficos } from '@/components/dashboard/DashboardEquipoGraficos';
import { DashboardResumen } from '@/components/dashboard/DashboardResumen';
import { useState, useMemo } from 'react';
import { TuDia } from '@/components/dashboard/TuDia';
import { Reuniones } from '@/components/dashboard/Reuniones';
import { ResponsablesEstado } from '@/components/dashboard/ResponsablesEstado';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

import { useGlobalFilter } from '@/contexts/GlobalFilterContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Calendar,
  Building2,
  User,
  Filter,
  Activity,
} from 'lucide-react';

export default function Dashboard() {
  const navigate = useNavigate();
  const { profile, isAdmin, isEjecutivo, isEquipo, canViewAll } = useAuth();
  const { pinnedDeskId, pinnedBrandId } = useGlobalFilter();
  const { tasks, profiles, brands, recentActivity, loading, error, reintentar } = useDashboardDatos(profile?.id, isAdmin || isEjecutivo);
  const [filterBrand, setFilterBrand] = useState<string>('all');
  const [filterResponsable, setFilterResponsable] = useState<string>('all');
  // Período por fecha de entrega ("hay como dejarlo x dia o mes?" — Steven)
  const [filterPeriodo, setFilterPeriodo] = useState<string>(() => {
    try { return localStorage.getItem('dashboard_periodo') || 'all'; } catch { return 'all'; }
  });
  const [periodoDesde, setPeriodoDesde] = useState<string>(() => {
    try { return localStorage.getItem('dashboard_periodo_desde') || ''; } catch { return ''; }
  });
  const [periodoHasta, setPeriodoHasta] = useState<string>(() => {
    try { return localStorage.getItem('dashboard_periodo_hasta') || ''; } catch { return ''; }
  });
  // Apply filters (local + global)
  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      const matchesBrand = filterBrand === 'all' || task.brand_id === filterBrand;
      const matchesResponsable = filterResponsable === 'all' || task.responsable_user_id === filterResponsable;
      const matchesPinnedDesk = !pinnedDeskId || task.desk_id === pinnedDeskId;
      const matchesPinnedBrand = !pinnedBrandId || task.brand_id === pinnedBrandId;
      const matchesPeriodo = (() => {
        if (filterPeriodo === 'all') return true;
        if (!task.fecha_entrega) return false;
        const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
        const fe = new Date(task.fecha_entrega.substring(0, 10) + 'T00:00:00');
        if (filterPeriodo === 'custom') {
          if (periodoDesde && fe < new Date(periodoDesde + 'T00:00:00')) return false;
          if (periodoHasta && fe > new Date(periodoHasta + 'T00:00:00')) return false;
          return true;
        }
        if (filterPeriodo === 'hoy') return fe.getTime() === hoy.getTime();
        if (filterPeriodo === 'mes') return fe.getMonth() === hoy.getMonth() && fe.getFullYear() === hoy.getFullYear();
        const dias = parseInt(filterPeriodo, 10); // '7' | '15' | '30': últimos N días hasta hoy
        const desde = new Date(hoy); desde.setDate(desde.getDate() - dias);
        return fe >= desde && fe <= hoy;
      })();
      return matchesBrand && matchesResponsable && matchesPinnedDesk && matchesPinnedBrand && matchesPeriodo;
    });
  }, [tasks, filterBrand, filterResponsable, filterPeriodo, periodoDesde, periodoHasta, pinnedDeskId, pinnedBrandId]);

  // My tasks (for equipo)
  const myTasks = useMemo(() => {
    if (!isEquipo || !profile?.id) return filteredTasks;
    return filteredTasks.filter(task => task.responsable_user_id === profile.id);
  }, [filteredTasks, isEquipo, profile]);

  // Stats for admin/ops (all filtered tasks)
  const filteredStats = useMemo(() => calcStats(filteredTasks), [filteredTasks]);

  // Stats for equipo (my tasks only)
  const myStats = useMemo(() => calcStats(myTasks), [myTasks]);

  const responsableMetrics = useMemo(() => metricasResponsables(filteredTasks, profiles), [filteredTasks, profiles]);
  const brandMetrics = useMemo(() => metricasMarcas(filteredTasks), [filteredTasks]);

  // Total metrics
  const totals = useMemo(() => {
    const source = isEquipo ? myTasks : filteredTasks;
    return {
      entregables: source.reduce((sum, t) => sum + t.cantidad_entregables, 0),
      tiempoTotal: source.reduce((sum, t) => sum + t.tiempo_trabajado, 0),
    };
  }, [filteredTasks, myTasks, isEquipo]);

  // Active stats based on role
  const activeStats = isEquipo ? myStats : filteredStats;
  const tareasActivas = isEquipo ? myTasks : filteredTasks;
  const [seleccion, setSeleccion] = useState<SeleccionDashboard | null>(null);
  const tareasSeleccionadas = useMemo(() => seleccion ? seleccionarTareas(tareasActivas, seleccion.criterio) : [], [tareasActivas, seleccion]);

  const getActionLabel = (action: string) => {
    const labels: Record<string, string> = {
      create: 'creó',
      update: 'actualizó',
      delete: 'eliminó',
      status_change: 'cambió estado',
    };
    return labels[action] || action;
  };

  const getEntityLabel = (type: string) => {
    const labels: Record<string, string> = {
      task: 'tarea',
      deliverable: 'entregable',
      sprint: 'sprint',
      feature: 'feature',
      comment: 'comentario',
    };
    return labels[type] || type;
  };

  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMin < 1) return 'ahora';
    if (diffMin < 60) return `hace ${diffMin}m`;
    if (diffHours < 24) return `hace ${diffHours}h`;
    if (diffDays < 7) return `hace ${diffDays}d`;
    return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  };

  // Los filtros y la búsqueda usan los datos cargados, sin reiniciar la carga.
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="glass-card animate-pulse">
              <CardContent className="p-4">
                <div className="h-16 bg-muted rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) return <div role="alert" className="rounded-lg border p-6"><p>{error}</p><button type="button" onClick={reintentar} className="mt-3 text-primary underline">Volver a intentar</button></div>;

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      {seleccion && <DashboardTareasDialog titulo={seleccion.titulo} tareas={tareasSeleccionadas} onCerrar={() => setSeleccion(null)} onAbrir={(id) => navigate(`/tareas?task=${encodeURIComponent(id)}`)} />}
      {/* Welcome + Filters */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-foreground">
              Bienvenido, {profile?.nombre?.split(' ')[0]}
            </h2>
            <p className="text-sm text-muted-foreground">
              {isEquipo ? 'Aquí está el resumen de tus tareas' : 'Aquí está el resumen general'}
            </p>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="h-4 w-4 shrink-0" />
            <span className="text-xs sm:text-sm truncate">
              {new Date().toLocaleDateString('es-ES', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              })}
            </span>
          </div>
        </div>

        {/* Dashboard Filters - admin/ops only */}
        {canViewAll && (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm text-muted-foreground sm:hidden">Filtros:</span>
            </div>
            <div className="grid grid-cols-2 sm:flex gap-2 flex-1 sm:flex-initial">
              <Select value={filterBrand} onValueChange={setFilterBrand}>
                <SelectTrigger className="w-full sm:w-40 h-9">
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
              <Select value={filterPeriodo} onValueChange={(v) => { setFilterPeriodo(v); try { localStorage.setItem('dashboard_periodo', v); } catch { /* ignore */ } }}>
                <SelectTrigger className="w-full sm:w-44 h-9">
                  <SelectValue placeholder="Período" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todo el histórico</SelectItem>
                  <SelectItem value="hoy">Hoy</SelectItem>
                  <SelectItem value="7">Últimos 7 días</SelectItem>
                  <SelectItem value="15">Últimos 15 días</SelectItem>
                  <SelectItem value="30">Últimos 30 días</SelectItem>
                  <SelectItem value="mes">Este mes</SelectItem>
                  <SelectItem value="custom">Personalizado…</SelectItem>
                </SelectContent>
              </Select>
              {filterPeriodo === 'custom' && (
                <>
                  <input
                    type="date"
                    value={periodoDesde}
                    onChange={(e) => { setPeriodoDesde(e.target.value); try { localStorage.setItem('dashboard_periodo_desde', e.target.value); } catch { /* ignore */ } }}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                    title="Desde"
                  />
                  <input
                    type="date"
                    value={periodoHasta}
                    onChange={(e) => { setPeriodoHasta(e.target.value); try { localStorage.setItem('dashboard_periodo_hasta', e.target.value); } catch { /* ignore */ } }}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                    title="Hasta"
                  />
                </>
              )}
              <Select value={filterResponsable} onValueChange={setFilterResponsable}>
                <SelectTrigger className="w-full sm:w-44 h-9">
                  <SelectValue placeholder="Responsable" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {profiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>

      <DashboardKpis stats={activeStats} totals={totals} isEquipo={isEquipo} tareas={tareasActivas} onMostrar={setSeleccion} />

      <DashboardResumen tareas={tareasActivas} personas={profiles} isEquipo={isEquipo} onMostrar={setSeleccion}
        onAbrir={(id) => navigate(`/tareas?task=${encodeURIComponent(id)}`)}
        tuDia={<TuDia key={profile?.id} userId={profile?.id} />}
        reuniones={<Reuniones key={profile?.id} userId={profile?.id} />} />

      {isEquipo && <DashboardEquipoGraficos myTasks={myTasks} myStats={myStats} onMostrar={setSeleccion} />}

      {/* ====== ADMIN/OPS DASHBOARD ====== */}
      {canViewAll && (
        <>
          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            <GraficoMarcas brandMetrics={brandMetrics} onMostrar={setSeleccion} />
            <GraficoResponsables responsableMetrics={responsableMetrics} tareas={filteredTasks} onMostrar={setSeleccion} />
          </div>

          {/* Detailed Metrics Tables */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            <ResponsablesEstado metricas={responsableMetrics} autorizado={isAdmin || isEjecutivo} userId={profile?.id} />

            {/* Brand Metrics Table */}
            <Card className="glass-card">
              <CardHeader className="pb-2 sm:pb-4">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                  <CardTitle className="text-base sm:text-lg">Métricas por Marca</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 sm:space-y-3">
                  {brandMetrics.length === 0 ? (
                    <p className="text-center text-muted-foreground py-4 text-sm">No hay datos</p>
                  ) : (
                    brandMetrics.slice(0, 5).map((metric, index) => (
                      <div key={index} className="flex items-center justify-between p-2 sm:p-3 rounded-lg bg-muted/50">
                        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                          <div
                            className="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center shrink-0"
                            style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] + '30' }}
                          >
                            <Building2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" style={{ color: CHART_COLORS[index % CHART_COLORS.length] }} />
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-foreground text-sm sm:text-base truncate">{metric.nombre}</p>
                            <p className="text-[10px] sm:text-xs text-muted-foreground">
                              {metric.completadas}/{metric.total} completadas
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 sm:gap-4 text-xs sm:text-sm shrink-0">
                          <div className="text-center">
                            <p className="font-semibold text-foreground">{metric.entregables}</p>
                            <p className="text-[10px] sm:text-xs text-muted-foreground hidden sm:block">Entregables</p>
                          </div>
                          <div className="text-center">
                            <p className="font-semibold text-foreground">{formatTime(metric.tiempoTotal)}</p>
                            <p className="text-[10px] sm:text-xs text-muted-foreground hidden sm:block">Tiempo</p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Activity Feed */}
          <Card className="glass-card">
            <CardHeader className="pb-2 sm:pb-4">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                <CardTitle className="text-base sm:text-lg">Actividad Reciente del Equipo</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {recentActivity.length === 0 ? (
                <div className="text-center py-6 sm:py-8 text-muted-foreground">
                  <Activity className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No hay actividad reciente</p>
                </div>
              ) : (
                <ScrollArea className="h-[300px]">
                  <div className="space-y-3">
                    {recentActivity.map((entry) => (
                      <div key={entry.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                          <User className="h-4 w-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground">
                            <span className="font-medium">{entry.user_nombre || 'Usuario'}</span>
                            {' '}
                            <span className="text-muted-foreground">{getActionLabel(entry.action)}</span>
                            {' '}
                            <span className="text-muted-foreground">{getEntityLabel(entry.entity_type)}</span>
                            {entry.field_name && (
                              <span className="text-muted-foreground"> ({entry.field_name})</span>
                            )}
                          </p>
                          {entry.new_value && (
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">
                              {entry.old_value && (
                                <><span className="line-through">{entry.old_value}</span> → </>
                              )}
                              {entry.new_value}
                            </p>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">{formatTimeAgo(entry.created_at)}</span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </>
      )}

    </div>
  );
}
