import React, { memo } from 'react';
import { ChevronDown, ChevronRight, Clock, Edit, Eye, Link2, Loader2, Package, Repeat, Star, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { TableCell, TableRow } from '@/components/ui/table';
import { DepartmentBadge } from '@/components/tasks/DepartmentSelect';
import { SubtaskList } from '@/components/tasks/SubtaskList';
import { TaskFiles } from '@/components/tasks/TaskFiles';
import { TaskTimer } from '@/components/tasks/TaskTimer';
import { cn } from '@/lib/utils';
import { getDaysRemaining, getDepartmentColor } from '@/lib/tareasLista';
import { Autor, Dias, Entrega, Responsables } from './CeldasFila';
import { SelectorEstado, SelectorPrioridad } from './SelectoresFila';
import type { ColKey, Profile, Task } from './tipos';

/** Row handlers. The page passes them with a stable identity (see useAccionesEstables). */
export interface AccionesFila {
  alternarExpandir: (taskId: string) => void;
  alternarSeleccion: (taskId: string) => void;
  alternarFavorita: (task: Task) => void;
  abrirDetalle: (task: Task) => void;
  editar: (task: Task) => void;
  eliminar: (taskId: string) => void;
  cambiarEstado: (taskId: string, estado: Task['estado']) => void;
  cambiarPrioridad: (taskId: string, prioridad: Task['prioridad']) => void;
  recargar: () => void;
  abrirSubtarea: (subtaskId: string) => void;
  empezarArrastre: (taskId: string) => void;
  terminarArrastre: () => void;
}

interface Props {
  task: Task;
  columnas: Record<ColKey, boolean>;
  seleccionada: boolean;
  expandida: boolean;
  eliminando: boolean;
  arrastrable: boolean;
  puedeEditar: boolean;
  puedeOperar: boolean;
  puedeEliminar: boolean;
  asignada: boolean;
  usuarios: Profile[];
  todasLasTareas: Task[];
  acciones: AccionesFila;
}

/**
 * One task in the Tasks table (plus its subtasks when expanded).
 * Memoized: it only redraws when its own task or its own flags change.
 */
export const FilaTarea = memo(function FilaTarea({
  task, columnas, seleccionada, expandida, eliminando, arrastrable,
  puedeEditar, puedeOperar, puedeEliminar, asignada, usuarios, todasLasTareas, acciones,
}: Props) {
  const dias = getDaysRemaining(task.fecha_entrega);
  const subtareas = task.subtask_count ?? 0;
  const subtareasListas = task.subtask_done_count ?? 0;
  return (
    <React.Fragment>
      <TableRow
        className={cn('border-border hover:bg-muted/50', arrastrable && 'cursor-grab active:cursor-grabbing')}
        draggable={arrastrable}
        onDragStart={(e) => { acciones.empezarArrastre(task.id); e.dataTransfer.effectAllowed = 'move'; }}
        onDragEnd={() => acciones.terminarArrastre()}
      >
        <TableCell className="w-8 px-0.5">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => acciones.alternarExpandir(task.id)}>
            {expandida ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </Button>
        </TableCell>
        <TableCell className="w-10 px-1 text-center hidden md:table-cell">
          <Checkbox
            checked={seleccionada}
            onCheckedChange={() => acciones.alternarSeleccion(task.id)}
            aria-label="Seleccionar tarea"
            className="h-4 w-4"
          />
        </TableCell>
        <TableCell className="w-7 px-0.5 hidden md:table-cell">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-amber-500 hover:text-amber-600 hover:bg-amber-500/10"
            onClick={() => acciones.alternarFavorita(task)}
          >
            <Star className={cn("h-4 w-4", task.is_favorite && "fill-current")} />
          </Button>
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-1.5">
            {!task.is_read && (
              <span className="h-2 w-2 rounded-full bg-primary shrink-0" title="No leída" />
            )}
            <span
              className="font-medium text-foreground cursor-pointer hover:text-primary hover:underline"
              onClick={() => acciones.abrirDetalle(task)}
            >
              {task.titulo_tarea}
            </span>
            {subtareas > 0 && (
              <button
                type="button"
                onClick={() => acciones.alternarExpandir(task.id)}
                className={cn(
                  "inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border shrink-0 hover:opacity-80 transition-opacity",
                  subtareasListas === subtareas
                    ? "bg-green-100 text-green-700 border-green-200"
                    : subtareasListas > 0
                    ? "bg-blue-100 text-blue-700 border-blue-200"
                    : "bg-muted text-muted-foreground border-border"
                )}
                title={`${subtareasListas} de ${task.subtask_count} subtareas completadas. Click para expandir.`}
              >
                <span>📋</span>
                <span>{subtareasListas}/{task.subtask_count}</span>
              </button>
            )}
            {task.recurrence_type && task.recurrence_type !== 'none' && (
              <Repeat className="h-3.5 w-3.5 text-blue-500 shrink-0" title="Tarea recurrente" />
            )}
            {task.estimated_hours != null && task.estimated_hours > 0 && (
              <span className="text-[10px] text-muted-foreground flex items-center gap-0.5 shrink-0" title="Horas estimadas">
                <Clock className="h-3 w-3" />{task.estimated_hours}h
              </span>
            )}
          </div>
        </TableCell>
        {columnas.marca && <TableCell className="hidden md:table-cell"><span className="text-sm block max-w-[80px] truncate" title={task.brands?.nombre || ''}>{task.brands?.nombre || '-'}</span></TableCell>}
        {columnas.mesa && <TableCell className="hidden md:table-cell"><span className="text-sm block max-w-[80px] truncate" title={task.desks?.nombre || ''}>{task.desks?.nombre || '-'}</span></TableCell>}
        {columnas.depto && (
          <TableCell className="hidden md:table-cell">
            {task.department_nombre ? (
              <DepartmentBadge nombre={task.department_nombre} color={task.department_color} />
            ) : task.departamento ? (
              <Badge className={cn("text-[10px] font-semibold uppercase", getDepartmentColor(task.departamento))}>
                {task.departamento}
              </Badge>
            ) : (
              <span className="text-xs text-muted-foreground">—</span>
            )}
          </TableCell>
        )}
        {columnas.responsable && (
          <TableCell className="hidden md:table-cell">
            <Responsables task={task} usuarios={usuarios} todasLasTareas={todasLasTareas} />
          </TableCell>
        )}
        {columnas.entregables && (
          <TableCell className="text-center hidden md:table-cell">
            <div className="flex items-center justify-center gap-1">
              <Package className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{task.cantidad_entregables}</span>
            </div>
          </TableCell>
        )}
        {columnas.timer && (
          <TableCell>
            <TaskTimer
              taskId={task.id}
              initialTime={task.tiempo_trabajado}
              isActive={task.timer_activo}
              startTime={task.timer_inicio}
              canEdit={puedeOperar}
              compact
              warnEnabled={asignada}
              taskTitle={task.titulo_tarea}
              onUpdate={acciones.recargar}
            />
          </TableCell>
        )}
        {columnas.archivos && (
          <TableCell className="hidden md:table-cell">
            <TaskFiles
              taskId={task.id}
              canEdit={puedeEditar}
              compact
              conteoInicial={task.files_count != null ? Number(task.files_count) : undefined}
            />
          </TableCell>
        )}
        {columnas.tipo && (
          <TableCell className="px-1 hidden md:table-cell">
            <span className="text-xs text-muted-foreground">{task.task_type?.nombre || '—'}</span>
          </TableCell>
        )}
        {columnas.prioridad && (
          <TableCell className="px-1 hidden md:table-cell">
            <SelectorPrioridad task={task} puedeEditar={puedeEditar} onCambiar={acciones.cambiarPrioridad} />
          </TableCell>
        )}
        {columnas.estado && (
          <TableCell className="px-1">
            <SelectorEstado task={task} puedeOperar={puedeOperar} onCambiar={acciones.cambiarEstado} />
          </TableCell>
        )}
        {columnas.entrega && <TableCell className="hidden md:table-cell"><Entrega task={task} dias={dias} /></TableCell>}
        {columnas.dias && <TableCell className="hidden md:table-cell"><Dias task={task} dias={dias} /></TableCell>}
        {columnas.enlace && (
          <TableCell className="hidden md:table-cell">
            {task.enlaces && task.enlaces.length > 0 ? (
              <a
                href={task.enlaces[0]}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline inline-flex items-center gap-0.5"
                onClick={(e) => e.stopPropagation()}
              >
                <Link2 className="h-3.5 w-3.5" />
              </a>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </TableCell>
        )}
        {columnas.autor && <TableCell className="hidden md:table-cell"><Autor task={task} /></TableCell>}
        {columnas.creado && (
          <TableCell className="hidden md:table-cell">
            <span className="text-xs text-muted-foreground">
              {task.created_at ? new Date(task.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'}
            </span>
          </TableCell>
        )}
        <TableCell className="hidden md:table-cell px-1">
          <div className="flex items-center gap-0.5">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => acciones.abrirDetalle(task)}>
              <Eye className="h-4 w-4" />
            </Button>
            {puedeEditar && (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => acciones.editar(task)}>
                <Edit className="h-4 w-4" />
              </Button>
            )}
            {puedeEliminar && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive"
                onClick={() => acciones.eliminar(task.id)}
                disabled={eliminando}
              >
                {eliminando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </Button>
            )}
          </div>
        </TableCell>
      </TableRow>
      {expandida && (
        <TableRow className="bg-muted/30 border-l-4 border-l-primary/50">
          <TableCell colSpan={30} className="py-3 px-4">
            <div className="pl-6">
              <SubtaskList
                taskId={task.id}
                deskId={task.desk_id || undefined}
                onUpdate={acciones.recargar}
                onOpenSubtask={acciones.abrirSubtarea}
              />
            </div>
          </TableCell>
        </TableRow>
      )}
    </React.Fragment>
  );
});
