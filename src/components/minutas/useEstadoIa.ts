import { useCallback, useEffect, useState } from 'react';
import { estadoIa, type EstadoIa } from '@/lib/minutasIaApi';

/** AI access and today's usage for the current person. `refrescar` after each draft. */
export function useEstadoIa() {
  const [estado, setEstado] = useState<EstadoIa | null>(null);
  const refrescar = useCallback(() => { estadoIa().then(setEstado).catch(() => {}); }, []);
  useEffect(() => { refrescar(); }, [refrescar]);
  return { estado, refrescar };
}
