import { useEffect, useState } from 'react';
import * as api from '@/lib/apiClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { LogIn, LogOut, Loader2, Clock } from 'lucide-react';
import { toast } from 'sonner';

interface Attendance {
  id: string;
  check_in: string;
  check_out: string | null;
  total_seconds: number;
}

export function CheckInWidget() {
  const [attendance, setAttendance] = useState<Attendance | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    api.getTodayAttendance()
      .then((d: any) => setAttendance(d.attendance || null))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Elapsed time for open check-in
  useEffect(() => {
    if (!attendance || attendance.check_out) return;
    const start = new Date(attendance.check_in).getTime();
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [attendance?.check_in, attendance?.check_out]);

  const handleCheckIn = async () => {
    setActing(true);
    try {
      const data = await api.checkIn();
      setAttendance(data.attendance);
      toast.success('Check-in registrado');
    } catch (e: any) {
      toast.error(e.message || 'Error');
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
      toast.error(e.message || 'Error');
    } finally {
      setActing(false);
    }
  };

  const formatTime = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    return `${h}h ${m.toString().padStart(2, '0')}m`;
  };

  if (loading) return null;

  const isCheckedIn = attendance && !attendance.check_out;
  const isCheckedOut = attendance && attendance.check_out;

  return (
    <Card className="border-border">
      <CardContent className="p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <div>
              <div className="text-xs text-muted-foreground">Asistencia</div>
              <div className="text-sm font-medium">
                {isCheckedIn && formatTime(elapsed)}
                {isCheckedOut && formatTime(attendance.total_seconds)}
                {!attendance && 'Sin registro'}
              </div>
            </div>
          </div>
          {!attendance || isCheckedOut ? (
            <Button size="sm" className="gap-1" onClick={handleCheckIn} disabled={acting}>
              {acting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogIn className="h-3.5 w-3.5" />}
              Check-in
            </Button>
          ) : (
            <Button size="sm" variant="outline" className="gap-1" onClick={handleCheckOut} disabled={acting}>
              {acting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
              Check-out
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
