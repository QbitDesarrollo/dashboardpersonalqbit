import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as api from '@/lib/apiClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, RefreshCw, Monitor, Camera, BarChart3, CalendarCheck, Clock, Users, Activity, TrendingUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, Legend } from 'recharts';
import { ActivityIndicator } from '@/components/tasks/ActivityIndicator';
import { ScreenshotTimeline } from '@/components/time-doctor/ScreenshotTimeline';
import { cn, getInitials } from '@/lib/utils';

const formatTime = (secs: number) => {
  if (!secs || secs <= 0) return '0h 00m';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return `${h}h ${m.toString().padStart(2, '0')}m`;
};

const formatShortTime = (secs: number) => {
  if (!secs || secs <= 0) return '0:00';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return `${h}:${m.toString().padStart(2, '0')}`;
};

function getWeekStart(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  return monday.toISOString().slice(0, 10);
}

export default function TeamMonitor() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('live');
  const [loading, setLoading] = useState(true);
  const [primeraCarga, setPrimeraCarga] = useState(true);

  // Live tab
  const [liveUsers, setLiveUsers] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // Screenshots tab
  const [ssUserId, setSsUserId] = useState('');
  const [ssDate, setSsDate] = useState(new Date().toISOString().slice(0, 10));
  const [screenshots, setScreenshots] = useState<any[]>([]);
  const [ssLoading, setSsLoading] = useState(false);
  const [profiles, setProfiles] = useState<{ id: string; nombre: string }[]>([]);

  // Productivity tab
  const [prodDateFrom, setProdDateFrom] = useState(getWeekStart());
  const [prodDateTo, setProdDateTo] = useState(new Date().toISOString().slice(0, 10));
  const [prodData, setProdData] = useState<any>(null);
  const [prodLoading, setProdLoading] = useState(false);

  // Attendance tab
  const [attDateFrom, setAttDateFrom] = useState(getWeekStart());
  const [attDateTo, setAttDateTo] = useState(new Date().toISOString().slice(0, 10));
  const [attRecords, setAttRecords] = useState<any[]>([]);
  const [attLoading, setAttLoading] = useState(false);

  const fetchLive = async () => {
    setRefreshing(true);
    try {
      const data = await api.getTeamLiveStatus();
      setLiveUsers(data.users || []);
    } catch {} finally {
      setRefreshing(false);
      setLoading(false);
      setPrimeraCarga(false);
    }
  };

  useEffect(() => { fetchLive(); }, []);

  useEffect(() => {
    if (tab !== 'live') return;
    const interval = setInterval(fetchLive, 30000);
    return () => clearInterval(interval);
  }, [tab]);

  useEffect(() => {
    api.getProfiles()
      .then((data: any[]) => {
        if (Array.isArray(data)) setProfiles(data.filter((p: any) => p.rol !== 'cliente'));
      })
      .catch(() => {});
  }, []);

  // Auto-load tabs on first open
  useEffect(() => {
    if (tab === 'productivity' && !prodData) fetchProductivity();
  }, [tab]);

  useEffect(() => {
    if (tab === 'attendance' && attRecords.length === 0) fetchAttendance();
  }, [tab]);

  const fetchScreenshots = async () => {
    if (!ssUserId) return;
    setSsLoading(true);
    try {
      const data = await api.getTeamScreenshots(ssUserId, ssDate);
      setScreenshots(data.screenshots || []);
    } catch {} finally { setSsLoading(false); }
  };

  const fetchProductivity = async () => {
    setProdLoading(true);
    try {
      const data = await api.getTeamProductivity(prodDateFrom, prodDateTo);
      setProdData(data);
    } catch {} finally { setProdLoading(false); }
  };

  const fetchAttendance = async () => {
    setAttLoading(true);
    try {
      const data = await api.getTeamAttendance(attDateFrom, attDateTo);
      setAttRecords(data.records || []);
    } catch {} finally { setAttLoading(false); }
  };

  // Solo la PRIMERA carga reemplaza la pantalla. Con `loading` a secas, cada
  // recarga (buscar, filtrar, paginar) desmontaba la pagina entera: se perdia
  // el foco del input y los dialogos abiertos se cerraban solos.
  if (loading && primeraCarga) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const activeUsers = liveUsers.filter(u => u.session_status === 'active' || u.meeting_now);
  const checkedInUsers = liveUsers.filter(u => u.checked_in_at && !u.checked_out_at);
  const totalHoursToday = liveUsers.reduce((sum, u) => sum + Number(u.work_today_seconds ?? u.today_total_seconds ?? 0), 0);

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={setTab}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <TabsList className="h-9">
            <TabsTrigger value="live" className="gap-1.5 text-xs px-3"><Monitor className="h-3.5 w-3.5" /> En Vivo</TabsTrigger>
            <TabsTrigger value="screenshots" className="gap-1.5 text-xs px-3"><Camera className="h-3.5 w-3.5" /> Screenshots</TabsTrigger>
            <TabsTrigger value="productivity" className="gap-1.5 text-xs px-3"><BarChart3 className="h-3.5 w-3.5" /> Productividad</TabsTrigger>
            <TabsTrigger value="attendance" className="gap-1.5 text-xs px-3"><CalendarCheck className="h-3.5 w-3.5" /> Asistencia</TabsTrigger>
          </TabsList>
          {tab === 'live' && (
            <Button variant="outline" size="sm" onClick={fetchLive} disabled={refreshing} className="h-8">
              <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", refreshing && "animate-spin")} />
              Actualizar
            </Button>
          )}
        </div>

        {/* ====== LIVE TAB ====== */}
        <TabsContent value="live" className="mt-4 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SummaryCard icon={<Users className="h-4 w-4" />} label="Equipo" value={String(liveUsers.length)} color="text-blue-600 dark:text-blue-400" />
            <SummaryCard icon={<Activity className="h-4 w-4" />} label="Activos ahora" value={String(activeUsers.length)} color="text-green-600 dark:text-green-400" />
            <SummaryCard icon={<CalendarCheck className="h-4 w-4" />} label="Check-in" value={String(checkedInUsers.length)} color="text-purple-600 dark:text-purple-400" />
            <SummaryCard icon={<Clock className="h-4 w-4" />} label="Horas hoy (timer + reuniones)" value={formatShortTime(totalHoursToday)} color="text-orange-600 dark:text-orange-400" />
          </div>
          <p className="text-[11px] text-muted-foreground -mt-1">
            Las <strong className="text-foreground">horas de hoy</strong> suman timer + reuniones del Google Calendar (una reunión es trabajo). <strong className="text-foreground">Utilización</strong> = esas horas ÷ tiempo conectado hoy, sin almuerzo. Las reuniones solo cuentan dentro de la jornada marcada: las de antes del ingreso o del almuerzo no suman.
            Verde 40–85 % · <span className="text-amber-600 font-medium">ámbar más de 85 % (al tope, tenerlo en cuenta)</span> · rojo menos de 40 %.
            {liveUsers.filter((u) => Number(u.utilization_pct) > 85).length > 0 && <> Hoy por encima del 85 %: <strong className="text-foreground">{liveUsers.filter((u) => Number(u.utilization_pct) > 85).map((u) => String(u.nombre || '').trim().split(' ')[0]).join(', ')}</strong>.</>}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {ordenarLive(liveUsers).map((user, idx, arr) => (
              <div key={user.user_id} className="contents">
              {(idx === 0 || rangoLive(arr[idx - 1]) !== rangoLive(user)) && (
                <div className="col-span-full text-[11px] uppercase tracking-wide text-muted-foreground mt-2 first:mt-0">{ETIQUETA_RANGO[rangoLive(user)]} ({arr.filter((x) => rangoLive(x) === rangoLive(user)).length})</div>
              )}
              <Card
                key={user.user_id}
                className={cn(
                  "transition-all hover:shadow-md",
                  user.session_status === 'active' && "border-green-500/40 bg-green-500/[0.03]",
                  user.session_status === 'paused' && "border-yellow-500/40 bg-yellow-500/[0.03]",
                  !user.session_status && user.meeting_now && "border-emerald-500/40 bg-emerald-500/[0.03]",
                  !user.session_status && !user.meeting_now && user.checked_in_at && !user.checked_out_at && "border-blue-500/40 bg-blue-500/[0.03]"
                )}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="relative">
                      <Avatar className="h-10 w-10">
                        {user.avatar_url ? <AvatarImage src={user.avatar_url} className="object-cover" /> : null}
                        <AvatarFallback className="bg-primary/20 text-primary text-sm font-semibold">
                          {getInitials(user.nombre || '?')}
                        </AvatarFallback>
                      </Avatar>
                      {user.session_status === 'active' && (
                        <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-green-500 border-2 border-background" />
                      )}
                      {user.session_status === 'paused' && (
                        <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-yellow-500 border-2 border-background" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">{user.nombre}</span>
                        <StatusBadge status={user.session_status} hasSession={!!user.session_id} checkedIn={!!user.checked_in_at && !user.checked_out_at} meeting={!!user.meeting_now} />
                      </div>

                      {user.titulo_tarea && (
                        user.task_id ? (
                          <button onClick={() => navigate(`/tareas?task=${user.task_id}`)} className="text-xs text-primary hover:underline truncate mt-0.5 block max-w-full text-left" title="Ir a la tarea">{user.titulo_tarea}</button>
                        ) : (
                          <div className="text-xs text-muted-foreground truncate mt-0.5">{user.titulo_tarea}</div>
                        )
                      )}
                      {user.meeting_now && (
                        <div className="text-xs text-emerald-700 dark:text-emerald-400 truncate mt-0.5" title={`Reunión del calendario: ${user.meeting_now.summary}`}>
                          📅 En reunión: {user.meeting_now.summary} · hasta {new Date(user.meeting_now.end).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Guayaquil' })}
                        </div>
                      )}
                      {user.task_id && user.task_total_seconds != null && (
                        <div className="text-[10px] text-muted-foreground mt-0.5" title="Tiempo total registrado en esta tarea (todas las sesiones, de cualquier día) más la sesión en curso">
                          Acumulado en la tarea: <strong className="text-foreground">{formatTime(Number(user.task_total_seconds))}</strong>
                          {user.task_estimated_hours ? <span> de {user.task_estimated_hours} h estimadas</span> : null}
                        </div>
                      )}

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1" title={`Horas trabajadas HOY = timer ${formatTime(user.today_total_seconds || 0)} (sesiones cerradas + en curso) + reuniones del calendario ${formatTime(user.meetings_today_seconds || 0)}. El % de actividad mide teclado/mouse mientras el timer corre.`}>
                          <Clock className="h-3 w-3" />
                          <strong className="text-foreground">{formatTime(Number(user.work_today_seconds ?? user.today_total_seconds ?? 0))}</strong>
                          {Number(user.meetings_today_seconds) > 0 && <span className="text-[10px]">(timer {formatShortTime(Number(user.today_total_seconds || 0))} + reun. {formatShortTime(Number(user.meetings_today_seconds))})</span>}
                        </span>
                        {Number(user.meetings_today_total_seconds) > 0 && (
                          <span title={`Reuniones de su Google Calendar: ${formatShortTime(Number(user.meetings_today_seconds))} ya cuentan como trabajo (dentro de su jornada), de ${formatShortTime(Number(user.meetings_today_total_seconds))} agendadas hoy.${Number(user.meetings_outside_seconds) > 0 ? ` ${formatShortTime(Number(user.meetings_outside_seconds))} fueron antes de marcar ingreso o en el almuerzo y no cuentan.` : ''}`}>📅 Reuniones: {formatShortTime(Number(user.meetings_today_seconds))} de {formatShortTime(Number(user.meetings_today_total_seconds))}{Number(user.meetings_outside_seconds) > 0 && <span className="text-amber-600"> · {formatShortTime(Number(user.meetings_outside_seconds))} fuera de jornada</span>}</span>
                        )}
                        {user.utilization_pct != null && (
                          <span title="Utilización = (tiempo con timer + reuniones del calendario) ÷ tiempo conectado hoy, sin almuerzo. Más de 85 % = al tope, tenerlo en cuenta." className={cn('font-medium', user.utilization_pct > 85 ? 'text-amber-600' : user.utilization_pct >= 40 ? 'text-green-600' : 'text-red-600')}>
                            {user.utilization_pct}% util.{user.utilization_pct > 85 ? ' ⚠' : ''} <span className="font-normal text-muted-foreground">({formatShortTime(Number(user.today_total_seconds || 0) + Number(user.meetings_today_seconds || 0))} de {formatShortTime(Number(user.attendance_today_seconds || 0))})</span>
                          </span>
                        )}
                      </div>

                      {user.checked_in_at && (
                        <div className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                          <CalendarCheck className="h-2.5 w-2.5" />
                          Check-in: {new Date(user.checked_in_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                          {user.late_check_in && (
                            <span className="inline-flex items-center gap-0.5 ml-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 font-medium" title={`Primer ingreso de hoy después de las ${user.late_limit}`}>
                              ⚠ Ingreso tarde
                            </span>
                          )}
                          {user.lunch_start && !user.lunch_end && (
                            <span className="inline-flex items-center gap-0.5 ml-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 font-medium">
                              🍴 En almuerzo
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {user.last_screenshot && (
                      <div className="w-16 h-10 rounded border border-border overflow-hidden bg-muted shrink-0">
                        <img
                          src={`${window.location.origin}${user.last_screenshot.thumbnail_path || user.last_screenshot.file_path}`}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
              </div>
            ))}
          </div>
          {liveUsers.length === 0 && <EmptyState text="No hay usuarios en el equipo" />}
        </TabsContent>

        {/* ====== SCREENSHOTS TAB ====== */}
        <TabsContent value="screenshots" className="mt-4 space-y-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-end gap-3 flex-wrap">
                <div className="space-y-1">
                  <Label className="text-xs">Usuario</Label>
                  <Select value={ssUserId} onValueChange={setSsUserId}>
                    <SelectTrigger className="w-48 h-8"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                    <SelectContent>
                      {profiles.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Fecha</Label>
                  <Input type="date" className="h-8 w-40" value={ssDate} onChange={(e) => setSsDate(e.target.value)} />
                </div>
                <Button size="sm" className="h-8" onClick={fetchScreenshots} disabled={ssLoading || !ssUserId}>
                  {ssLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Buscar'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {screenshots.length > 0 ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Camera className="h-4 w-4" />
                  {screenshots.length} screenshots
                  <Badge variant="secondary" className="text-[10px]">{ssDate}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScreenshotTimeline screenshots={screenshots} />
              </CardContent>
            </Card>
          ) : ssUserId ? (
            <EmptyState text="Sin screenshots para esta fecha" />
          ) : (
            <EmptyState text="Selecciona un usuario para ver screenshots" />
          )}
        </TabsContent>

        {/* ====== PRODUCTIVITY TAB ====== */}
        <TabsContent value="productivity" className="mt-4 space-y-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-end gap-3 flex-wrap">
                <div className="space-y-1">
                  <Label className="text-xs">Desde</Label>
                  <Input type="date" className="h-8 w-40" value={prodDateFrom} onChange={(e) => setProdDateFrom(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Hasta</Label>
                  <Input type="date" className="h-8 w-40" value={prodDateTo} onChange={(e) => setProdDateTo(e.target.value)} />
                </div>
                <Button size="sm" className="h-8" onClick={fetchProductivity} disabled={prodLoading}>
                  {prodLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <BarChart3 className="h-3.5 w-3.5 mr-1.5" />}
                  Generar
                </Button>
              </div>
            </CardContent>
          </Card>

          {prodLoading && <LoadingState />}

          {prodData?.by_user && prodData.by_user.length > 0 && !prodLoading && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <SummaryCard icon={<Users className="h-4 w-4" />} label="Usuarios activos" value={String(prodData.by_user.length)} color="text-blue-600 dark:text-blue-400" />
                <SummaryCard icon={<Clock className="h-4 w-4" />} label="Total horas" value={formatShortTime(prodData.by_user.reduce((s: number, u: any) => s + Number(u.total_seconds), 0))} color="text-purple-600 dark:text-purple-400" />
                <SummaryCard
                  icon={<Activity className="h-4 w-4" />}
                  label="Actividad prom."
                  value={`${Math.round(prodData.by_user.reduce((s: number, u: any) => s + Number(u.avg_activity), 0) / prodData.by_user.length)}%`}
                  color="text-green-600 dark:text-green-400"
                />
                <SummaryCard icon={<Camera className="h-4 w-4" />} label="Screenshots" value={String(prodData.by_user.reduce((s: number, u: any) => s + Number(u.screenshots), 0))} color="text-orange-600 dark:text-orange-400" />
              </div>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    Horas por Usuario
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={Math.max(200, prodData.by_user.length * 45)}>
                    <BarChart
                      data={prodData.by_user.map((u: any) => ({
                        name: u.nombre?.split(' ')[0] || '?',
                        hours: Number((Number(u.total_seconds) / 3600).toFixed(1)),
                        activity: Math.round(Number(u.avg_activity)),
                      }))}
                      layout="vertical"
                      margin={{ left: 10, right: 20 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 11 }} />
                      <Tooltip
                        formatter={(value: number, name: string) => [
                          name === 'hours' ? `${value}h` : `${value}%`,
                          name === 'hours' ? 'Horas' : 'Actividad'
                        ]}
                        contentStyle={{ fontSize: 12 }}
                      />
                      <Bar dataKey="hours" fill="#8b5cf6" radius={[0, 4, 4, 0]} name="hours" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {prodData?.by_day && prodData.by_day.length > 1 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <BarChart3 className="h-4 w-4" />
                      Tendencia diaria
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart
                        data={prodData.by_day.map((d: any) => ({
                          day: new Date(d.day).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' }),
                          hours: Number((Number(d.total_seconds) / 3600).toFixed(1)),
                          users: d.active_users,
                        }))}
                        margin={{ left: -10, right: 10 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip contentStyle={{ fontSize: 12 }} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Line type="monotone" dataKey="hours" stroke="#8b5cf6" strokeWidth={2} name="Horas" dot={{ r: 3 }} />
                        <Line type="monotone" dataKey="users" stroke="#06b6d4" strokeWidth={2} name="Usuarios" dot={{ r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Detalle por usuario</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/30">
                          <th className="text-left p-3 font-medium text-muted-foreground">Usuario</th>
                          <th className="text-right p-3 font-medium text-muted-foreground">Horas</th>
                          <th className="text-right p-3 font-medium text-muted-foreground">Actividad</th>
                          <th className="text-right p-3 font-medium text-muted-foreground">Sesiones</th>
                          <th className="text-right p-3 font-medium text-muted-foreground">Idle</th>
                          <th className="text-right p-3 font-medium text-muted-foreground">Screenshots</th>
                        </tr>
                      </thead>
                      <tbody>
                        {prodData.by_user.map((u: any) => (
                          <tr key={u.user_id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                            <td className="p-3">
                              <div className="flex items-center gap-2">
                                <Avatar className="h-7 w-7">
                                  {u.avatar_url ? <AvatarImage src={u.avatar_url} className="object-cover" /> : null}
                                  <AvatarFallback className="bg-primary/20 text-primary text-[9px] font-semibold">
                                    {getInitials(u.nombre || '?')}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="font-medium">{u.nombre}</span>
                              </div>
                            </td>
                            <td className="p-3 text-right font-mono font-medium">{formatTime(Number(u.total_seconds))}</td>
                            <td className="p-3 text-right">
                              <div className="flex items-center justify-end">
                                <ActivityIndicator percent={Math.round(Number(u.avg_activity))} showLabel />
                              </div>
                            </td>
                            <td className="p-3 text-right text-muted-foreground">{u.session_count}</td>
                            <td className="p-3 text-right text-muted-foreground">{formatTime(Number(u.idle_seconds))}</td>
                            <td className="p-3 text-right text-muted-foreground">{u.screenshots}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {prodData && (!prodData.by_user || prodData.by_user.length === 0) && !prodLoading && (
            <EmptyState text="Sin datos de productividad para el rango seleccionado" />
          )}
        </TabsContent>

        {/* ====== ATTENDANCE TAB ====== */}
        <TabsContent value="attendance" className="mt-4 space-y-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-end gap-3 flex-wrap">
                <div className="space-y-1">
                  <Label className="text-xs">Desde</Label>
                  <Input type="date" className="h-8 w-40" value={attDateFrom} onChange={(e) => setAttDateFrom(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Hasta</Label>
                  <Input type="date" className="h-8 w-40" value={attDateTo} onChange={(e) => setAttDateTo(e.target.value)} />
                </div>
                <Button size="sm" className="h-8" onClick={fetchAttendance} disabled={attLoading}>
                  {attLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <CalendarCheck className="h-3.5 w-3.5 mr-1.5" />}
                  Buscar
                </Button>
              </div>
            </CardContent>
          </Card>

          {attLoading && <LoadingState />}

          {attRecords.length > 0 && !attLoading && (
            <>
              {(() => {
                const uniqueUsers = new Set(attRecords.map(r => r.user_id));
                const totalSecs = attRecords.reduce((s, r) => s + (r.total_seconds || 0), 0);
                const autoCheckouts = attRecords.filter(r => r.auto_checked_out).length;
                const openCheckIns = attRecords.filter(r => !r.check_out).length;
                return (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <SummaryCard icon={<Users className="h-4 w-4" />} label="Usuarios" value={String(uniqueUsers.size)} color="text-blue-600 dark:text-blue-400" />
                    <SummaryCard icon={<CalendarCheck className="h-4 w-4" />} label="Registros" value={String(attRecords.length)} color="text-purple-600 dark:text-purple-400" />
                    <SummaryCard icon={<Clock className="h-4 w-4" />} label="Total horas" value={formatShortTime(totalSecs)} color="text-green-600 dark:text-green-400" />
                    <SummaryCard
                      icon={<Activity className="h-4 w-4" />}
                      label={openCheckIns > 0 ? 'Abiertos' : 'Auto-cierre'}
                      value={String(openCheckIns > 0 ? openCheckIns : autoCheckouts)}
                      color={openCheckIns > 0 ? "text-yellow-600 dark:text-yellow-400" : "text-orange-600 dark:text-orange-400"}
                    />
                  </div>
                );
              })()}

              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/30">
                          <th className="text-left p-3 font-medium text-muted-foreground">Usuario</th>
                          <th className="text-left p-3 font-medium text-muted-foreground">Fecha</th>
                          <th className="text-left p-3 font-medium text-muted-foreground">Entrada</th>
                          <th className="text-left p-3 font-medium text-muted-foreground">Salida</th>
                          <th className="text-left p-3 font-medium text-muted-foreground">Almuerzo</th>
                          <th className="text-right p-3 font-medium text-muted-foreground">Total</th>
                          <th className="text-center p-3 font-medium text-muted-foreground">Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {attRecords.map((r: any) => (
                          <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                            <td className="p-3">
                              <div className="flex items-center gap-2">
                                <Avatar className="h-6 w-6">
                                  {r.avatar_url ? <AvatarImage src={r.avatar_url} className="object-cover" /> : null}
                                  <AvatarFallback className="bg-primary/20 text-primary text-[8px]">{getInitials(r.nombre || '?')}</AvatarFallback>
                                </Avatar>
                                <span className="font-medium">{r.nombre}</span>
                              </div>
                            </td>
                            <td className="p-3 text-muted-foreground">
                              {new Date(r.check_in).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                            </td>
                            <td className="p-3 font-mono text-sm">
                              {new Date(r.check_in).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                            </td>
                            <td className="p-3 font-mono text-sm">
                              {r.check_out
                                ? new Date(r.check_out).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
                                : <Badge className="bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20 text-[10px]">Abierto</Badge>
                              }
                            </td>
                            <td className="p-3 font-mono text-xs text-muted-foreground">
                              {r.lunch_start ? (
                                r.lunch_end ? (
                                  <span title="El almuerzo no cuenta en el total">
                                    🍴 {new Date(r.lunch_start).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                                    –{new Date(r.lunch_end).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                                    {' '}({Math.round((new Date(r.lunch_end).getTime() - new Date(r.lunch_start).getTime()) / 60000)}m)
                                  </span>
                                ) : (
                                  <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 text-[10px]">🍴 En almuerzo</Badge>
                                )
                              ) : (
                                <span className="opacity-40">—</span>
                              )}
                            </td>
                            <td className="p-3 text-right font-mono font-medium">{formatTime(r.total_seconds || 0)}</td>
                            <td className="p-3 text-center">
                              {r.auto_checked_out ? (
                                <Badge variant="secondary" className="text-[10px]">Auto-cierre</Badge>
                              ) : r.check_out ? (
                                <Badge className="bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20 text-[10px]">Completo</Badge>
                              ) : null}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {attRecords.length === 0 && !attLoading && (
            <EmptyState text="Sin registros de asistencia para el rango seleccionado" />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SummaryCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <Card>
      <CardContent className="p-3 flex items-center gap-3">
        <div className={cn("p-2 rounded-lg bg-muted/50", color)}>{icon}</div>
        <div>
          <div className={cn("text-xl font-bold tabular-nums", color)}>{value}</div>
          <div className="text-[11px] text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="text-center py-12 text-sm text-muted-foreground">{text}</div>;
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

function StatusBadge({ status, hasSession, checkedIn, meeting }: { status?: string; hasSession: boolean; checkedIn?: boolean; meeting?: boolean }) {
  if (status === 'active') return <Badge className="bg-green-500 text-white text-[10px] px-1.5 py-0">Activo</Badge>;
  if (meeting) return <Badge className="bg-emerald-600 text-white text-[10px] px-1.5 py-0" title="Reunión en curso según su Google Calendar">En reunión</Badge>;
  if (status === 'paused') return <Badge className="bg-yellow-500 text-white text-[10px] px-1.5 py-0">Pausado</Badge>;
  if (checkedIn) return <Badge className="bg-blue-500 text-white text-[10px] px-1.5 py-0">Conectado</Badge>;
  return <Badge variant="outline" className="text-[10px] px-1.5 py-0">Offline</Badge>;
}

// Orden de preferencia en el monitor: activos y en reunión primero, después pausados,
// conectados sin tarea y al final los que no están.
function rangoLive(u: any): number {
  if (u.session_status === 'active' || u.meeting_now) return 0;
  if (u.session_status === 'paused') return 1;
  if (u.checked_in_at && !u.checked_out_at) return 2;
  return 3;
}
const ETIQUETA_RANGO: Record<number, string> = { 0: 'Activos y en reunión', 1: 'Timer en pausa', 2: 'Conectados sin tarea activa', 3: 'Fuera / sin ingreso' };
function ordenarLive(list: any[]): any[] {
  return [...list].sort((a, b) => rangoLive(a) - rangoLive(b) || String(a.nombre || '').trim().localeCompare(String(b.nombre || '').trim()));
}
