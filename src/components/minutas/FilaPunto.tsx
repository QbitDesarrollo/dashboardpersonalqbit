import type { CSSProperties, ReactNode, Ref } from 'react';
import { CalendarDays, CircleCheck, Link2, Pencil, SquareCheck, User } from 'lucide-react';
import type { Minuta, Punto } from '@/lib/minutasApi';
import { estadoPunto, listoParaCerrar, tareaLista, vencimiento } from '@/lib/minutas';
import { cn } from '@/lib/utils';
import { IconoEstado } from './IconoEstado';
import type { VistaPunto } from './PuntoDialog';
import { TONO } from './tonos';

/** Drag support given by the sortable list: the row node, its moving style and the grip button. */
export interface Arrastre { ref: Ref<HTMLLIElement>; estilo: CSSProperties; agarradera: ReactNode; arrastrando: boolean }

/** One point in the minuta list: full description, status, due date and one button per view. */
export function FilaPunto({ minuta, p, hoy, onAbrir, arrastre }: {
  minuta: Minuta; p: Punto; hoy: string; onAbrir: (vista: VistaPunto) => void; arrastre?: Arrastre;
}) {
  const codigo = `${minuta.numero}.${p.numero}`;
  const estado = estadoPunto(p);
  const aviso = vencimiento(p.fecha_compromiso, p.estado, hoy);
  const cerrado = p.estado === 'completado' || p.estado === 'aprobado';
  const listas = p.tareas.filter(tareaLista).length;
  const chip = 'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-medium text-foreground/80 hover:bg-muted';
  return (
    <li
      ref={arrastre?.ref}
      style={arrastre?.estilo}
      aria-label={`Punto ${codigo}`}
      className={cn(
        'grid gap-x-3 border-t bg-card px-4 py-3.5 first:border-t-0',
        arrastre ? 'grid-cols-[18px_24px_36px_minmax(0,1fr)_32px] pl-2' : 'grid-cols-[24px_36px_minmax(0,1fr)_32px]',
        arrastre?.arrastrando && 'relative z-10 rounded-lg shadow-lg ring-1 ring-primary/30',
      )}
    >
      {arrastre?.agarradera}
      <button
        type="button"
        aria-label={cerrado ? `Punto ${codigo} cerrado` : `Cerrar el punto ${codigo}`}
        title={cerrado ? 'Ver qué se hizo' : 'Cerrar el punto con evidencia'}
        onClick={() => onAbrir('evidencia')}
        className="mt-0.5 h-6 w-6 rounded-full hover:bg-muted grid place-items-center"
      >
        <IconoEstado p={p} />
      </button>
      <span className="font-mono text-xs leading-6 text-muted-foreground">{codigo}</span>
      <div className="min-w-0 space-y-1">
        <p className="font-medium leading-snug">{p.titulo}</p>
        {p.descripcion && <p className="whitespace-pre-line text-sm text-muted-foreground">{p.descripcion}</p>}
        {p.notas.length > 0 && (
          <ul className="space-y-1 border-l-2 border-amber-300 pl-3 text-sm">
            {p.notas.map((n) => (
              <li key={n.id}>
                <span className="font-medium">{n.tipo === 'ajuste' ? 'Ajuste pedido' : 'Nota del cliente'}:</span> {n.texto}
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-1 text-xs text-muted-foreground">
          <span className={cn('rounded-full px-2 py-0.5 font-medium', TONO[estado.tono])}>{estado.texto}</span>
          {listoParaCerrar(p) && (
            <button
              type="button"
              aria-label={`Listo para cerrar el punto ${codigo}`}
              title="Todas sus tareas están listas: cuenta qué se hizo y adjunta la evidencia"
              className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800 hover:bg-amber-200 dark:bg-amber-500/15 dark:text-amber-300"
              onClick={() => onAbrir('evidencia')}
            >
              <CircleCheck className="h-3.5 w-3.5" />Listo para cerrar
            </button>
          )}
          {p.responsable_cliente
            ? <span>Cliente</span>
            : p.responsable && <span className="inline-flex items-center gap-1"><User className="h-3.5 w-3.5" />{p.responsable.nombre}</span>}
          {aviso && (
            <span className={cn('inline-flex items-center gap-1', aviso.tono === 'rose' && 'font-medium text-rose-600', aviso.tono === 'amber' && 'font-medium text-amber-600')}>
              <CalendarDays className="h-3.5 w-3.5" />{aviso.texto}
            </span>
          )}
          {!p.visible_cliente && <span>Interno</span>}
          <button type="button" aria-label={`Evidencias del punto ${codigo}`} className={chip} onClick={() => onAbrir('evidencia')}>
            <Link2 className="h-3.5 w-3.5" />Evidencias{p.evidencias.length > 0 && ` · ${p.evidencias.length}`}
          </button>
          {!p.responsable_cliente && (
            <button type="button" aria-label={`Tareas del punto ${codigo}`} className={chip} onClick={() => onAbrir('tareas')}>
              <SquareCheck className="h-3.5 w-3.5" />Tareas{p.tareas.length > 0 && ` · ${listas}/${p.tareas.length}`}
            </button>
          )}
        </div>
      </div>
      <button
        type="button"
        aria-label={`Gestionar el punto ${codigo}`}
        title="Gestionar el punto"
        onClick={() => onAbrir('gestionar')}
        className="h-8 w-8 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground grid place-items-center"
      >
        <Pencil className="h-4 w-4" />
      </button>
    </li>
  );
}
