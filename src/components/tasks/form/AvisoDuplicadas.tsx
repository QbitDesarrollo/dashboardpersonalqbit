import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import * as api from '@/lib/apiClient';

interface Similar {
  id: string; titulo_tarea: string; estado: string; fecha_entrega: string | null;
  responsable: string | null; departamento: string | null; mesa: string | null; creada_por: string | null; parecido: number;
}

const fmtFecha = (f: string | null) => (f ? `${f.slice(8, 10)}/${f.slice(5, 7)}` : 'sin fecha');

/**
 * Warns, while a new task is being written, that the same brand already has open
 * tasks with a similar title (executive and planner creating the same one).
 * Only informs: it never blocks saving.
 */
export function AvisoDuplicadas({ titulo, brandId }: { titulo: string; brandId: string }) {
  const [similares, setSimilares] = useState<Similar[]>([]);

  useEffect(() => {
    const t = titulo.trim();
    if (!brandId || t.length < 6) { setSimilares([]); return; }
    let vigente = true;
    const id = setTimeout(() => {
      api.getTareasSimilares(t, brandId)
        .then((r) => { if (vigente) setSimilares(r.similares ?? []); })
        .catch(() => { if (vigente) setSimilares([]); });
    }, 500);
    return () => { vigente = false; clearTimeout(id); };
  }, [titulo, brandId]);

  if (!similares.length) return null;
  return (
    <div className="sm:col-span-2 rounded-md border border-amber-500/40 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs space-y-1.5">
      <div className="flex items-center gap-1.5 font-medium text-amber-800 dark:text-amber-300">
        <AlertTriangle className="h-3.5 w-3.5" />
        {similares.length === 1 ? 'Ya existe una tarea abierta parecida en esta marca' : `Ya existen ${similares.length} tareas abiertas parecidas en esta marca`}
      </div>
      <ul className="space-y-1">
        {similares.map((s) => (
          <li key={s.id} className="flex flex-wrap items-baseline gap-x-1.5">
            <a href={`/tareas?task=${s.id}`} target="_blank" rel="noreferrer" className="font-medium text-foreground hover:underline">«{s.titulo_tarea}»</a>
            <span className="text-muted-foreground">
              {[s.responsable ? `de ${s.responsable}` : 'sin responsable', s.departamento, s.mesa, `entrega ${fmtFecha(s.fecha_entrega)}`, s.creada_por ? `creada por ${s.creada_por}` : null].filter(Boolean).join(' · ')}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground">Si es la misma, ábrela y trabaja sobre ella en vez de crear otra. Si es distinta, puedes crearla igual.</p>
    </div>
  );
}
