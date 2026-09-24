import { useEffect, useState } from 'react';
import { Calendar, Video } from 'lucide-react';
import * as api from '@/lib/apiClient';
import { cn } from '@/lib/utils';

interface Meeting {
  id: string;
  summary: string;
  start: string;
  end: string;
  htmlLink: string;
  status?: string;
}

/**
 * "Tu día": franja con las reuniones de HOY del usuario (Google Calendar).
 * Carga automática al entrar a Tareas — el ejecutivo ve su día mapeado sin hacer nada.
 * Si Google no está conectado o no hay reuniones, no se muestra nada.
 */
export function TodayMeetings() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);

  useEffect(() => {
    let alive = true;
    const load = () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0).toISOString();
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();
      api.getGoogleCalendarEvents(start, end)
        .then((r: any) => {
          if (!alive) return;
          const evs = (r?.events || [])
            .filter((e: Meeting) => e.status !== 'cancelled' && e.start?.includes('T')) // solo con hora (fuera all-day)
            .sort((a: Meeting, b: Meeting) => a.start.localeCompare(b.start));
          setMeetings(evs);
        })
        .catch(() => { /* Google no conectado o error: no mostrar nada */ });
    };
    load();
    // refrescar cada 5 min: las reuniones se mueven o cancelan
    const iv = setInterval(load, 5 * 60 * 1000);
    return () => { alive = false; clearInterval(iv); };
  }, []);

  if (meetings.length === 0) return null;

  const now = Date.now();
  const fmt = (iso: string) => new Date(iso).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit', hour12: false });

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-muted/30 overflow-x-auto">
      <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground shrink-0">
        <Calendar className="h-3.5 w-3.5" />
        Tu día · {meetings.length} {meetings.length === 1 ? 'reunión' : 'reuniones'}
      </span>
      <div className="flex items-center gap-1.5">
        {meetings.map((m) => {
          const enCurso = now >= new Date(m.start).getTime() && now <= new Date(m.end).getTime();
          const pasada = now > new Date(m.end).getTime();
          return (
            <a
              key={m.id}
              href={m.htmlLink}
              target="_blank"
              rel="noreferrer"
              title={`${m.summary} · ${fmt(m.start)}–${fmt(m.end)} (abrir en Google Calendar)`}
              className={cn(
                'inline-flex items-center gap-1.5 shrink-0 px-2 py-1 rounded-md border text-[11px] font-medium transition-colors hover:bg-muted',
                enCurso && 'border-green-500 text-green-600 bg-green-500/10',
                pasada && 'opacity-50 line-through'
              )}
            >
              {enCurso && <Video className="h-3 w-3" />}
              <span className="font-mono">{fmt(m.start)}</span>
              <span className="max-w-[180px] truncate">{m.summary}</span>
            </a>
          );
        })}
      </div>
    </div>
  );
}
