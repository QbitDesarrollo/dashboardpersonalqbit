import { Sparkles } from 'lucide-react';
import type { EstadoIa } from '@/lib/minutasIaApi';
import { cn } from '@/lib/utils';

/** How many AI minutas the person has left today. Hidden for people whose desk cannot use it. */
export function CupoIa({ estado, className }: { estado: EstadoIa; className?: string }) {
  if (!estado.permitido) return null;
  const quedan = Math.max(estado.limite - estado.usados, 0);
  const texto = quedan === 0
    ? `Ya usaste tus ${estado.limite} minutas con IA de hoy`
    : `Te ${quedan === 1 ? 'queda' : 'quedan'} ${quedan} de ${estado.limite} minutas con IA hoy`;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium',
        quedan === 0 ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300' : 'border-primary/30 bg-primary/5 text-primary',
        className,
      )}
    >
      <Sparkles className="h-3.5 w-3.5" />{texto}
    </span>
  );
}
