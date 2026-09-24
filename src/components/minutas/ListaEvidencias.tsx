import { ExternalLink, HardDrive, Link2, X } from 'lucide-react';
import type { Evidencia } from '@/lib/minutasApi';

interface Props {
  evidencias: Evidencia[];
  /** Si se pasa, cada evidencia muestra un botón para quitarla. */
  onQuitar?: (evidencia: Evidencia) => void;
}

export function ListaEvidencias({ evidencias, onQuitar }: Props) {
  if (evidencias.length === 0) return null;
  return (
    <ul className="space-y-1.5">
      {evidencias.map((ev) => (
        <li key={ev.id} className="flex items-center gap-2 rounded-lg border px-3 py-2">
          {ev.tipo === 'imagen' ? (
            <a href={ev.url} target="_blank" rel="noreferrer" className="shrink-0">
              <img src={ev.url} alt={ev.nombre} className="h-10 w-14 rounded object-cover" />
            </a>
          ) : ev.tipo === 'drive' ? <HardDrive className="h-4 w-4 shrink-0 text-muted-foreground" /> : <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />}
          <a href={ev.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-sm font-medium hover:underline">
            {ev.nombre}<ExternalLink className="ml-1 inline h-3 w-3 text-muted-foreground" />
          </a>
          {onQuitar && (
            <button
              type="button"
              aria-label={`Quitar ${ev.nombre}`}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() => onQuitar(ev)}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
