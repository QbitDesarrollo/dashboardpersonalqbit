import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import * as api from '@/lib/apiClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalIcon,
  ExternalLink,
  Loader2,
  RefreshCw,
  LinkIcon,
} from 'lucide-react';

interface CalEvent {
  id: string;
  summary: string;
  description: string;
  start: string;
  end: string;
  htmlLink: string;
  status: string;
  /** Tarea que Tiusdei sincronizó al calendario ("[Tiusdei] ..."): no es una reunión. */
  es_tarea_tiusdei?: boolean;
}

export default function GoogleCalendarWidget() {
  const { profile } = useAuth();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [calendarPermitido, setCalendarPermitido] = useState(false);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<'month' | 'week'>('month');

  useEffect(() => {
    api.getGoogleCalendarStatus()
      .then((d: { connected: boolean; calendar?: boolean }) => {
        setConnected(d.connected);
        setCalendarPermitido(d.calendar !== false);
      })
      .catch(() => setConnected(false));
  }, []);

  const { rangeStart, rangeEnd } = useMemo(() => {
    const d = new Date(currentDate);
    let start: Date;
    let end: Date;
    if (view === 'month') {
      start = new Date(d.getFullYear(), d.getMonth(), 1);
      end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
    } else {
      const day = d.getDay();
      start = new Date(d);
      start.setDate(d.getDate() - day);
      start.setHours(0, 0, 0, 0);
      end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
    }
    return { rangeStart: start.toISOString(), rangeEnd: end.toISOString() };
  }, [currentDate, view]);

  const fetchEvents = () => {
    if (!connected || !calendarPermitido) return;
    setLoading(true);
    api.getGoogleCalendarEvents(rangeStart, rangeEnd)
      .then((d: { events: CalEvent[] }) => setEvents(d.events.filter((ev) => !ev.es_tarea_tiusdei)))
      .catch((e: Error) => {
        toast.error('Error cargando eventos: ' + e.message);
        setEvents([]);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (connected && calendarPermitido) fetchEvents();
    else setLoading(false);
  }, [connected, calendarPermitido, rangeStart, rangeEnd]);

  const navigate = (dir: number) => {
    const d = new Date(currentDate);
    if (view === 'month') d.setMonth(d.getMonth() + dir);
    else d.setDate(d.getDate() + dir * 7);
    setCurrentDate(d);
  };

  const monthLabel = currentDate.toLocaleDateString('es', { month: 'long', year: 'numeric' });
  const weekLabel = (() => {
    const d = new Date(currentDate);
    const day = d.getDay();
    const start = new Date(d);
    start.setDate(d.getDate() - day);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return `${start.toLocaleDateString('es', { day: 'numeric', month: 'short' })} - ${end.toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  })();

  const eventsByDate = useMemo(() => {
    const map: Record<string, CalEvent[]> = {};
    for (const ev of events) {
      const dateStr = ev.start ? ev.start.substring(0, 10) : '';
      if (!dateStr) continue;
      if (!map[dateStr]) map[dateStr] = [];
      map[dateStr].push(ev);
    }
    return map;
  }, [events]);

  const calendarDays = useMemo(() => {
    if (view === 'week') {
      const d = new Date(currentDate);
      const day = d.getDay();
      const start = new Date(d);
      start.setDate(d.getDate() - day);
      const days: Date[] = [];
      for (let i = 0; i < 7; i++) {
        const dd = new Date(start);
        dd.setDate(start.getDate() + i);
        days.push(dd);
      }
      return days;
    }
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const startDay = firstDay.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days: (Date | null)[] = [];
    for (let i = 0; i < startDay; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(new Date(year, month, i));
    return days;
  }, [currentDate, view]);

  if (connected === null) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const darPermiso = () => {
    const base = import.meta.env.VITE_API_URL || window.location.origin;
    window.location.href = `${base}/api/auth/google?mode=connect`;
  };

  if (connected && !calendarPermitido) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <CalIcon className="h-5 w-5 text-primary" />
            Google Calendar
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4 py-8">
          <p className="font-medium">Falta el permiso de Google Calendar</p>
          <p className="text-sm text-muted-foreground">Tu cuenta de Google está conectada, pero Tiusdei todavía no puede leer tu calendario.</p>
          <Button onClick={darPermiso} className="gap-2">
            <LinkIcon className="h-4 w-4" />
            Dar permiso
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!connected) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <CalIcon className="h-5 w-5 text-primary" />
            Google Calendar
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4 py-8">
          <p className="text-muted-foreground">Conecta tu cuenta de Google para ver tu calendario aqui.</p>
          <Button onClick={darPermiso} className="gap-2">
            <LinkIcon className="h-4 w-4" />
            Conectar Google Calendar
          </Button>
        </CardContent>
      </Card>
    );
  }

  const today = new Date().toISOString().substring(0, 10);
  const dayNames = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <CalIcon className="h-5 w-5 text-primary" />
            Google Calendar
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => setView(view === 'month' ? 'week' : 'month')}>
              {view === 'month' ? 'Semana' : 'Mes'}
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium min-w-[140px] text-center capitalize">
              {view === 'month' ? monthLabel : weekLabel}
            </span>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={fetchEvents} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : view === 'week' ? (
          <div className="space-y-1">
            {(calendarDays as Date[]).map((day) => {
              const ds = day.toISOString().substring(0, 10);
              const evs = eventsByDate[ds] || [];
              const isToday = ds === today;
              return (
                <div key={ds} className={`flex gap-3 p-2 rounded-lg ${isToday ? 'bg-primary/5 border border-primary/20' : 'hover:bg-muted/50'}`}>
                  <div className={`text-center min-w-[50px] ${isToday ? 'text-primary font-bold' : 'text-muted-foreground'}`}>
                    <div className="text-xs">{dayNames[day.getDay()]}</div>
                    <div className="text-lg">{day.getDate()}</div>
                  </div>
                  <div className="flex-1 space-y-1">
                    {evs.length === 0 && (
                      <p className="text-xs text-muted-foreground italic py-1">Sin eventos</p>
                    )}
                    {evs.map((ev) => (
                      <div key={ev.id} className="flex items-center gap-2 text-xs p-1.5 rounded bg-muted/50">
                        <span className="font-medium truncate flex-1">{ev.summary}</span>
                        <span className="text-muted-foreground shrink-0">
                          {ev.start.includes('T') ? new Date(ev.start).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) : 'Todo el dia'}
                        </span>
                        {ev.htmlLink && (
                          <a href={ev.htmlLink} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80">
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-7 gap-px mb-1">
              {dayNames.map((d) => (
                <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-px">
              {(calendarDays as (Date | null)[]).map((day, i) => {
                if (!day) return <div key={`e-${i}`} className="min-h-[60px]" />;
                const ds = day.toISOString().substring(0, 10);
                const evs = eventsByDate[ds] || [];
                const isToday = ds === today;
                return (
                  <div
                    key={ds}
                    className={`min-h-[60px] p-1 rounded border text-xs ${isToday ? 'border-primary bg-primary/5' : 'border-transparent hover:bg-muted/30'}`}
                  >
                    <div className={`text-right text-[10px] mb-0.5 ${isToday ? 'text-primary font-bold' : 'text-muted-foreground'}`}>
                      {day.getDate()}
                    </div>
                    {evs.slice(0, 3).map((ev) => (
                      <div
                        key={ev.id}
                        className="truncate text-[10px] px-1 py-0.5 mb-0.5 rounded bg-primary/10 text-primary cursor-pointer hover:bg-primary/20"
                        title={ev.summary}
                        onClick={() => ev.htmlLink && window.open(ev.htmlLink, '_blank')}
                      >
                        {ev.summary}
                      </div>
                    ))}
                    {evs.length > 3 && (
                      <Badge variant="secondary" className="text-[9px] px-1 py-0">+{evs.length - 3}</Badge>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        <div className="flex items-center justify-between mt-3 pt-3 border-t">
          <span className="text-xs text-muted-foreground">{events.length} eventos</span>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-7 gap-1"
            onClick={() => setCurrentDate(new Date())}
          >
            Hoy
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
