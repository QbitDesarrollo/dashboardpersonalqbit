import { useEffect, useState } from 'react';
import { getGoogleCalendarEvents, getGoogleCalendarStatus } from '@/lib/apiClient';
import type { Reunion } from '@/lib/reuniones';

/** Reloj local por minuto; polling cada cinco minutos y foco limitado a una petición/minuto. */
export function useReunionesVivas(inicio: string, fin: string, userId?: string) {
  const [now, setNow] = useState(Date.now);
  const [estado, setEstado] = useState<'cargando' | 'conectado' | 'sin_token' | 'sin_permiso' | 'error'>('cargando');
  const [eventos, setEventos] = useState<Reunion[]>([]);
  useEffect(() => {
    let vivo = true, ultimo = -Infinity, pendiente = false;
    setEventos([]); setEstado('cargando');
    const cargar = async () => {
      if (pendiente || Date.now() - ultimo < 60000) return;
      pendiente = true; ultimo = Date.now();
      try {
        const status: { connected: boolean; calendar?: boolean } = await (userId ? getGoogleCalendarStatus(userId) : getGoogleCalendarStatus());
        if (!vivo) return;
        if (!status.connected) { setEstado('sin_token'); setEventos([]); return; }
        if (status.calendar === false) { setEstado('sin_permiso'); setEventos([]); return; }
        const datos: { events: Reunion[] } = await (userId ? getGoogleCalendarEvents(inicio, fin, userId) : getGoogleCalendarEvents(inicio, fin));
        if (vivo) {
          setEventos(datos.events.filter(e => e.es_reunion === true && !e.es_tarea_tiusdei).sort((a, b) => Date.parse(a.start) - Date.parse(b.start)));
          setEstado('conectado');
        }
      } catch { if (vivo) setEstado('error'); }
      finally { pendiente = false; }
    };
    const volver = () => {
      if (document.visibilityState === 'hidden') return;
      setNow(Date.now()); void cargar();
    };
    void cargar();
    const reloj = setInterval(() => setNow(Date.now()), 60000);
    const refresco = setInterval(() => { if (document.visibilityState !== 'hidden') void cargar(); }, 300000);
    window.addEventListener('focus', volver); document.addEventListener('visibilitychange', volver);
    return () => {
      vivo = false; clearInterval(reloj); clearInterval(refresco);
      window.removeEventListener('focus', volver); document.removeEventListener('visibilitychange', volver);
    };
  }, [inicio, fin, userId]);
  return { now, estado, eventos };
}
