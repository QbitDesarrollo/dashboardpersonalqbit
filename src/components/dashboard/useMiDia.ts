import { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/apiClient';
import type { MiDia } from '@/lib/miDia';

export function useMiDia(userId: string | undefined) {
  const [dia, setDia] = useState<MiDia | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    setDia(null); setError(false);
    if (!userId) return;
    const controller = new AbortController();
    let cargando = false;
    const cargar = async () => {
      if (cargando) return;
      cargando = true;
      try {
        const respuesta = await apiRequest('/api/data/mi-dia', { signal: controller.signal });
        if (!respuesta.ok) throw new Error('Mi día');
        const datos: MiDia = await respuesta.json();
        if (!controller.signal.aborted) { setDia(datos); setError(false); }
      } catch { if (!controller.signal.aborted) setError(true); }
      finally { cargando = false; }
    };
    void cargar();
    const intervalo = setInterval(() => void cargar(), 60000);
    return () => { controller.abort(); clearInterval(intervalo); };
  }, [userId]);
  return { dia, error };
}
