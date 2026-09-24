import { Eye } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ResponsableMetrics } from '@/components/tasks/ResponsableMetrics';
import { cn, getInitials } from '@/lib/utils';
import { parseLocalDate } from '@/lib/tareasLista';
import type { Profile, Task } from './tipos';

const estaCerrada = (task: Task) => task.estado === 'entregado' || task.estado === 'aprobado';

interface ResponsablesProps {
  task: Task;
  usuarios: Profile[];
  todasLasTareas: Task[];
}

/** Co-owners (or the legacy single owner) with their workload, plus how many people opened the task. */
export function Responsables({ task, usuarios, todasLasTareas }: ResponsablesProps) {
  const principal = task.responsable_user_id ? usuarios.find((u) => u.id === task.responsable_user_id) : undefined;
  return (
    <>
      {(task.responsables && task.responsables.length > 0) ? (
        <div className="flex flex-col gap-0.5">
          {task.responsables.map((r) => (
            <ResponsableMetrics
              key={r.user_id}
              userId={r.user_id}
              userName={r.nombre || 'Sin nombre'}
              avatarUrl={r.avatar_url}
              allTasks={todasLasTareas}
              compact
            />
          ))}
        </div>
      ) : task.responsable_user_id ? (
        <ResponsableMetrics
          userId={task.responsable_user_id}
          userName={principal?.nombre || 'Sin asignar'}
          avatarUrl={principal?.avatar_url}
          allTasks={todasLasTareas}
          compact
        />
      ) : (
        <span className="text-sm text-muted-foreground">Sin asignar</span>
      )}
      {task.read_count != null && task.read_count > 0 && (
        <span className="text-[10px] text-muted-foreground flex items-center gap-0.5 mt-0.5" title={`${task.read_count} persona(s) han visto esta tarea`}>
          <Eye className="h-3 w-3" />
          {task.read_count} visto{task.read_count > 1 ? 's' : ''}
        </span>
      )}
    </>
  );
}

/** Delivery date, with an urgency badge only when it matters. */
export function Entrega({ task, dias }: { task: Task; dias: number }) {
  return (
    <div className="flex items-center gap-1 text-sm whitespace-nowrap">
      {task.fecha_entrega ? (
        <>
          <span className={cn(
            estaCerrada(task) ? 'text-muted-foreground' :
            dias < 0 ? 'text-destructive font-medium' : 'text-muted-foreground'
          )}>
            {parseLocalDate(task.fecha_entrega).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
          </span>
          {!estaCerrada(task) && dias <= 2 && (
            <span className={cn(
              'text-[10px] font-semibold px-1 py-0.5 rounded leading-none',
              dias < 0 ? 'bg-destructive/15 text-destructive' :
              dias === 0 ? 'bg-warning/20 text-warning' :
              'bg-info/20 text-info'
            )} title={dias < 0 ? `${Math.abs(dias)} día(s) de atraso` : dias === 0 ? 'Vence hoy' : `Vence en ${dias} día(s)`}>
              {dias < 0 ? `+${Math.abs(dias)}d` : dias === 0 ? 'Hoy' : `${dias}d`}
            </span>
          )}
        </>
      ) : <span className="text-muted-foreground italic">Sin fecha</span>}
    </div>
  );
}

/** Optional "Días" column: days left, or "Listo" once delivered. */
export function Dias({ task, dias }: { task: Task; dias: number }) {
  if (estaCerrada(task)) {
    return <span className="text-sm font-medium px-2 py-0.5 rounded bg-success/20 text-success">Listo</span>;
  }
  return (
    <span className={cn(
      "text-sm font-medium px-2 py-0.5 rounded",
      dias < 0 ? "bg-destructive/20 text-destructive" :
      dias === 0 ? "bg-warning/20 text-warning" :
      dias <= 2 ? "bg-info/20 text-info" :
      "text-muted-foreground"
    )}>
      {dias < 0 ? `${Math.abs(dias)}d atrás` : dias === 0 ? 'Hoy' : `${dias}d`}
    </span>
  );
}

/** Who created the task. */
export function Autor({ task }: { task: Task }) {
  return (
    <div className="flex items-center gap-1.5">
      <Avatar className="h-5 w-5">
        {task.created_by_profile?.avatar_url ? (
          <AvatarImage src={task.created_by_profile.avatar_url} alt={task.created_by_profile.nombre} className="object-cover" />
        ) : null}
        <AvatarFallback className="bg-primary/20 text-primary text-[8px] font-semibold">
          {getInitials(task.created_by_profile?.nombre || '?')}
        </AvatarFallback>
      </Avatar>
      <span className="text-xs text-muted-foreground truncate max-w-[100px]" title={task.created_by_profile?.nombre || ''}>
        {task.created_by_profile?.nombre || '—'}
      </span>
    </div>
  );
}
