import { useState } from 'react';
import { toast } from 'sonner';
import { accionPunto, agregarNota, type Minuta } from '@/lib/minutasApi';

/**
 * What can be done on a point while presenting. The meeting (team logged in) and the client link implement it
 * against different APIs; the screens only call these.
 */
export interface AccionesPresentacion {
  enviando: boolean;
  aprobar(puntoId: string): Promise<boolean>;
  pedirAjuste(puntoId: string, motivo: string): Promise<boolean>;
  comentar(puntoId: string, texto: string): Promise<boolean>;
}

/** Who is typing: the team on behalf of the client in a meeting, or the client through the link. */
export type ModoPresentacion = 'reunion' | 'cliente';

/** Runs an action that returns the updated minuta, with the sending flag and an error toast. */
export function useEjecutar<M>(onActualizada: (m: M) => void) {
  const [enviando, setEnviando] = useState(false);
  const ejecutar = async (fn: () => Promise<M>, fallo: string) => {
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
  return { enviando, ejecutar };
}

/** Actions of the in-app presentation, as the logged-in team member. */
export function useAccionesReunion(onActualizada: (m: Minuta) => void): AccionesPresentacion {
  const { enviando, ejecutar } = useEjecutar(onActualizada);
  return {
    enviando,
    aprobar: (id) => ejecutar(() => accionPunto(id, 'aprobar', {}), 'No se pudo actualizar el punto'),
    pedirAjuste: (id, motivo) => ejecutar(() => accionPunto(id, 'pedir_ajuste', { motivo }), 'No se pudo actualizar el punto'),
    comentar: (id, texto) => ejecutar(() => agregarNota(id, texto), 'No se pudo guardar la nota'),
  };
}
