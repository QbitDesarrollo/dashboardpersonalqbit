import { cn } from '@/lib/utils';

interface ActivityIndicatorProps {
  percent: number;
  showLabel?: boolean;
  size?: 'sm' | 'md';
}

export function ActivityIndicator({ percent, showLabel = false, size = 'sm' }: ActivityIndicatorProps) {
  // OJO: este % solo cuenta teclado/mouse DENTRO de la pestaña de Tiusdei.
  // Trabajar en Illustrator/Premiere/VS Code no suma aquí — un % bajo NO
  // significa que la persona no esté trabajando. Por eso la etiqueta es
  // "En Tiusdei" (uso de la plataforma) y no "Idle/Bajo" (que sonaba a juicio).
  const color = percent >= 80 ? 'bg-green-500' : percent >= 40 ? 'bg-blue-400' : 'bg-gray-400';
  const dotSize = size === 'sm' ? 'h-2 w-2' : 'h-3 w-3';
  const explain = `Actividad DENTRO de la pestaña de Tiusdei: ${percent}%. Trabajar en otras aplicaciones (Illustrator, Premiere, VS Code…) no suma aquí — este número NO mide si la persona está trabajando.`;

  return (
    <div className="flex items-center gap-1.5" title={explain}>
      <span className={cn('rounded-full', dotSize, color)} />
      {showLabel && <span className="text-xs text-muted-foreground">En Tiusdei: {percent}%</span>}
    </div>
  );
}
