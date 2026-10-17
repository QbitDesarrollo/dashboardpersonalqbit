import { cn } from '@/lib/utils';

export function TimerReadout({ time, running, large = false }: { time: string; running: boolean; large?: boolean }) {
  return (
    <span
      role="timer"
      aria-label="Tiempo trabajado"
      className={cn(
        'shrink-0 whitespace-nowrap font-mono tabular-nums tracking-tight',
        large ? 'text-xl' : 'text-sm',
        running ? 'font-semibold text-emerald-700 dark:text-emerald-400' : 'font-medium text-muted-foreground',
      )}
    >
      {time}
    </span>
  );
}
