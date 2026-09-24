import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, NotebookPen, Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import * as api from '@/lib/apiClient';
import { listarMinutas, type MinutaResumen } from '@/lib/minutasApi';
import { fechaCorta } from '@/lib/minutas';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { SELECT } from '@/components/minutas/EditorPuntos';
import { CupoIa } from '@/components/minutas/CupoIa';
import { useEstadoIa } from '@/components/minutas/useEstadoIa';
import { cn } from '@/lib/utils';

interface Opcion { id: string; nombre: string }

/** "Rediseño del sitio web Dinatek" dentro de Dinatek se lee mejor como "Rediseño del sitio web". */
function proyectoCorto(proyecto: string, marca: string): string {
  const sufijo = ` ${marca}`;
  return proyecto.endsWith(sufijo) ? proyecto.slice(0, -sufijo.length) : proyecto;
}

function Fila({ m }: { m: MinutaResumen }) {
  const { total, cerrados, enCurso } = m.progreso;
  const pct = total ? Math.round((cerrados / total) * 100) : 0;
  const pctCurso = total ? Math.round((enCurso / total) * 100) : 0;
  const detalle = [m.brand_nombre, m.project_nombre && proyectoCorto(m.project_nombre, m.brand_nombre), `${fechaCorta(m.fecha)} ${m.fecha.slice(0, 4)}`]
    .filter(Boolean).join(' · ');
  return (
    <Link
      to={`/minutas/${m.id}`}
      className="grid grid-cols-[56px_minmax(0,1fr)] sm:grid-cols-[56px_minmax(0,1fr)_170px_100px] items-center gap-x-4 gap-y-2 rounded-xl border bg-card px-4 py-3 hover:border-primary/40 transition-colors"
    >
      <span className="font-mono text-sm font-semibold text-primary">{m.codigo}</span>
      <span className="min-w-0">
        <span className="block font-semibold leading-snug">{m.titulo}</span>
        <span className="block truncate text-xs text-muted-foreground">{detalle}</span>
      </span>
      <span className="col-start-2 sm:col-start-auto space-y-1">
        <span className="flex h-1.5 overflow-hidden rounded-full bg-muted">
          <span className="h-full bg-primary" style={{ width: `${pct}%` }} />
          <span className="h-full bg-blue-500/40" style={{ width: `${pctCurso}%` }} />
        </span>
        <span className="block text-[11px] text-muted-foreground">{cerrados} de {total} {total === 1 ? 'punto cerrado' : 'puntos cerrados'}</span>
      </span>
      <span className="col-start-2 sm:col-start-auto sm:justify-self-end">
        <Badge variant="outline" className={cn('text-[10px]', m.estado === 'borrador' ? 'text-muted-foreground' : 'border-primary/30 text-primary')}>
          {m.estado === 'borrador' ? 'Borrador' : 'Publicada'}
        </Badge>
      </span>
    </Link>
  );
}

export default function Minutas() {
  const [minutas, setMinutas] = useState<MinutaResumen[]>([]);
  const { estado: ia } = useEstadoIa();
  const [cargando, setCargando] = useState(true);
  const [marcas, setMarcas] = useState<Opcion[]>([]);
  const [proyectos, setProyectos] = useState<Opcion[]>([]);
  const [brandId, setBrandId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [q, setQ] = useState('');

  useEffect(() => {
    api.getBrands()
      .then((b: Array<Opcion & { activo?: unknown }>) => setMarcas((Array.isArray(b) ? b : []).filter((x) => x.activo !== 0 && x.activo !== false)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setProjectId('');
    if (!brandId) { setProyectos([]); return; }
    api.getProjects({ brand_id: brandId }).then(setProyectos).catch(() => setProyectos([]));
  }, [brandId]);

  useEffect(() => {
    let vigente = true;
    const t = setTimeout(() => {
      listarMinutas({ brand_id: brandId, project_id: projectId, q: q.trim() })
        .then((r) => { if (vigente) setMinutas(r); })
        .catch(() => toast.error('Error al cargar minutas'))
        .finally(() => { if (vigente) setCargando(false); });
    }, q ? 250 : 0);
    return () => { vigente = false; clearTimeout(t); };
  }, [brandId, projectId, q]);

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center"><NotebookPen className="h-5 w-5 text-primary" /></div>
        <div className="flex-1 min-w-[180px]">
          <h1 className="text-2xl font-bold">Minutas</h1>
          <p className="text-sm text-muted-foreground">Lo que se habló con cada cliente, punto por punto.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {ia && <CupoIa estado={ia} />}
          <Button asChild><Link to="/minutas/nueva"><Plus className="h-4 w-4" />Nueva minuta</Link></Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <select aria-label="Marca" className={cn(SELECT, 'w-full sm:w-48')} value={brandId} onChange={(e) => setBrandId(e.target.value)}>
          <option value="">Todas las marcas</option>
          {marcas.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
        </select>
        <select aria-label="Proyecto" className={cn(SELECT, 'w-full sm:w-60')} value={projectId} onChange={(e) => setProjectId(e.target.value)} disabled={!brandId}>
          <option value="">{brandId ? 'Todos los proyectos' : 'Elige una marca para filtrar por proyecto'}</option>
          {proyectos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="Buscar" className="pl-9" placeholder="Buscar en títulos y puntos" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {cargando ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : minutas.length === 0 ? (
        <Card><CardContent className="py-14 text-center text-sm text-muted-foreground">
          {brandId || q ? 'No hay minutas con esos filtros.' : 'Todavía no hay minutas. Crea la primera después de tu próxima reunión.'}
        </CardContent></Card>
      ) : (
        <div className="space-y-2">{minutas.map((m) => <Fila key={m.id} m={m} />)}</div>
      )}
    </div>
  );
}
