import { useSyncExternalStore } from 'react';
import { alturaFlotante, guardarTamano, leerPreferencia, olvidarAbierta, recordarAbierta, soportada } from '@/lib/ventanaFlotante';

interface API { requestWindow(size: { width: number; height: number; preferInitialWindowPlacement?: boolean }): Promise<Window> }
declare global {
  interface Window { documentPictureInPicture?: API }
}
interface Estado { ventana: Window; tareaEsperada?: string; tareaAnterior?: string; cambiando?: boolean; limpiar: () => void }
let estado: Estado | null = null;
let solicitud: Promise<void> | null = null;
let generacion = 0;
// true mientras la página se descarga (recarga o cierre): la ventana se cierra con ella, pero se recuerda.
let saliendo = false;
if (typeof window !== 'undefined') window.addEventListener('pagehide', () => { saliendo = true; });
const listeners = new Set<() => void>();
const emitir = () => listeners.forEach(listener => listener());
const snapshot = () => estado;
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

export function useVentanaFlotante() { return useSyncExternalStore(subscribe, snapshot, snapshot); }

export function cerrarVentanaFlotante() {
  generacion++;
  const anterior = estado;
  estado = null;
  if (anterior) olvidarAbierta(localStorage);
  anterior?.limpiar();
  anterior?.ventana.close();
  emitir();
}

const alturas = new Map<string, number>();
let tareaActual: string | undefined;

/** Remember loaded rows for the next gesture; asynchronous resizeTo is not allowed. */
export function prepararAlturaFlotante(taskId: string, height: number) {
  tareaActual = taskId;
  alturas.set(taskId, height);
}

/**
 * requestWindow runs in this call stack, before any asynchronous timer work. Resolves true when this
 * call opened the window. With the window already open (switching tasks) it only tells the window which
 * task to expect, without stealing focus from the confirmation shown in Tiusdei.
 */
export function abrirVentanaFlotante(tareaEsperada?: string): Promise<boolean> {
  if (!soportada(window)) return Promise.resolve(false);
  if (estado) {
    if (tareaEsperada && tareaEsperada !== estado.tareaEsperada) {
      estado = { ...estado, tareaAnterior: estado.tareaEsperada, tareaEsperada, cambiando: true };
      emitir();
    }
    return Promise.resolve(false);
  }
  if (solicitud) return solicitud.then(() => false);
  const version = ++generacion;
  try {
    const api = window.documentPictureInPicture;
    if (!api) return Promise.resolve(false);
    const height = alturas.get(tareaEsperada ?? tareaActual ?? '') ?? alturaFlotante({});
    const apertura = api.requestWindow({ width: 320, height, preferInitialWindowPlacement: true }).then(ventana => {
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
      const confirmarSalida = (event: BeforeUnloadEvent) => {
        event.preventDefault();
        event.returnValue = '';
      };
      window.addEventListener('beforeunload', confirmarSalida);
      const limpiar = () => {
        window.removeEventListener('beforeunload', confirmarSalida);
        guardar();
        tema.disconnect();
        ventana.removeEventListener('resize', guardar);
        ventana.removeEventListener('pagehide', ocultar);
      };
      const ocultar = () => {
        if (!saliendo) olvidarAbierta(localStorage);
        limpiar();
        if (estado?.ventana === ventana) { estado = null; emitir(); }
      };
      ventana.addEventListener('resize', guardar);
      ventana.addEventListener('pagehide', ocultar, { once: true });
      estado = { ventana, tareaEsperada, limpiar };
      saliendo = false;
      recordarAbierta(localStorage);
      emitir();
    }).catch(() => { /* La apertura nunca debe impedir iniciar la tarea. */ }).finally(() => { solicitud = null; });
    solicitud = apertura;
    return apertura.then(() => estado !== null);
  } catch { return Promise.resolve(false); }
}

/**
 * The timer did not start (for example, the change was cancelled in the confirmation): close the window
 * only if that same click opened it; otherwise keep showing the task that is still running.
 */
export function cancelarApertura(abiertaAhora: boolean) {
  if (abiertaAhora) { cerrarVentanaFlotante(); return; }
  if (!estado) return;
  estado = { ...estado, tareaEsperada: estado.tareaAnterior, tareaAnterior: undefined, cambiando: false };
  emitir();
}

export function abrirAlIniciar(taskId: string): Promise<boolean> {
  try { if (leerPreferencia(localStorage) || estado) return abrirVentanaFlotante(taskId); }
  catch { return abrirVentanaFlotante(taskId); }
  return Promise.resolve(false);
}
