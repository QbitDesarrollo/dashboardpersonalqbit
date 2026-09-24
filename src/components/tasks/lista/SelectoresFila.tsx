import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { getPriorityColor, getStatusColor, getStatusLabel } from '@/lib/tareasLista';
import type { Task } from './tipos';

interface PrioridadProps {
  task: Task;
  puedeEditar: boolean;
  onCambiar: (taskId: string, prioridad: Task['prioridad']) => void;
}

/** Priority cell: a select for people who can edit the task, a plain badge otherwise. */
export function SelectorPrioridad({ task, puedeEditar, onCambiar }: PrioridadProps) {
  if (!puedeEditar) {
    return (
      <div className={cn("h-8 flex items-center justify-center rounded-md text-xs font-semibold", getPriorityColor(task.prioridad))}>
        {task.prioridad.toUpperCase()}
      </div>
    );
  }
  return (
    <Select
      value={task.prioridad}
      onValueChange={(value: Task['prioridad']) => onCambiar(task.id, value)}
    >
      <SelectTrigger className={cn("h-8 w-full min-w-[90px] text-xs font-semibold border-0 rounded-md justify-center [&>svg]:ml-1", getPriorityColor(task.prioridad))}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="alta">ALTA</SelectItem>
        <SelectItem value="media">MEDIA</SelectItem>
        <SelectItem value="baja">BAJA</SelectItem>
      </SelectContent>
    </Select>
  );
}

interface EstadoProps {
  task: Task;
  puedeOperar: boolean;
  onCambiar: (taskId: string, estado: Task['estado']) => void;
}

/** Status cell: a select for people who can operate the task, a plain badge otherwise. */
export function SelectorEstado({ task, puedeOperar, onCambiar }: EstadoProps) {
  if (!puedeOperar) {
    return (
      <div className={cn("h-8 flex items-center justify-center rounded-md text-xs font-semibold relative", getStatusColor(task.estado))}>
        {getStatusLabel(task.estado)}
      </div>
    );
  }
  const ajustes = task.ajustes_count || 0;
  return (
    <Select
      value={task.estado}
      onValueChange={(value: Task['estado']) => onCambiar(task.id, value)}
    >
      <SelectTrigger title={ajustes > 0 ? `Volvió a ajustes ${ajustes} ${ajustes === 1 ? 'vez' : 'veces'}` : undefined} className={cn("h-8 w-full min-w-[110px] text-xs font-semibold border-0 rounded-md justify-center [&>svg]:ml-1 relative", getStatusColor(task.estado))}>
        {ajustes > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-orange-600 text-white text-[9px] font-bold flex items-center justify-center border border-background">
            {ajustes}
          </span>
        )}
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="backlog">Pendiente</SelectItem>
        <SelectItem value="en_proceso">En Proceso</SelectItem>
        <SelectItem value="revision_interna">Revisión interna</SelectItem>
        <SelectItem value="revision_cliente">Revisión cliente</SelectItem>
        <SelectItem value="ajustes">Ajustes</SelectItem>
        <SelectItem value="entregado">Entregado</SelectItem>
        <SelectItem value="bloqueado">Bloqueado</SelectItem>
      </SelectContent>
    </Select>
  );
}
