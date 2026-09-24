import { useEffect, useState, useCallback } from 'react';
import { X, ZoomIn, ZoomOut, ExternalLink } from 'lucide-react';

/**
 * Visor de imágenes global (lightbox).
 *
 * Las capturas pegadas en incidencias, tareas, comentarios y novedades no se
 * podían ampliar: se veían chiquitas y sin forma de hacer zoom. Este componente
 * escucha los clics en TODA la app (delegación en document) y abre la imagen
 * en grande. Al montarse una sola vez en App.tsx funciona en todos lados sin
 * tocar cada pantalla.
 *
 * Alcance: imágenes dentro de contenido enriquecido (.ProseMirror, que es lo que
 * renderiza RichTextViewer) y las subidas por el editor (/uploads/editor/).
 * Los avatares y logos NO se ven afectados.
 */
const SELECTOR = '.ProseMirror img, img[src*="/uploads/editor/"]';

export function ImageLightbox() {
  const [src, setSrc] = useState<string | null>(null);
  const [zoom, setZoom] = useState(false);

  const close = useCallback(() => { setSrc(null); setZoom(false); }, []);

  // Cursor de lupa sobre las imágenes ampliables
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `${SELECTOR} { cursor: zoom-in; }`;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  // Delegación: cualquier clic en una imagen de contenido abre el visor
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null;
      if (!el || el.tagName !== 'IMG') return;
      if (!el.matches(SELECTOR)) return;
      // La imagen del propio visor también cumple el selector: si no la
      // excluimos, el clic para acercar reabría el visor y reseteaba el zoom.
      if (el.closest('[data-lightbox]')) return;
      const url = (el as HTMLImageElement).currentSrc || (el as HTMLImageElement).src;
      if (!url) return;
      e.preventDefault();
      e.stopPropagation();
      setSrc(url);
      setZoom(false);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  // Esc para cerrar
  useEffect(() => {
    if (!src) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    // bloquear el scroll de fondo mientras está abierto
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [src, close]);

  if (!src) return null;

  return (
    <div
      data-lightbox
      className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center animate-in fade-in duration-150"
      onClick={close}
      role="dialog"
      aria-label="Vista ampliada de la imagen"
    >
      {/* Barra de acciones */}
      <div className="absolute top-3 right-3 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={() => setZoom((z) => !z)}
          title={zoom ? 'Ajustar a la pantalla' : 'Acercar'}
          className="h-9 w-9 inline-flex items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors"
        >
          {zoom ? <ZoomOut className="h-4 w-4" /> : <ZoomIn className="h-4 w-4" />}
        </button>
        <a
          href={src}
          target="_blank"
          rel="noreferrer"
          title="Abrir original en otra pestaña"
          className="h-9 w-9 inline-flex items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
        <button
          type="button"
          onClick={close}
          title="Cerrar (Esc)"
          className="h-9 w-9 inline-flex items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Imagen: por defecto entra completa; con zoom se puede recorrer */}
      <div className={zoom ? 'w-full h-full overflow-auto p-4' : 'p-6'} onClick={(e) => e.stopPropagation()}>
        <img
          src={src}
          alt="Imagen ampliada"
          onClick={() => setZoom((z) => !z)}
          className={
            zoom
              ? 'max-w-none w-[200%] h-auto mx-auto cursor-zoom-out rounded-lg'
              : 'max-h-[88vh] max-w-[92vw] object-contain cursor-zoom-in rounded-lg shadow-2xl'
          }
        />
      </div>

      <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-white/60">
        Clic en la imagen para acercar · Esc o clic fuera para cerrar
      </p>
    </div>
  );
}
