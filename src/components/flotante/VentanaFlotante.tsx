import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { ActiveTimer } from '@/lib/apiClient';
import { ContenidoFlotante } from './ContenidoFlotante';
import { estabaAbierta } from '@/lib/ventanaFlotante';
import { abrirVentanaFlotante, cerrarVentanaFlotante, useVentanaFlotante } from './useVentanaFlotante';

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
  // Tras recargar con la ventana abierta: el primer clic en la página la vuelve a abrir.
  const tareaActiva = task?.id;
  useEffect(() => {
    if (!tareaActiva || estado || !estabaAbierta(localStorage)) return;
    const reabrir = () => { document.removeEventListener('pointerdown', reabrir, true); void abrirVentanaFlotante(tareaActiva); };
    document.addEventListener('pointerdown', reabrir, true);
    return () => document.removeEventListener('pointerdown', reabrir, true);
  }, [tareaActiva, estado]);
  if (!estado) return null;
  const cambiando = !!estado.cambiando && estado.tareaEsperada !== task?.id;
  const espera = cambiando ? 'Cambiando de tarea…' : 'Iniciando tarea…';
  return createPortal(task && !cambiando
    ? <ContenidoFlotante key={task.id} task={task} onClose={cerrarVentanaFlotante} />
    : <p className="p-4 text-sm text-muted-foreground">{espera}</p>, estado.ventana.document.body);
}
