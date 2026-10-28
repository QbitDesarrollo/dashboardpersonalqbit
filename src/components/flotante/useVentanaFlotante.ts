import { useSyncExternalStore } from 'react';
import { guardarTamano, leerPreferencia, leerTamano, limitarTamano, soportada } from '@/lib/ventanaFlotante';

interface API { requestWindow(size: { width: number; height: number }): Promise<Window> }
declare global {
  interface Window { documentPictureInPicture?: API }
}
interface Estado { ventana: Window; tareaEsperada?: string; limpiar: () => void }
let estado: Estado | null = null;
let solicitud: Promise<void> | null = null;
let generacion = 0;
const listeners = new Set<() => void>();
const emitir = () => listeners.forEach(listener => listener());
const snapshot = () => estado;
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

export function useVentanaFlotante() { return useSyncExternalStore(subscribe, snapshot, snapshot); }

export function cerrarVentanaFlotante() {
  generacion++;
  const anterior = estado;
  estado = null;
  anterior?.limpiar();
  anterior?.ventana.close();
  emitir();
}

export function esperarTimerFlotante(taskId: string) {
  if (estado) { estado = { ...estado, tareaEsperada: taskId }; emitir(); }
}

/** requestWindow runs in this call stack, before any asynchronous timer work. */
export function abrirVentanaFlotante(tareaEsperada?: string): Promise<void> {
  if (!soportada(window)) return Promise.resolve();
  if (estado) { estado.ventana.focus(); return Promise.resolve(); }
  if (solicitud) return solicitud;
  const version = ++generacion;
  try {
    const api = window.documentPictureInPicture;
    if (!api) return Promise.resolve();
    let size = limitarTamano({});
    try { size = leerTamano(localStorage); } catch { /* Almacenamiento bloqueado. */ }
    solicitud = api.requestWindow(size).then(ventana => {
      if (version !== generacion) { ventana.close(); return; }
      const doc = ventana.document;
      doc.title = 'Tiusdei · Ventana flotante';
      doc.documentElement.lang = 'es';
      doc.documentElement.className = document.documentElement.className;
      doc.documentElement.style.cssText = document.documentElement.style.cssText;
      const base = doc.createElement('base');
      base.href = document.baseURI;
      doc.head.appendChild(base);
      document.querySelectorAll('link[rel="stylesheet"], style').forEach(node => doc.head.appendChild(node.cloneNode(true)));
      const guardar = () => {
        try { guardarTamano(localStorage, { width: ventana.innerWidth, height: ventana.innerHeight }); } catch { /* Almacenamiento bloqueado. */ }
      };
      const tema = new MutationObserver(() => {
        doc.documentElement.className = document.documentElement.className;
        doc.documentElement.style.cssText = document.documentElement.style.cssText;
      });
      tema.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] });
      const limpiar = () => {
        guardar();
        tema.disconnect();
        ventana.removeEventListener('resize', guardar);
        ventana.removeEventListener('pagehide', ocultar);
      };
      const ocultar = () => {
        limpiar();
        if (estado?.ventana === ventana) { estado = null; emitir(); }
      };
      ventana.addEventListener('resize', guardar);
      ventana.addEventListener('pagehide', ocultar, { once: true });
      estado = { ventana, tareaEsperada, limpiar };
      emitir();
    }).catch(() => { /* La apertura nunca debe impedir iniciar la tarea. */ }).finally(() => { solicitud = null; });
    return solicitud;
  } catch { return Promise.resolve(); }
}

export function abrirAlIniciar(taskId: string) {
  try { if (leerPreferencia(localStorage)) return abrirVentanaFlotante(taskId); }
  catch { return abrirVentanaFlotante(taskId); }
  return Promise.resolve();
}
