import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { obtenerMinuta, type Minuta } from '@/lib/minutasApi';
import { BarraPresentacion } from '@/components/minutas/presentacion/BarraPresentacion';
import { EncabezadoPresentacion } from '@/components/minutas/presentacion/EncabezadoPresentacion';
import { PanelMinuta } from '@/components/minutas/presentacion/PanelMinuta';
import { PuntoPresentado } from '@/components/minutas/presentacion/PuntoPresentado';

const escribiendo = (el: EventTarget | null) =>
  el instanceof HTMLElement && !!el.closest('input, textarea, select, [contenteditable="true"]');

/** Modo presentación: se recorre la minuta con el cliente, punto por punto, solo con lo que el cliente puede ver. */
export default function MinutaPresentar() {
  const { id = '' } = useParams();
  const [minuta, setMinuta] = useState<Minuta | null>(null);
  const [indice, setIndice] = useState(0);
  const contenedor = useRef<HTMLDivElement>(null);

  useEffect(() => { obtenerMinuta(id).then(setMinuta); }, [id]);

  const puntos = minuta ? minuta.items.filter((p) => p.visible_cliente && p.estado !== 'descartado') : [];
  const total = puntos.length;
  const posicion = Math.min(indice, total - 1);
  const actual = puntos[posicion];

  // Each point starts at its top, even if the previous one was scrolled down.
  useEffect(() => { contenedor.current?.scrollTo?.({ top: 0 }); }, [actual?.id]);

  // Flechas del teclado para avanzar mientras se comparte pantalla; no mientras se escribe una nota.
  useEffect(() => {
    const alPresionar = (e: KeyboardEvent) => {
      if (total === 0 || escribiendo(e.target)) return;
      if (e.key === 'ArrowRight') setIndice((i) => Math.min(i + 1, total - 1));
      if (e.key === 'ArrowLeft') setIndice((i) => Math.max(i - 1, 0));
    };
    window.addEventListener('keydown', alPresionar);
    return () => window.removeEventListener('keydown', alPresionar);
  }, [total]);

  if (!minuta) {
    return <div className="grid min-h-screen place-items-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const listos = puntos.filter((p) => p.estado === 'completado' || p.estado === 'aprobado').length;

  return (
    // Own scroll container: html/body hide horizontal overflow globally, which breaks sticky elements.
    <div ref={contenedor} className="relative h-[100svh] overflow-y-auto bg-muted/40">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-gradient-to-b from-primary/10 to-transparent" aria-hidden />
      <EncabezadoPresentacion minuta={minuta} listos={listos} total={total} />

      {/* Fills the screen below the header so the bar can rest at the bottom even for short points. */}
      <div className="relative mx-auto grid min-h-[calc(100svh-4.1rem)] max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[320px_minmax(0,1fr)] lg:py-8">
        <PanelMinuta minuta={minuta} puntos={puntos} actualId={actual?.id} onElegir={setIndice} />

        <main className="flex min-w-0 flex-col gap-4 pb-2">
          {actual ? (
            <>
              <PuntoPresentado punto={actual} codigo={`${minuta.numero}.${actual.numero}`} />
              <BarraPresentacion punto={actual} posicion={posicion} total={total} onIr={setIndice} onActualizada={setMinuta} />
            </>
          ) : (
            <p className="rounded-2xl border bg-card p-8 text-center text-lg text-muted-foreground shadow-sm">
              Esta minuta no tiene puntos para mostrar al cliente.
            </p>
          )}
        </main>
      </div>
    </div>
  );
}
