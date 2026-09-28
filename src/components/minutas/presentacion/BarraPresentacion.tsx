import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { PuntoVista } from '@/lib/minutasApi';
import { Button } from '@/components/ui/button';
import { AccionesCliente } from './AccionesCliente';
import type { AccionesPresentacion, ModoPresentacion } from './acciones';

interface Props {
  punto: PuntoVista;
  posicion: number;
  total: number;
  onIr: (indice: number) => void;
  acciones: AccionesPresentacion;
  modo: ModoPresentacion;
}

/**
 * Bar that always sits at the bottom of the screen, in the same spot whatever the point's length,
 * so "Siguiente" never moves while presenting. Long points scroll behind it.
 */
export function BarraPresentacion({ punto, posicion, total, onIr, acciones, modo }: Props) {
  return (
    <div className="sticky bottom-3 z-10 mt-auto rounded-2xl border bg-card/95 p-2.5 shadow-lg backdrop-blur-xl sm:p-3">
      <div className="flex items-center gap-2">
        <Button variant="ghost" aria-label="Anterior" disabled={posicion === 0} onClick={() => onIr(posicion - 1)}>
          <ChevronLeft className="h-5 w-5" /><span className="hidden md:inline">Anterior</span>
        </Button>
        <div className="flex min-w-0 flex-1 items-center justify-center gap-3">
          <span className="hidden whitespace-nowrap font-mono text-xs text-muted-foreground lg:inline">{`Punto ${posicion + 1} de ${total}`}</span>
          <AccionesCliente key={punto.id} punto={punto} acciones={acciones} modo={modo} />
        </div>
        <Button aria-label="Siguiente" disabled={posicion >= total - 1} onClick={() => onIr(posicion + 1)}>
          <span className="hidden md:inline">Siguiente</span><ChevronRight className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}
