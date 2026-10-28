import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { ActiveTimer } from '@/lib/apiClient';
import { ContenidoFlotante } from './ContenidoFlotante';
import { cerrarVentanaFlotante, useVentanaFlotante } from './useVentanaFlotante';

export function VentanaFlotante({ task }: { task?: ActiveTimer }) {
  const estado = useVentanaFlotante();
  const vista = useRef<Window | null>(null);
  const vioTimer = useRef(false);
  const esperada = useRef<string>();
  useEffect(() => {
    if (vista.current !== (estado?.ventana ?? null) || esperada.current !== estado?.tareaEsperada) {
      vista.current = estado?.ventana ?? null;
      esperada.current = estado?.tareaEsperada;
      vioTimer.current = false;
    }
    if (!estado) return;
    if (task && (!estado.tareaEsperada || estado.tareaEsperada === task.id)) vioTimer.current = true;
    if (!task && vioTimer.current) cerrarVentanaFlotante();
  }, [estado, task]);
  useEffect(() => () => cerrarVentanaFlotante(), []);
  if (!estado) return null;
  return createPortal(task
    ? <ContenidoFlotante key={task.id} task={task} onClose={cerrarVentanaFlotante} />
    : <p className="p-4 text-sm">Iniciando tarea…</p>, estado.ventana.document.body);
}
