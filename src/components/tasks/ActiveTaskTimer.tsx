import { lazy, Suspense, useState } from 'react';
import { useActiveTaskTimers } from '@/hooks/useActiveTaskTimers';
import { useTimerClock } from '@/hooks/useTimerClock';
import { formatTaskTimer, taskElapsedSeconds } from '@/lib/taskTimer';
import { TimerReadout } from './TimerReadout';
import { soportada } from '@/lib/ventanaFlotante';
import { BotonVentanaFlotante } from '@/components/flotante/BotonVentanaFlotante';
import { VentanaFlotante } from '@/components/flotante/VentanaFlotante';

const TaskDetailDialog = lazy(() => import('./TaskDetailDialog').then(module => ({ default: module.TaskDetailDialog })));

export function ActiveTaskTimer() {
  const { timers } = useActiveTaskTimers();
  const task = timers[0];
  const now = useTimerClock(!!task);
  const [openedTaskId, setOpenedTaskId] = useState<string | null>(null);

  const compatible = soportada(window);

  return (
    <>
      {compatible && <VentanaFlotante task={task} />}
      {task && (
        <div className={compatible ? 'order-last flex min-w-0 basis-full items-center pb-2 sm:order-none sm:flex-1 sm:basis-auto sm:pb-0 sm:px-2 lg:px-4' : 'order-last min-w-0 basis-full pb-2 sm:order-none sm:flex-1 sm:basis-auto sm:pb-0 sm:px-2 lg:px-4'}>
          <button
            type="button"
            aria-label={`Abrir tarea activa: ${task.titulo}`}
            title={[task.brand_nombre, task.titulo, 'Abrir tarea'].filter(Boolean).join(' · ')}
            onClick={() => setOpenedTaskId(task.id)}
            className="group mx-auto flex h-9 w-full max-w-xl items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 text-left text-sm transition-colors hover:border-emerald-500/60 hover:bg-emerald-500/20 dark:bg-emerald-500/20 dark:hover:bg-emerald-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {task.brand_nombre && <span className="hidden max-w-28 shrink-0 truncate text-xs text-muted-foreground md:inline">{task.brand_nombre}</span>}
            {task.brand_nombre && <span aria-hidden="true" className="hidden text-border md:inline">/</span>}
            <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground sm:text-sm">{task.titulo}</span>
            <span aria-hidden="true" className="h-3.5 w-px shrink-0 bg-emerald-500/40" />
            <TimerReadout time={formatTaskTimer(taskElapsedSeconds(task.tiempo_trabajado, task.timer_inicio, now))} running />
          </button>
          {compatible && <BotonVentanaFlotante />}
        </div>
      )}
      {openedTaskId && (
        <Suspense fallback={null}>
          <TaskDetailDialog taskId={openedTaskId} open onOpenChange={open => { if (!open) setOpenedTaskId(null); }} />
        </Suspense>
      )}
    </>
  );
}
