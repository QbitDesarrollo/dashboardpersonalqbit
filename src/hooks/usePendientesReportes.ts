import { useEffect, useState } from 'react';
import { pendientesReportes } from '@/lib/reportesApi';

/** Weekly reports waiting for this person's review (badge next to "Proyectos"). Checked every five minutes. */
export function usePendientesReportes(habilitado: boolean): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!habilitado) { setN(0); return; }
    const revisar = () => { pendientesReportes().then(setN).catch(() => setN(0)); };
    revisar();
    const intervalo = setInterval(revisar, 5 * 60_000);
    return () => clearInterval(intervalo);
  }, [habilitado]);
  return n;
}
