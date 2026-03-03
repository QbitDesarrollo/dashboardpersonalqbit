import { cn } from '@/lib/utils';

interface ActivityIndicatorProps {
  percent: number;
  showLabel?: boolean;
  size?: 'sm' | 'md';
}

export function ActivityIndicator({ percent, showLabel = false, size = 'sm' }: ActivityIndicatorProps) {
  const color = percent >= 80 ? 'bg-green-500' : percent >= 40 ? 'bg-yellow-500' : percent > 0 ? 'bg-red-500' : 'bg-gray-400';
  const label = percent >= 80 ? 'Activo' : percent >= 40 ? 'Moderado' : percent > 0 ? 'Bajo' : 'Idle';
  const dotSize = size === 'sm' ? 'h-2 w-2' : 'h-3 w-3';

  return (
    <div className="flex items-center gap-1.5">
      <span className={cn('rounded-full', dotSize, color)} title={`${percent}% actividad`} />
      {showLabel && <span className="text-xs text-muted-foreground">{label} ({percent}%)</span>}
    </div>
  );
}
