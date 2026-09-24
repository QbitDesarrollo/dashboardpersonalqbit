import { CheckCircle2, Circle, CircleDashed } from 'lucide-react';
import type { EstadoPunto } from '@/lib/minutas';
import { cn } from '@/lib/utils';

/** Status circle of a point: closed, in progress, waiting on the client or pending. */
export function IconoEstado({ p, className = 'h-5 w-5' }: { p: { estado: EstadoPunto; responsable_cliente: boolean }; className?: string }) {
  if (p.estado === 'completado' || p.estado === 'aprobado') return <CheckCircle2 className={cn(className, 'text-primary')} />;
  if (p.estado === 'en_curso') return <CircleDashed className={cn(className, 'text-blue-600')} />;
  return <Circle className={cn(className, p.responsable_cliente ? 'text-amber-500' : 'text-muted-foreground/60')} />;
}
