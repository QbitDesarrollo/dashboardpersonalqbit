import { useEffect, useState } from 'react';
import * as api from '@/lib/apiClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, RefreshCw, Monitor, Camera, BarChart3, CalendarCheck } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { ActivityIndicator } from '@/components/tasks/ActivityIndicator';
import { ScreenshotTimeline } from '@/components/time-doctor/ScreenshotTimeline';
import { cn, getInitials } from '@/lib/utils';

const formatTime = (secs: number) => {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return `${h}h ${m.toString().padStart(2, '0')}m`;
};

export default function TeamMonitor() {
  const [tab, setTab] = useState('live');
  const [loading, setLoading] = useState(true);

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
  const [prodDateFrom, setProdDateFrom] = useState(new Date().toISOString().slice(0, 10));
  const [prodDateTo, setProdDateTo] = useState(new Date().toISOString().slice(0, 10));
  const [prodData, setProdData] = useState<any>(null);
  const [prodLoading, setProdLoading] = useState(false);

  // Attendance tab
  const [attDateFrom, setAttDateFrom] = useState(new Date().toISOString().slice(0, 10));
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
    }
  };

  useEffect(() => { fetchLive(); }, []);

  // Auto-refresh live every 30s
  useEffect(() => {
    if (tab !== 'live') return;
    const interval = setInterval(fetchLive, 30000);
    return () => clearInterval(interval);
  }, [tab]);

  // Load profiles for screenshot selector
  useEffect(() => {
    api.getProfiles()
      .then((data: any[]) => {
        if (Array.isArray(data)) setProfiles(data.filter((p: any) => p.rol !== 'cliente'));
      })
      .catch(() => {});
  }, []);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Monitor de Equipo</h2>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="live" className="gap-1"><Monitor className="h-4 w-4" /> En Vivo</TabsTrigger>
          <TabsTrigger value="screenshots" className="gap-1"><Camera className="h-4 w-4" /> Screenshots</TabsTrigger>
          <TabsTrigger value="productivity" className="gap-1"><BarChart3 className="h-4 w-4" /> Productividad</TabsTrigger>
          <TabsTrigger value="attendance" className="gap-1"><CalendarCheck className="h-4 w-4" /> Asistencia</TabsTrigger>
        </TabsList>

        {/* LIVE TAB */}
        <TabsContent value="live" className="mt-4">
          <div className="flex justify-end mb-3">
            <Button variant="outline" size="sm" onClick={fetchLive} disabled={refreshing}>
              <RefreshCw className={cn("h-4 w-4 mr-1", refreshing && "animate-spin")} />
              Actualizar
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {liveUsers.map((user) => (
              <Card key={user.user_id} className={cn("transition-all", user.session_status === 'active' && "border-green-500/50 shadow-green-500/10 shadow-sm")}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <Avatar className="h-10 w-10">
                      {user.avatar_url ? <AvatarImage src={user.avatar_url} className="object-cover" /> : null}
                      <AvatarFallback className="bg-primary/20 text-primary text-sm font-semibold">
                        {getInitials(user.nombre || '?')}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">{user.nombre}</span>
                        {user.session_status === 'active' && (
                          <Badge className="bg-green-500 text-white text-[10px] px-1.5">Activo</Badge>
                        )}
                        {user.session_status === 'paused' && (
                          <Badge variant="secondary" className="text-[10px] px-1.5">Pausado</Badge>
                        )}
                        {!user.session_id && (
                          <Badge variant="outline" className="text-[10px] px-1.5">Sin timer</Badge>
                        )}
                      </div>

                      {user.titulo_tarea && (
                        <div className="text-xs text-muted-foreground truncate mt-0.5">{user.titulo_tarea}</div>
                      )}

                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                        <span>Hoy: <strong className="text-foreground">{formatTime(user.today_total_seconds || 0)}</strong></span>
                        {user.activity_level != null && user.session_id && (
                          <ActivityIndicator percent={user.activity_level} showLabel size="sm" />
                        )}
                      </div>

                      {user.checked_in_at && (
                        <div className="text-[10px] text-muted-foreground mt-1">
                          Check-in: {new Date(user.checked_in_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
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
            ))}
          </div>
          {liveUsers.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">No hay usuarios activos</div>
          )}
        </TabsContent>

        {/* SCREENSHOTS TAB */}
        <TabsContent value="screenshots" className="mt-4 space-y-4">
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
            <Button size="sm" onClick={fetchScreenshots} disabled={ssLoading || !ssUserId}>
              {ssLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Buscar'}
            </Button>
          </div>

          <ScreenshotTimeline screenshots={screenshots} />
        </TabsContent>

        {/* PRODUCTIVITY TAB */}
        <TabsContent value="productivity" className="mt-4 space-y-4">
          <div className="flex items-end gap-3 flex-wrap">
            <div className="space-y-1">
              <Label className="text-xs">Desde</Label>
              <Input type="date" className="h-8 w-40" value={prodDateFrom} onChange={(e) => setProdDateFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Hasta</Label>
              <Input type="date" className="h-8 w-40" value={prodDateTo} onChange={(e) => setProdDateTo(e.target.value)} />
            </div>
            <Button size="sm" onClick={fetchProductivity} disabled={prodLoading}>
              {prodLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Generar'}
            </Button>
          </div>

          {prodData?.by_user && prodData.by_user.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Horas por Usuario</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={Math.max(200, prodData.by_user.length * 40)}>
                  <BarChart data={prodData.by_user.map((u: any) => ({
                    name: u.nombre?.split(' ')[0] || '?',
                    hours: Number((Number(u.total_seconds) / 3600).toFixed(1)),
                    activity: Math.round(Number(u.avg_activity)),
                  }))} layout="vertical">
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(value: number, name: string) => [name === 'hours' ? `${value}h` : `${value}%`, name === 'hours' ? 'Horas' : 'Actividad']} />
                    <Bar dataKey="hours" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {prodData?.by_user && prodData.by_user.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Detalle por Usuario</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {prodData.by_user.map((u: any) => (
                    <div key={u.user_id} className="flex items-center justify-between gap-2 p-2 rounded-lg border border-border bg-muted/20">
                      <div className="flex items-center gap-2">
                        <Avatar className="h-7 w-7">
                          {u.avatar_url ? <AvatarImage src={u.avatar_url} className="object-cover" /> : null}
                          <AvatarFallback className="bg-primary/20 text-primary text-[9px] font-semibold">
                            {getInitials(u.nombre || '?')}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm font-medium">{u.nombre}</span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>{formatTime(Number(u.total_seconds))}</span>
                        <ActivityIndicator percent={Math.round(Number(u.avg_activity))} showLabel />
                        <span>{u.session_count} sesiones</span>
                        <span>{u.screenshots} screenshots</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ATTENDANCE TAB */}
        <TabsContent value="attendance" className="mt-4 space-y-4">
          <div className="flex items-end gap-3 flex-wrap">
            <div className="space-y-1">
              <Label className="text-xs">Desde</Label>
              <Input type="date" className="h-8 w-40" value={attDateFrom} onChange={(e) => setAttDateFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Hasta</Label>
              <Input type="date" className="h-8 w-40" value={attDateTo} onChange={(e) => setAttDateTo(e.target.value)} />
            </div>
            <Button size="sm" onClick={fetchAttendance} disabled={attLoading}>
              {attLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Buscar'}
            </Button>
          </div>

          {attRecords.length > 0 ? (
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 text-muted-foreground">
                    <th className="text-left p-2 font-medium">Usuario</th>
                    <th className="text-left p-2 font-medium">Fecha</th>
                    <th className="text-left p-2 font-medium">Check-in</th>
                    <th className="text-left p-2 font-medium">Check-out</th>
                    <th className="text-left p-2 font-medium">Total</th>
                    <th className="text-left p-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {attRecords.map((r: any) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="p-2">
                        <div className="flex items-center gap-1.5">
                          <Avatar className="h-6 w-6">
                            {r.avatar_url ? <AvatarImage src={r.avatar_url} className="object-cover" /> : null}
                            <AvatarFallback className="bg-primary/20 text-primary text-[8px]">{getInitials(r.nombre || '?')}</AvatarFallback>
                          </Avatar>
                          <span>{r.nombre}</span>
                        </div>
                      </td>
                      <td className="p-2 text-muted-foreground">
                        {new Date(r.check_in).toLocaleDateString('es-ES')}
                      </td>
                      <td className="p-2">
                        {new Date(r.check_in).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="p-2">
                        {r.check_out
                          ? new Date(r.check_out).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
                          : <Badge variant="outline" className="text-[10px]">Abierto</Badge>
                        }
                      </td>
                      <td className="p-2 font-medium">{formatTime(r.total_seconds || 0)}</td>
                      <td className="p-2">
                        {r.auto_checked_out ? <Badge variant="secondary" className="text-[10px]">Auto</Badge> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">Sin registros de asistencia</div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
