import { useRef, useState } from 'react';
import { Play, Pause, RotateCcw, Timer, AlertTriangle } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { useTaskTimer } from '@/hooks/useTaskTimer';
import { cn } from '@/lib/utils';
import * as api from '@/lib/apiClient';
import { notifyTaskTimerChanged } from '@/lib/taskTimer';
import { TimerReadout } from './TimerReadout';

interface TaskTimerProps {
  taskId: string;
  initialTime: number;
  isActive: boolean;
  startTime: string | null;
  canEdit: boolean;
  compact?: boolean;
  estimatedHours?: number | null;
  /** true si la tarea es del usuario actual: habilita los avisos de timer largo/estimado */
  warnEnabled?: boolean;
  taskTitle?: string;
  onUpdate?: () => void;
}

export function TaskTimer({
  taskId,
  initialTime,
  isActive,
  startTime,
  canEdit,
  compact = false,
  estimatedHours,
  warnEnabled = false,
  taskTitle,
  onUpdate
}: TaskTimerProps) {
  const [confirmReset, setConfirmReset] = useState(false);
  const [pending, setPending] = useState(false);
  const actionInProgress = useRef(false);
  const runAction = async (action: () => Promise<void>) => {
    if (actionInProgress.current) return;
    actionInProgress.current = true;
    setPending(true);
    try { await action(); } finally {
      actionInProgress.current = false;
      setPending(false);
    }
  };
  const { formattedTime, isRunning, startTimer, stopTimer, resetTimer } = useTaskTimer({
    taskId,
    initialTime,
    isActive,
    startTime,
    // La alerta de estimado solo en la vista de detalle (no en la fila compacta) para no duplicar.
    estimatedHours: compact ? undefined : estimatedHours,
    warnEnabled,
    taskTitle,
  });
  const handleStart = async () => {
    if (!(await startTimer())) return;
    // Also start Time Doctor session for screenshots & activity tracking
    try {
      const { session: active } = await api.getActiveTimeSession();
      if (active && active.task_id !== taskId) {
        await api.stopTimeSession(active.id);
      }
      if (!active || active.task_id !== taskId) {
        await api.startTimeSession(taskId);
      }
    } catch {
      // Time session is optional, don't block timer
    }
    notifyTaskTimerChanged();
    onUpdate?.();
  };

  const handleStop = async () => {
    if (!(await stopTimer())) return;
    // Also stop Time Doctor session
    try {
      const { session: active } = await api.getActiveTimeSession();
      if (active && active.task_id === taskId) {
        await api.stopTimeSession(active.id);
      }
    } catch {
      // Time session is optional
    }
    notifyTaskTimerChanged();
    onUpdate?.();
  };

  const handleReset = async () => {
    if (!(await resetTimer())) return;
    try {
      const { session: active } = await api.getActiveTimeSession();
      if (active && active.task_id === taskId) {
        await api.stopTimeSession(active.id);
      }
    } catch {}
    notifyTaskTimerChanged();
    onUpdate?.();
  };

  if (compact) {
    return (
      <div className="flex items-center gap-1">
        <div className={cn(
          "flex items-center gap-1.5 px-2 py-1 rounded-md border",
          isRunning
            ? "border-emerald-500/40 bg-emerald-500/20 text-emerald-700 dark:text-emerald-400"
            : "border-transparent bg-muted text-muted-foreground"
        )}>
          <Timer className="h-3 w-3" />
          <TimerReadout time={formattedTime} running={isRunning} />
        </div>
        {canEdit && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label={isRunning ? 'Pausar timer' : 'Iniciar timer'}
            disabled={pending}
            onClick={() => { void runAction(isRunning ? handleStop : handleStart); }}
          >
            {isRunning ? (
              <Pause className="h-3.5 w-3.5" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className={cn(
      "flex items-center gap-3 p-3 rounded-lg border",
      isRunning ? "border-emerald-500/40 bg-emerald-500/20" : "border-transparent bg-muted/50",
    )}>
      <div className="flex items-center gap-2">
        <Timer className={cn(
          "h-5 w-5",
          isRunning ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"
        )} />
        <TimerReadout time={formattedTime} running={isRunning} large />
      </div>

      {canEdit && (
        <div className="flex items-center gap-1 ml-auto">
          {isRunning ? (
            <Button
              variant="secondary"
              size="sm"
              disabled={pending}
              onClick={() => { void runAction(handleStop); }}
              className="gap-1"
            >
              <Pause className="h-4 w-4" />
              Pausar
            </Button>
          ) : (
            <Button
              variant="default"
              size="sm"
              disabled={pending}
              onClick={() => { void runAction(handleStart); }}
              className="gap-1"
            >
              <Play className="h-4 w-4" />
              Iniciar
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => setConfirmReset(true)}
            className="gap-1 text-muted-foreground hover:text-destructive"
            title="Reiniciar el timer (borra el tiempo acumulado)"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>

          {/* Confirmacion: el reinicio BORRA el acumulado — se encontraron tareas
              con horas perdidas por clics accidentales en este boton. */}
          <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                  ¿Reiniciar el timer a cero?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  Esto <strong>borra el tiempo acumulado de la tarea ({formattedTime})</strong> y no se puede deshacer.
                  Si solo quieres detener el timer, usa <strong>Pausar</strong>.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  disabled={pending}
                  onClick={() => { setConfirmReset(false); void runAction(handleReset); }}
                >
                  Sí, borrar el tiempo
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  );
}
