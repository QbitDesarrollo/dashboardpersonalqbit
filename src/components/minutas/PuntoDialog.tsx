import type { Minuta, Punto } from '@/lib/minutasApi';
import { estadoPunto } from '@/lib/minutas';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { TONO } from './tonos';
import { VistaEvidencia } from './VistaEvidencia';
import { VistaGestionar } from './VistaGestionar';
import { VistaTareas } from './VistaTareas';

export type VistaPunto = 'evidencia' | 'tareas' | 'gestionar';

interface Props {
  minuta: Minuta;
  punto: Punto;
  /** Qué parte del punto se abre: cada acción de la lista abre solo lo suyo. */
  vista: VistaPunto;
  personas: { id: string; nombre: string }[];
  abierto: boolean;
  onOpenChange: (abierto: boolean) => void;
  onActualizada: (minuta: Minuta) => void;
}

const TITULO_VISTA: Record<VistaPunto, string> = { evidencia: 'Evidencia', tareas: 'Tareas', gestionar: 'Gestionar' };

/** Modal de un punto en modo gestión. Muestra una sola vista a la vez. */
export function PuntoDialog({ minuta, punto, personas, vista, abierto, onOpenChange, onActualizada }: Props) {
  const estado = estadoPunto(punto);
  return (
    <Dialog open={abierto} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-[95vw] max-h-[92vh] overflow-y-auto p-0 gap-0">
        <DialogHeader className="px-5 pt-5 pb-3 space-y-2 text-left">
          <DialogDescription className="font-mono text-xs uppercase tracking-wide">
            {minuta.codigo} · Punto {minuta.numero}.{punto.numero} · {TITULO_VISTA[vista]}
          </DialogDescription>
          <DialogTitle className="text-xl leading-snug">{punto.titulo}</DialogTitle>
          <span className={cn('inline-flex w-fit rounded-full px-2.5 py-0.5 text-xs font-medium', TONO[estado.tono])}>{estado.texto}</span>
        </DialogHeader>
        <div className="p-5 space-y-4">
          {vista === 'gestionar' && <VistaGestionar punto={punto} personas={personas} onActualizada={onActualizada} onGuardado={() => onOpenChange(false)} />}
          {vista === 'tareas' && <VistaTareas minuta={minuta} punto={punto} onActualizada={onActualizada} />}
          {vista === 'evidencia' && <VistaEvidencia punto={punto} onActualizada={onActualizada} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
