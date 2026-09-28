import { useEffect, useRef, useState } from 'react';
import type { MinutaVista } from '@/lib/minutasApi';
import type { AccionesPresentacion, ModoPresentacion } from './acciones';
import { BarraPresentacion } from './BarraPresentacion';
import { EncabezadoPresentacion } from './EncabezadoPresentacion';
import { PanelMinuta } from './PanelMinuta';
import { PuntoPresentado } from './PuntoPresentado';

const escribiendo = (el: EventTarget | null) =>
  el instanceof HTMLElement && !!el.closest('input, textarea, select, [contenteditable="true"]');

interface Props {
  minuta: MinutaVista;
  acciones: AccionesPresentacion;
  modo: ModoPresentacion;
  salirA?: string;
}

/**
 * A minuta presented point by point, only with what the client can see. Used in meetings (team logged in) and
 * behind the client link.
 */
export function PresentacionMinuta({ minuta, acciones, modo, salirA }: Props) {
  const [indice, setIndice] = useState(0);
  const contenedor = useRef<HTMLDivElement>(null);

  const puntos = minuta.items.filter((p) => p.visible_cliente && p.estado !== 'descartado');
  const total = puntos.length;
  const posicion = Math.min(indice, total - 1);
  const actual = puntos[posicion];

  // Each point starts at its top, even if the previous one was scrolled down.
  useEffect(() => { contenedor.current?.scrollTo?.({ top: 0 }); }, [actual?.id]);

  // Arrow keys move between points while sharing the screen; not while typing a note.
  useEffect(() => {
    const alPresionar = (e: KeyboardEvent) => {
      if (total === 0 || escribiendo(e.target)) return;
      if (e.key === 'ArrowRight') setIndice((i) => Math.min(i + 1, total - 1));
      if (e.key === 'ArrowLeft') setIndice((i) => Math.max(i - 1, 0));
    };
    window.addEventListener('keydown', alPresionar);
    return () => window.removeEventListener('keydown', alPresionar);
  }, [total]);

  const listos = puntos.filter((p) => p.estado === 'completado' || p.estado === 'aprobado').length;

  return (
    // Own scroll container: html/body hide horizontal overflow globally, which breaks sticky elements.
    <div ref={contenedor} className="relative h-[100svh] overflow-y-auto bg-muted/40">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-gradient-to-b from-primary/10 to-transparent" aria-hidden />
      <EncabezadoPresentacion minuta={minuta} listos={listos} total={total} salirA={salirA} />

      {/* Fills the screen below the header so the bar can rest at the bottom even for short points. */}
      <div className="relative mx-auto grid min-h-[calc(100svh-4.1rem)] max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[320px_minmax(0,1fr)] lg:py-8">
        <PanelMinuta minuta={minuta} puntos={puntos} actualId={actual?.id} onElegir={setIndice} />

        <main className="flex min-w-0 flex-col gap-4 pb-2">
          {actual ? (
            <>
              <PuntoPresentado punto={actual} codigo={`${minuta.numero}.${actual.numero}`} tituloNotas={modo === 'cliente' ? 'Comentarios' : undefined} />
              <BarraPresentacion punto={actual} posicion={posicion} total={total} onIr={setIndice} acciones={acciones} modo={modo} />
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
