import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, CheckCircle2, Circle, CircleDashed, FolderKanban, Link2, Loader2, Plus, SquareCheck, User } from 'lucide-react';
import { toast } from 'sonner';
import * as api from '@/lib/apiClient';
import { agregarPunto, editarMinuta, obtenerMinuta, type Minuta, type Punto } from '@/lib/minutasApi';
import { estadoPunto, fechaCorta, hoyEcuador, vencimiento } from '@/lib/minutas';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PuntoDialog } from '@/components/minutas/PuntoDialog';
import { TONO } from '@/components/minutas/tonos';
import { cn } from '@/lib/utils';

function IconoEstado({ p }: { p: Punto }) {
  if (p.estado === 'completado' || p.estado === 'aprobado') return <CheckCircle2 className="h-5 w-5 text-primary" />;
  if (p.estado === 'en_curso') return <CircleDashed className="h-5 w-5 text-blue-600" />;
  return <Circle className={cn('h-5 w-5', p.responsable_cliente ? 'text-amber-500' : 'text-muted-foreground/60')} />;
}

function FilaPunto({ minuta, p, hoy, onAbrir }: { minuta: Minuta; p: Punto; hoy: string; onAbrir: () => void }) {
  const estado = estadoPunto(p);
  const aviso = vencimiento(p.fecha_compromiso, p.estado, hoy);
  const listas = p.tareas.filter((t) => t.estado === 'entregado' || t.estado === 'aprobado').length;
  return (
    <li className="border-t first:border-t-0">
      <button type="button" onClick={onAbrir} className="grid w-full grid-cols-[20px_36px_minmax(0,1fr)] gap-x-3 gap-y-1 px-4 py-3 text-left hover:bg-muted/50">
        <IconoEstado p={p} />
        <span className="font-mono text-xs leading-5 text-muted-foreground">{minuta.numero}.{p.numero}</span>{' '}
        <span className="font-medium leading-snug">{p.titulo}</span>
        {p.descripcion && <span className="col-start-3 truncate text-sm text-muted-foreground">{p.descripcion}</span>}
        <span className="col-start-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className={cn('rounded-full px-2 py-0.5 font-medium', TONO[estado.tono])}>{estado.texto}</span>
          {p.responsable_cliente
            ? <span>Cliente</span>
            : p.responsable && <span className="inline-flex items-center gap-1"><User className="h-3.5 w-3.5" />{p.responsable.nombre}</span>}
          {p.tareas.length > 0 && <span className="inline-flex items-center gap-1"><SquareCheck className="h-3.5 w-3.5" />{listas}/{p.tareas.length} tareas</span>}
          {p.evidencias.length > 0 && <span className="inline-flex items-center gap-1"><Link2 className="h-3.5 w-3.5" />{p.evidencias.length}</span>}
          {aviso && (
            <span className={cn('inline-flex items-center gap-1', aviso.tono === 'rose' && 'font-medium text-rose-600', aviso.tono === 'amber' && 'font-medium text-amber-600')}>
              <CalendarDays className="h-3.5 w-3.5" />{aviso.texto}
            </span>
          )}
          {!p.visible_cliente && <span>Interno</span>}
        </span>
      </button>
    </li>
  );
}

