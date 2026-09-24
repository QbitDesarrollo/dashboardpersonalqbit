import { useState } from 'react';
import { toast } from 'sonner';
import { accionPunto, type AccionPunto, type Minuta } from '@/lib/minutasApi';

/** Estado de envío y manejo de errores común a todas las acciones sobre un punto. */
export function usePuntoAcciones(puntoId: string, onActualizada: (m: Minuta) => void) {
  const [enviando, setEnviando] = useState(false);

  const conError = async (fn: () => Promise<Minuta>, fallo: string) => {
    setEnviando(true);
    try {
      onActualizada(await fn());
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : fallo);
      return false;
    } finally {
      setEnviando(false);
    }
  };

  const accion = (a: AccionPunto, datos: { resolucion?: string; motivo?: string } = {}) =>
    conError(() => accionPunto(puntoId, a, datos), 'No se pudo actualizar el punto');

  return { enviando, conError, accion };
}
