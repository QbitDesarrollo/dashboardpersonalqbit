import { useState } from 'react';
import { Search, X } from 'lucide-react';
import { getInitials } from '@/lib/utils';

interface Props {
  personas: { id: string; nombre: string }[];
  seleccionados: string[];
  onChange: (ids: string[]) => void;
  /** The minuta owner is always part of it, so it is not offered. */
  excluir?: string;
}

const normalizar = (texto: string) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Team of a minuta: chosen people on top, then a searchable, scrollable list. */
export function SelectorEquipo({ personas, seleccionados, onChange, excluir }: Props) {
  const [busqueda, setBusqueda] = useState('');
  const disponibles = personas.filter((p) => p.id !== excluir);
  const elegidos = disponibles.filter((p) => seleccionados.includes(p.id));
  const texto = normalizar(busqueda);
  const visibles = texto ? disponibles.filter((p) => normalizar(p.nombre).includes(texto)) : disponibles;

  const alternar = (id: string) =>
    onChange(seleccionados.includes(id) ? seleccionados.filter((x) => x !== id) : [...seleccionados, id]);

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium">Equipo</span>
        {elegidos.length > 0 && <span className="text-xs text-muted-foreground">{elegidos.length} {elegidos.length === 1 ? 'persona' : 'personas'}</span>}
      </div>

      {elegidos.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nadie elegido todavía.</p>
      ) : (
        <ul aria-label="Equipo elegido" className="flex flex-wrap gap-1.5">
          {elegidos.map((p) => (
            <li key={p.id} className="inline-flex items-center gap-1 rounded-full bg-primary/10 py-0.5 pl-2.5 pr-1 text-xs font-medium text-primary">
              {p.nombre}
              <button type="button" aria-label={`Quitar a ${p.nombre}`} className="rounded-full p-0.5 hover:bg-primary/20" onClick={() => alternar(p.id)}>
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="overflow-hidden rounded-lg border bg-background">
        <div className="relative border-b">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            aria-label="Buscar persona"
            placeholder="Buscar persona…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full bg-transparent py-2 pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        {visibles.length === 0 ? (
          <p className="px-3 py-4 text-center text-sm text-muted-foreground">Nadie coincide con “{busqueda.trim()}”.</p>
        ) : (
          <ul className="max-h-48 overflow-y-auto p-1">
            {visibles.map((p) => (
              <li key={p.id}>
                <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                  <input type="checkbox" className="h-4 w-4 accent-primary" checked={seleccionados.includes(p.id)} onChange={() => alternar(p.id)} />
                  <span aria-hidden className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
                    {getInitials(p.nombre)}
                  </span>
                  {p.nombre}
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
