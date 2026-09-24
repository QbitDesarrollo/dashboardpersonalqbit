import { MessageSquare, RotateCcw } from 'lucide-react';
import type { Nota } from '@/lib/minutasApi';
import { fechaLocal } from '@/lib/minutas';
import { cn } from '@/lib/utils';

/** What the client said about the point during meetings, oldest first. */
export function NotasPunto({ notas }: { notas: Nota[] }) {
  if (notas.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Lo que dijo el cliente</h2>
      <ul className="space-y-2">
        {notas.map((n) => {
          const ajuste = n.tipo === 'ajuste';
          return (
            <li
              key={n.id}
              className={cn('flex gap-3 rounded-xl border px-4 py-3', ajuste ? 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40' : 'bg-muted/40')}
            >
              {ajuste
                ? <RotateCcw className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                : <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">{ajuste ? 'Ajuste pedido' : 'Nota'} · {fechaLocal(n.created_at)}</p>
                <p className="whitespace-pre-line text-base">{n.texto}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
