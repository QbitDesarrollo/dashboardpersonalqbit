import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import * as api from '@/lib/apiClient';
import { CheckSquare, FileBox } from 'lucide-react';

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ tasks: { id: string; titulo_tarea: string; estado: string; brand_nombre?: string }[]; deliverables: { id: string; task_id: string; titulo_tarea: string; brand_nombre?: string; estado: string }[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const search = useCallback(async (q: string) => {
    if (!q || q.length < 2) {
      setResults(null);
      return;
    }
    setLoading(true);
    try {
      const res = await api.globalSearch(q);
      setResults(res);
    } catch {
      setResults({ tasks: [], deliverables: [] });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => search(query), 300);
    return () => clearTimeout(timer);
  }, [query, search]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
        if (!open) {
          setQuery('');
          setResults(null);
        }
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, [open]);

  const handleSelect = (taskId: string) => {
    setOpen(false);
    navigate(`/tareas?task=${taskId}`);
  };

  return (
    <>
      <button
        onClick={() => { setOpen(true); setQuery(''); setResults(null); }}
        className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
        title="Buscar (Ctrl+K)"
      >
        <span className="hidden sm:inline">Buscar</span>
        <kbd className="hidden sm:inline pointer-events-none h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100">
          <span className="text-xs">⌘</span>K
        </kbd>
      </button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          placeholder="Buscar tareas y entregables..."
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          <CommandEmpty>
            {loading ? 'Buscando...' : query.length < 2 ? 'Escribe al menos 2 caracteres' : 'Sin resultados'}
          </CommandEmpty>
          {results && !loading && (
            <>
              {results.tasks.length > 0 && (
                <CommandGroup heading="Tareas">
                  {results.tasks.map((t) => (
                    <CommandItem
                      key={`t-${t.id}`}
                      value={`task-${t.id}`}
                      onSelect={() => handleSelect(t.id)}
                    >
                      <CheckSquare className="mr-2 h-4 w-4" />
                      <span className="truncate">{t.titulo_tarea}</span>
                      {t.brand_nombre && (
                        <span className="ml-2 text-xs text-muted-foreground truncate">{t.brand_nombre}</span>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {results.deliverables.length > 0 && (
                <CommandGroup heading="Entregables">
                  {results.deliverables.map((d) => (
                    <CommandItem
                      key={`d-${d.id}`}
                      value={`deliv-${d.id}`}
                      onSelect={() => handleSelect(d.task_id)}
                    >
                      <FileBox className="mr-2 h-4 w-4" />
                      <span className="truncate">{d.titulo_tarea}</span>
                      {d.brand_nombre && (
                        <span className="ml-2 text-xs text-muted-foreground truncate">{d.brand_nombre}</span>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
