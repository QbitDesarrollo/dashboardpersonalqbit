import { Play, Pause, RotateCcw, Timer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTaskTimer } from '@/hooks/useTaskTimer';
import { cn } from '@/lib/utils';
import * as api from '@/lib/apiClient';

interface TaskTimerProps {
  taskId: string;
  initialTime: number;
  isActive: boolean;
  startTime: string | null;
  canEdit: boolean;
  compact?: boolean;
  onUpdate?: () => void;
}

export function TaskTimer({
  taskId,
  initialTime,
  isActive,
  startTime,
  canEdit,
  compact = false,
  onUpdate
}: TaskTimerProps) {
  const { formattedTime, isRunning, startTimer, stopTimer, resetTimer } = useTaskTimer({
    taskId,
    initialTime,
    isActive,
    startTime,
  });
  const handleStart = async () => {
    await startTimer();
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
    onUpdate?.();
  };

  const handleStop = async () => {
    await stopTimer();
    // Also stop Time Doctor session
    try {
      const { session: active } = await api.getActiveTimeSession();
      if (active && active.task_id === taskId) {
        await api.stopTimeSession(active.id);
      }
    } catch {
      // Time session is optional
    }
    onUpdate?.();
  };

  const handleReset = async () => {
    await resetTimer();
    try {
      const { session: active } = await api.getActiveTimeSession();
      if (active && active.task_id === taskId) {
        await api.stopTimeSession(active.id);
      }
    } catch {}
    onUpdate?.();
  };

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <div className={cn(
          "flex items-center gap-1 font-mono text-sm px-2 py-1 rounded",
          isRunning
            ? "bg-primary/20 text-primary animate-pulse"
            : "bg-muted text-muted-foreground"
        )}>
          <Timer className="h-3 w-3" />
          {formattedTime}
        </div>
        {canEdit && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={isRunning ? handleStop : handleStart}
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
    <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
      <div className="flex items-center gap-2">
        <Timer className={cn(
          "h-5 w-5",
          isRunning ? "text-primary animate-pulse" : "text-muted-foreground"
        )} />
        <span className={cn(
          "font-mono text-xl font-semibold",
          isRunning ? "text-primary" : "text-foreground"
        )}>
          {formattedTime}
        </span>
      </div>

      {canEdit && (
        <div className="flex items-center gap-1 ml-auto">
          {isRunning ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleStop}
              className="gap-1"
            >
              <Pause className="h-4 w-4" />
              Pausar
            </Button>
          ) : (
            <Button
              variant="default"
              size="sm"
              onClick={handleStart}
              className="gap-1"
            >
              <Play className="h-4 w-4" />
              Iniciar
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="gap-1 text-muted-foreground hover:text-destructive"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
