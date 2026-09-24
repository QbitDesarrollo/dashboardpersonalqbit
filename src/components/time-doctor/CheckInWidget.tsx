import { useEffect, useState, useRef, useCallback } from 'react';
import * as api from '@/lib/apiClient';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { LogIn, LogOut, Loader2, Clock, CheckCircle2, Utensils } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Attendance {
  id: string;
  check_in: string;
  check_out: string | null;
  total_seconds: number;
  lunch_start?: string | null;
  lunch_end?: string | null;
}

function parseErrorMsg(e: any): string {
  try {
    if (typeof e?.message === 'string') {
      const parsed = JSON.parse(e.message);
      return parsed.error || parsed.message || e.message;
    }
  } catch {}
  return e?.message || 'Error de conexión';
}

export function CheckInWidget() {
  const [attendance, setAttendance] = useState<Attendance | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<number | null>(null);

  const fetchToday = useCallback(async () => {
    try {
      const d = await api.getTodayAttendance();
      setAttendance(d.attendance || null);
    } catch {
      setAttendance(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchToday(); }, [fetchToday]);

  // Elapsed timer with clean ref-based cleanup
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    const isOpen = attendance && !attendance.check_out;
    if (!isOpen) {
      setElapsed(0);
      return;
    }

    const start = new Date(attendance.check_in).getTime();
    const tick = () => {
      // El almuerzo no cuenta como jornada: se descuenta del contador
      let lunch = 0;
      if (attendance.lunch_start) {
        const ls = new Date(attendance.lunch_start).getTime();
        const le = attendance.lunch_end ? new Date(attendance.lunch_end).getTime() : Date.now();
        lunch = Math.max(0, Math.floor((le - ls) / 1000));
      }
      setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000) - lunch));
    };
    tick();
    intervalRef.current = window.setInterval(tick, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [attendance?.id, attendance?.check_out, attendance?.lunch_start, attendance?.lunch_end]);

  const handleCheckIn = async () => {
    setActing(true);
    try {
      const data = await api.checkIn();
      setAttendance(data.attendance);
      toast.success('Check-in registrado');
    } catch (e: any) {
      const msg = parseErrorMsg(e);
      if (msg.includes('Ya tienes')) {
        await fetchToday();
      } else {
        toast.error(msg);
      }
    } finally {
      setActing(false);
    }
  };

  const handleCheckOut = async () => {
    setActing(true);
    try {
      const data = await api.checkOut();
      setAttendance(data.attendance);
      toast.success('Check-out registrado');
    } catch (e: any) {
      const msg = parseErrorMsg(e);
      if (msg.includes('No hay check-in')) {
        toast.info('No hay check-in abierto');
      } else {
        toast.error(msg);
      }
      // Always re-sync on error so the UI never gets stuck
      await fetchToday();
    } finally {
      setActing(false);
    }
  };

  const handleLunch = async (volver: boolean) => {
    setActing(true);
    try {
      const data = volver ? await api.lunchEnd() : await api.lunchStart();
      setAttendance(data.attendance);
      if (volver) {
        toast.success('¡Bienvenido de vuelta! Regreso registrado');
      } else {
        const n = Number(data?.timers_pausados || 0);
        toast.success('Salida a almuerzo registrada. ¡Buen provecho!', {
          description: n > 0
            ? `Se pausó ${n === 1 ? 'tu timer' : `${n} timers`} automáticamente. Al volver dale play a la tarea que retomes.`
            : undefined,
        });
        // La lista de tareas debe reflejar el timer detenido
        if (n > 0) setTimeout(() => window.location.reload(), 1500);
      }
    } catch (e: any) {
      toast.error(parseErrorMsg(e));
      await fetchToday();
    } finally {
      setActing(false);
    }
  };

  const formatTime = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (loading) return null;

  const isCheckedIn = attendance && !attendance.check_out;
  const isCheckedOut = attendance && !!attendance.check_out;
  const isOnLunch = !!(isCheckedIn && attendance.lunch_start && !attendance.lunch_end);
  const lunchDone = !!(attendance?.lunch_start && attendance?.lunch_end);
  const fmtHora = (d: string) => new Date(d).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "gap-1.5 h-9 px-2.5 font-medium text-xs relative hover:bg-muted hover:text-current",
            isOnLunch ? "text-amber-600 dark:text-amber-400" : isCheckedIn && "text-green-600 dark:text-green-400"
          )}
        >
          {isOnLunch ? (
            <>
              <Utensils className="h-4 w-4" />
              <span className="hidden sm:inline">Almuerzo</span>
            </>
          ) : isCheckedIn ? (
            <>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </span>
              <span className="hidden sm:inline tabular-nums">{formatTime(elapsed)}</span>
            </>
          ) : (
            <>
              <Clock className="h-4 w-4" />
              <span className="hidden sm:inline">
                {isCheckedOut ? formatTime(attendance.total_seconds) : 'Asistencia'}
              </span>
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="end" sideOffset={8}>
        <div className="space-y-3">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Asistencia</div>

          {isCheckedIn && (
            <div className="text-center space-y-1">
              <div className={cn("text-2xl font-bold tabular-nums", isOnLunch ? "text-amber-600 dark:text-amber-400" : "text-green-600 dark:text-green-400")}>
                {formatTime(elapsed)}
              </div>
              <div className="text-[10px] text-muted-foreground">
                Desde {fmtHora(attendance.check_in)}
              </div>
              {isOnLunch && (
                <div className="flex items-center justify-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-medium">
                  <Utensils className="h-3 w-3" />
                  En almuerzo desde {fmtHora(attendance.lunch_start!)}
                </div>
              )}
              {lunchDone && (
                <div className="text-[10px] text-muted-foreground">
                  🍴 Almuerzo: {fmtHora(attendance.lunch_start!)}–{fmtHora(attendance.lunch_end!)} (no cuenta en la jornada)
                </div>
              )}
            </div>
          )}

          {isCheckedOut && (
            <div className="text-center space-y-1">
              <div className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                Jornada completada
              </div>
              <div className="text-lg font-bold tabular-nums">
                {formatTime(attendance.total_seconds)}
              </div>
              <div className="text-[10px] text-muted-foreground">
                {new Date(attendance.check_in).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                {' - '}
                {new Date(attendance.check_out!).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          )}

          {!attendance && (
            <div className="text-center text-sm text-muted-foreground py-1">
              Sin registro hoy
            </div>
          )}

          {!attendance || isCheckedOut ? (
            <Button className="w-full gap-1.5" size="sm" onClick={handleCheckIn} disabled={acting}>
              {acting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogIn className="h-3.5 w-3.5" />}
              Check-in
            </Button>
          ) : isOnLunch ? (
            <Button className="w-full gap-1.5 bg-amber-500 hover:bg-amber-600 text-white" size="sm" onClick={() => handleLunch(true)} disabled={acting}>
              {acting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              Ya volví
            </Button>
          ) : (
            <div className="flex gap-1.5">
              {/* El boton NO desaparece tras usarse: queda deshabilitado con la hora,
                  para que no parezca que se esfumo (feedback de Fadel). */}
              {lunchDone ? (
                <span
                  className="inline-flex items-center gap-1 shrink min-w-0 h-9 px-2 rounded-md border text-[11px] text-muted-foreground cursor-help select-none"
                  title={`Almuerzo registrado: ${fmtHora(attendance.lunch_start!)}–${fmtHora(attendance.lunch_end!)} (uno por jornada, no cuenta en el total)`}
                >
                  <Utensils className="h-3 w-3 shrink-0" />
                  <span className="truncate">✓ {fmtHora(attendance.lunch_start!)}–{fmtHora(attendance.lunch_end!)}</span>
                </span>
              ) : (
                <Button variant="outline" className="flex-1 gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-50 hover:text-amber-800 dark:text-amber-400 dark:hover:bg-amber-950/30 dark:hover:text-amber-300" size="sm" onClick={() => handleLunch(false)} disabled={acting}>
                  {acting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Utensils className="h-3.5 w-3.5" />}
                  Almuerzo
                </Button>
              )}
              <Button variant="destructive" className="flex-1 min-w-0 gap-1.5 shrink-0" size="sm" onClick={handleCheckOut} disabled={acting}>
                {acting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
                Check-out
              </Button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
