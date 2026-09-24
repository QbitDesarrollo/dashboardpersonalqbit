import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { obtenerMinuta, type Minuta } from '@/lib/minutasApi';
import { Button } from '@/components/ui/button';
import { AccionesCliente } from '@/components/minutas/presentacion/AccionesCliente';
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

  useEffect(() => { obtenerMinuta(id).then(setMinuta); }, [id]);

  const puntos = minuta ? minuta.items.filter((p) => p.visible_cliente && p.estado !== 'descartado') : [];
  const total = puntos.length;

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

  const posicion = Math.min(indice, total - 1);
  const actual = puntos[posicion];
  const listos = puntos.filter((p) => p.estado === 'completado' || p.estado === 'aprobado').length;

  return (
    <div className="relative min-h-screen bg-muted/40">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-gradient-to-b from-primary/10 to-transparent" aria-hidden />
      <EncabezadoPresentacion minuta={minuta} listos={listos} total={total} />

      <div className="relative mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[320px_minmax(0,1fr)] lg:py-8">
        <PanelMinuta minuta={minuta} puntos={puntos} actualId={actual?.id} onElegir={setIndice} />

        <main className="min-w-0 space-y-4">
          {actual ? (
            <>
              <PuntoPresentado
                punto={actual}
                codigo={`${minuta.numero}.${actual.numero}`}
                acciones={<AccionesCliente key={actual.id} punto={actual} onActualizada={setMinuta} />}
              />
              <nav aria-label="Cambiar de punto" className="flex items-center justify-between gap-3">
                <Button variant="outline" size="lg" className="bg-card" disabled={posicion === 0} onClick={() => setIndice(posicion - 1)}>
                  <ChevronLeft className="h-5 w-5" />Anterior
                </Button>
                <div className="text-center">
                  <p className="font-mono text-sm text-muted-foreground">{`Punto ${posicion + 1} de ${total}`}</p>
                  <p className="hidden text-[11px] text-muted-foreground/70 sm:block">También con las flechas ← →</p>
                </div>
                <Button size="lg" disabled={posicion >= total - 1} onClick={() => setIndice(posicion + 1)}>
                  Siguiente<ChevronRight className="h-5 w-5" />
                </Button>
              </nav>
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
