import { cn } from '@/lib/utils';

export function TimerReadout({ time, running, large = false }: { time: string; running: boolean; large?: boolean }) {
  return (
    <span
      role="timer"
      aria-label="Tiempo trabajado"
      className={cn(
        'shrink-0 whitespace-nowrap font-mono font-medium tabular-nums tracking-tight',
        large ? 'text-xl' : 'text-sm',
        running ? 'text-teal-700 dark:text-primary' : 'text-muted-foreground',
      )}
    >
      {time}
    </span>
  );
}