export default function MinutaDetalle() {
  const { id = '' } = useParams();
  const [minuta, setMinuta] = useState<Minuta | null>(null);
  const [error, setError] = useState(false);
  const [personas, setPersonas] = useState<{ id: string; nombre: string }[]>([]);
  const [abiertoId, setAbiertoId] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const hoy = hoyEcuador();

  useEffect(() => {
    obtenerMinuta(id).then(setMinuta).catch(() => setError(true));
    api.getProfiles()
      .then((p: Array<{ id: string; nombre: string; activo?: unknown }>) => setPersonas((Array.isArray(p) ? p : []).filter((x) => x.activo !== 0 && x.activo !== false)))
      .catch(() => {});
  }, [id]);

  const agregar = async () => {
    const titulo = nuevo.trim();
    if (!titulo || !minuta) return;
    setGuardando(true);
    try {
      setMinuta(await agregarPunto(minuta.id, { titulo }));
      setNuevo('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo agregar el punto');
    } finally {
      setGuardando(false);
    }
  };

  const publicar = async () => {
    if (!minuta) return;
    try {
      setMinuta(await editarMinuta(minuta.id, { estado: 'publicada' }));
      toast.success('Minuta publicada');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo publicar');
    }
  };

  if (error) {
    return (
      <div className="max-w-4xl mx-auto p-6 space-y-3 text-center">
        <p className="text-muted-foreground">No encontramos esta minuta.</p>
        <Button variant="outline" asChild><Link to="/minutas">Volver a Minutas</Link></Button>
      </div>
    );
  }
  if (!minuta) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  const { total, cerrados, enCurso } = minuta.progreso;
  const abierto = minuta.items.find((p) => p.id === abiertoId) ?? null;
  // Al asignar puntos aparecen primero el responsable y el equipo de la minuta.
  const primero = new Set([minuta.owner.id, ...minuta.miembros.map((m) => m.id)]);
  const asignables = [...personas.filter((p) => primero.has(p.id)), ...personas.filter((p) => !primero.has(p.id))];

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-5">
      <Link to="/minutas" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />Minutas
      </Link>

      <Card><CardContent className="p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <p className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
              {minuta.brand_nombre} · {minuta.codigo} · {fechaCorta(minuta.fecha)} {minuta.fecha.slice(0, 4)}
            </p>
            <h1 className="text-2xl font-bold leading-tight">{minuta.titulo}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {minuta.estado === 'borrador' && <Badge variant="outline" className="text-muted-foreground">Borrador</Badge>}
            {minuta.estado === 'borrador' && <Button size="sm" onClick={publicar}>Publicar</Button>}
          </div>
        </div>
        <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <div className="flex items-center gap-1.5"><dt className="text-muted-foreground">Proyecto</dt>
            <dd className="inline-flex items-center gap-1">{minuta.project_nombre ? <><FolderKanban className="h-4 w-4 text-muted-foreground" />{minuta.project_nombre}</> : <span className="text-muted-foreground">Sin proyecto</span>}</dd></div>
          <div className="flex items-center gap-1.5"><dt className="text-muted-foreground">Responsable</dt><dd>{minuta.owner.nombre}</dd></div>
          {minuta.miembros.length > 0 && (
            <div className="flex items-center gap-1.5"><dt className="text-muted-foreground">Equipo</dt><dd>{minuta.miembros.map((m) => m.nombre).join(', ')}</dd></div>
          )}
        </dl>
        {minuta.resumen && (
          <div className="rounded-lg bg-muted/60 px-3 py-2 text-sm">
            <p className="mb-1 font-mono text-[10.5px] uppercase tracking-wide text-muted-foreground">Resumen y acuerdos</p>
            <p className="whitespace-pre-line">{minuta.resumen}</p>
          </div>
        )}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <span className="h-full bg-primary" style={{ width: `${total ? (cerrados / total) * 100 : 0}%` }} />
            <span className="h-full bg-blue-500/40" style={{ width: `${total ? (enCurso / total) * 100 : 0}%` }} />
          </span>
          {cerrados} de {total} {total === 1 ? 'punto cerrado' : 'puntos cerrados'}
        </div>
      </CardContent></Card>

      <Card><CardContent className="p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="font-semibold">Puntos</h2>
          <span className="text-xs text-muted-foreground">Toca un punto para ver tareas y evidencia</span>
        </div>
        {minuta.items.length > 0 && (
          <ul>{minuta.items.map((p) => <FilaPunto key={p.id} minuta={minuta} p={p} hoy={hoy} onAbrir={() => setAbiertoId(p.id)} />)}</ul>
        )}
        <label className="flex items-center gap-2 border-t px-4 py-3 text-muted-foreground focus-within:bg-muted/40 focus-within:text-primary">
          {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          <input
            className="flex-1 bg-transparent text-sm text-foreground outline-none"
            placeholder="Agregar un punto y presionar Enter"
            value={nuevo}
            onChange={(e) => setNuevo(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); agregar(); } }}
          />
        </label>
      </CardContent></Card>

      {abierto && (
        <PuntoDialog
          minuta={minuta}
          punto={abierto}
          personas={asignables}
          abierto
          onOpenChange={(v) => { if (!v) setAbiertoId(null); }}
          onActualizada={setMinuta}
        />
      )}
    </div>
  );
}
