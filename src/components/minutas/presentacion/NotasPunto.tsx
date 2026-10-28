import { MessageSquare, RotateCcw } from 'lucide-react';
import type { NotaVista } from '@/lib/minutasApi';
import { fechaLocal } from '@/lib/minutas';
import { cn } from '@/lib/utils';

/** What the client said about the point during meetings, oldest first. */
export function NotasPunto({ notas, titulo = 'Lo que dijo el cliente' }: { notas: (NotaVista & { via?: string })[]; titulo?: string }) {
  const compartidas = notas.filter((n) => n.via !== 'mcp');
  if (compartidas.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{titulo}</h2>
      <ul className="space-y-2">
        {compartidas.map((n) => {
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
                <p className="text-xs font-medium text-muted-foreground">{ajuste ? 'Ajuste pedido' : 'Nota'}{n.autor_nombre ? ` de ${n.autor_nombre}` : ''} · {fechaLocal(n.created_at)}</p>
                <p className="whitespace-pre-line text-base">{n.texto}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
