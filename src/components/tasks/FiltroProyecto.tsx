import { useEffect, useState } from 'react';
import * as api from '@/lib/apiClient';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Props {
  /** Brand chosen in the filters ('all' when none): projects belong to a brand. */
  brandId: string;
  value: string;
  onChange: (projectId: string) => void;
}

/** Project filter of the Tasks page. Enabled once a brand is chosen; "Todos" otherwise. */
export function FiltroProyecto({ brandId, value, onChange }: Props) {
  const [proyectos, setProyectos] = useState<{ id: string; nombre: string }[]>([]);
  const conMarca = brandId !== 'all' && !!brandId;

  useEffect(() => {
    if (!conMarca) { setProyectos([]); return; }
    let vigente = true;
    api.getProjects({ brand_id: brandId })
      .then((p) => { if (vigente) setProyectos(Array.isArray(p) ? p : []); })
      .catch(() => { if (vigente) setProyectos([]); });
    return () => { vigente = false; };
  }, [brandId, conMarca]);

  return (
    <div className="space-y-1.5 sm:space-y-0 w-full sm:w-auto">
      <Label className="text-xs text-muted-foreground block sm:hidden">Proyecto</Label>
      <Select value={conMarca ? value : 'all'} onValueChange={onChange} disabled={!conMarca}>
        <SelectTrigger
          aria-label="Proyecto"
          title={conMarca ? undefined : 'Elige una marca para filtrar por proyecto'}
          className="w-full sm:w-auto sm:min-w-[120px] h-8 text-xs gap-1"
        >
          <span className="hidden sm:inline text-muted-foreground">Proyecto:</span><SelectValue placeholder="Todos" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos</SelectItem>
          {proyectos.map((p) => <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
