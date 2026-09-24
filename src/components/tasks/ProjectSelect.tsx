import { useEffect, useState } from 'react';
import * as api from '@/lib/apiClient';
import type { Project } from '@/lib/apiClient';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const NONE = '__none__';

/**
 * Selector de Proyecto, filtrado por la marca de la tarea.
 * Si no hay marca elegida, queda deshabilitado (primero se elige la marca).
 */
export function ProjectSelect({
  brandId,
  value,
  onChange,
}: {
  brandId: string | null | undefined;
  value: string | null | undefined;
  onChange: (projectId: string | null) => void;
}) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!brandId) { setProjects([]); return; }
    let cancelled = false;
    setLoading(true);
    api.getProjects({ brand_id: brandId })
      .then((rows) => { if (!cancelled) setProjects(rows); })
      .catch(() => { if (!cancelled) setProjects([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [brandId]);

  return (
    <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? null : v)} disabled={!brandId}>
      <SelectTrigger>
        <SelectValue placeholder={!brandId ? 'Elige primero la marca' : (loading ? 'Cargando…' : 'Sin proyecto')} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}><span className="text-muted-foreground">Sin proyecto</span></SelectItem>
        {projects.map((p) => (
          <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
