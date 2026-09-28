import { ExternalLink, HardDrive, Link2 } from 'lucide-react';
import type { EvidenciaVista } from '@/lib/minutasApi';
import { cn } from '@/lib/utils';

function origen(ev: EvidenciaVista): string {
  if (ev.tipo === 'drive') return 'Google Drive';
  try { return new URL(ev.url).hostname.replace(/^www\./, ''); } catch { return 'Enlace'; }
}

/** Evidence at presentation size: screenshots large, links and Drive files as cards. */
export function EvidenciasPresentadas({ evidencias }: { evidencias: EvidenciaVista[] }) {
  const imagenes = evidencias.filter((e) => e.tipo === 'imagen');
  const enlaces = evidencias.filter((e) => e.tipo !== 'imagen');
  if (evidencias.length === 0) return null;
  return (
    <div className="space-y-3">
      {imagenes.length > 0 && (
        <div className={cn('grid gap-3', imagenes.length > 1 && 'sm:grid-cols-2')}>
          {imagenes.map((ev) => (
            <a key={ev.id} href={ev.url} target="_blank" rel="noreferrer" className="group block overflow-hidden rounded-xl border bg-card shadow-sm">
              <img src={ev.url} alt={ev.nombre} className="max-h-[440px] w-full bg-muted/40 object-contain transition-transform duration-300 group-hover:scale-[1.01]" />
            </a>
          ))}
        </div>
      )}
      {enlaces.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {enlaces.map((ev) => (
            <a
              key={ev.id}
              href={ev.url}
              target="_blank"
              rel="noreferrer"
              className="group flex items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm transition-colors hover:border-primary/40"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                {ev.tipo === 'drive' ? <HardDrive className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{ev.nombre}</span>
                <span className="block truncate text-xs text-muted-foreground">{origen(ev)}</span>
              </span>
              <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
