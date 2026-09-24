import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, CheckCircle2, Circle, CircleDashed, FileDown, FolderKanban, Link2, Loader2, Pencil, Plus, Presentation, SquareCheck, User } from 'lucide-react';
import { toast } from 'sonner';
import * as api from '@/lib/apiClient';
import { agregarPunto, borrarMinuta, editarMinuta, obtenerMinuta, type Minuta, type Punto } from '@/lib/minutasApi';
import { estadoPunto, fechaCorta, hoyEcuador, vencimiento } from '@/lib/minutas';
import { exportarMinutaPdf } from '@/lib/minutaPdf';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { SELECT } from '@/components/minutas/EditorPuntos';
import { SelectorEquipo } from '@/components/minutas/SelectorEquipo';
import { PuntoDialog, type VistaPunto } from '@/components/minutas/PuntoDialog';
import { TONO } from '@/components/minutas/tonos';
import { cn } from '@/lib/utils';

function IconoEstado({ p }: { p: Punto }) {
  if (p.estado === 'completado' || p.estado === 'aprobado') return <CheckCircle2 className="h-5 w-5 text-primary" />;
  if (p.estado === 'en_curso') return <CircleDashed className="h-5 w-5 text-blue-600" />;
  return <Circle className={cn('h-5 w-5', p.responsable_cliente ? 'text-amber-500' : 'text-muted-foreground/60')} />;
}

function FilaPunto({ minuta, p, hoy, onAbrir }: { minuta: Minuta; p: Punto; hoy: string; onAbrir: (vista: VistaPunto) => void }) {
  const codigo = `${minuta.numero}.${p.numero}`;
  const estado = estadoPunto(p);
  const aviso = vencimiento(p.fecha_compromiso, p.estado, hoy);
  const cerrado = p.estado === 'completado' || p.estado === 'aprobado';
  const listas = p.tareas.filter((t) => t.estado === 'entregado' || t.estado === 'aprobado').length;
  const chip = 'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-medium text-foreground/80 hover:bg-muted';
  return (
    <li aria-label={`Punto ${codigo}`} className="grid grid-cols-[24px_36px_minmax(0,1fr)_32px] gap-x-3 border-t px-4 py-3.5 first:border-t-0">
      <button
        type="button"
        aria-label={cerrado ? `Punto ${codigo} cerrado` : `Cerrar el punto ${codigo}`}
        title={cerrado ? 'Ver qué se hizo' : 'Cerrar el punto con evidencia'}
        onClick={() => onAbrir('evidencia')}
        className="mt-0.5 h-6 w-6 rounded-full hover:bg-muted grid place-items-center"
      >
        <IconoEstado p={p} />
      </button>
      <span className="font-mono text-xs leading-6 text-muted-foreground">{codigo}</span>
      <div className="min-w-0 space-y-1">
        <p className="font-medium leading-snug">{p.titulo}</p>
        {p.descripcion && <p className="whitespace-pre-line text-sm text-muted-foreground">{p.descripcion}</p>}
        {p.notas.length > 0 && (
          <ul className="space-y-1 border-l-2 border-amber-300 pl-3 text-sm">
            {p.notas.map((n) => (
              <li key={n.id}>
                <span className="font-medium">{n.tipo === 'ajuste' ? 'Ajuste pedido' : 'Nota del cliente'}:</span> {n.texto}
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-1 text-xs text-muted-foreground">
          <span className={cn('rounded-full px-2 py-0.5 font-medium', TONO[estado.tono])}>{estado.texto}</span>
          {p.responsable_cliente
            ? <span>Cliente</span>
            : p.responsable && <span className="inline-flex items-center gap-1"><User className="h-3.5 w-3.5" />{p.responsable.nombre}</span>}
          {aviso && (
            <span className={cn('inline-flex items-center gap-1', aviso.tono === 'rose' && 'font-medium text-rose-600', aviso.tono === 'amber' && 'font-medium text-amber-600')}>
              <CalendarDays className="h-3.5 w-3.5" />{aviso.texto}
            </span>
          )}
          {!p.visible_cliente && <span>Interno</span>}
          <button type="button" aria-label={`Evidencias del punto ${codigo}`} className={chip} onClick={() => onAbrir('evidencia')}>
            <Link2 className="h-3.5 w-3.5" />Evidencias{p.evidencias.length > 0 && ` · ${p.evidencias.length}`}
          </button>
          {!p.responsable_cliente && (
            <button type="button" aria-label={`Tareas del punto ${codigo}`} className={chip} onClick={() => onAbrir('tareas')}>
              <SquareCheck className="h-3.5 w-3.5" />Tareas{p.tareas.length > 0 && ` · ${listas}/${p.tareas.length}`}
            </button>
          )}
        </div>
      </div>
      <button
        type="button"
        aria-label={`Gestionar el punto ${codigo}`}
        title="Gestionar el punto"
        onClick={() => onAbrir('gestionar')}
        className="h-8 w-8 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground grid place-items-center"
      >
        <Pencil className="h-4 w-4" />
      </button>
    </li>
  );
}

function EditarMinuta({ minuta, personas, abierto, onOpenChange, onGuardada }: {
  minuta: Minuta;
  personas: { id: string; nombre: string }[];
  abierto: boolean;
  onOpenChange: (v: boolean) => void;
  onGuardada: (m: Minuta) => void;
}) {
  const [titulo, setTitulo] = useState(minuta.titulo);
  const [fecha, setFecha] = useState(minuta.fecha);
  const [projectId, setProjectId] = useState(minuta.project_id ?? '');
  const [miembros, setMiembros] = useState(minuta.miembros.map((m) => m.id));
  const [resumen, setResumen] = useState(minuta.resumen ?? '');
  const [proyectos, setProyectos] = useState<{ id: string; nombre: string }[]>([]);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    setTitulo(minuta.titulo); setFecha(minuta.fecha); setProjectId(minuta.project_id ?? '');
    setMiembros(minuta.miembros.map((m) => m.id)); setResumen(minuta.resumen ?? '');
    api.getProjects({ brand_id: minuta.brand_id }).then(setProyectos).catch(() => setProyectos([]));
  }, [abierto, minuta]);

  const guardar = async () => {
    setGuardando(true);
    try {
      onGuardada(await editarMinuta(minuta.id, {
        titulo: titulo.trim(), fecha, project_id: projectId || null, miembros, resumen: resumen.trim() || null,
      }));
      onOpenChange(false);
      toast.success('Minuta actualizada');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog open={abierto} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Editar minuta {minuta.codigo}</DialogTitle>
          <DialogDescription>{minuta.brand_nombre}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_170px]">
            <div className="space-y-1.5">
              <Label htmlFor="em-titulo">Título de la minuta</Label>
              <Input id="em-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="em-fecha">Fecha</Label>
              <Input id="em-fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="em-proyecto">Proyecto</Label>
            <select id="em-proyecto" className={SELECT} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">Sin proyecto</option>
              {proyectos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>
          <SelectorEquipo personas={personas} seleccionados={miembros} excluir={minuta.owner.id} onChange={setMiembros} />
          <div className="space-y-1.5">
            <Label htmlFor="em-resumen">Resumen y acuerdos</Label>
            <Textarea id="em-resumen" rows={4} value={resumen} onChange={(e) => setResumen(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={!titulo.trim() || !fecha || guardando} onClick={guardar}>
            {guardando && <Loader2 className="h-4 w-4 animate-spin" />}Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function MinutaDetalle() {
  const { id = '' } = useParams();
  const [minuta, setMinuta] = useState<Minuta | null>(null);
  const [error, setError] = useState(false);
  const [personas, setPersonas] = useState<{ id: string; nombre: string }[]>([]);
  const [abierto, setAbierto] = useState<{ id: string; vista: VistaPunto } | null>(null);
  const [nuevo, setNuevo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [editando, setEditando] = useState(false);
  const navigate = useNavigate();
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

  const borrar = async () => {
    if (!minuta) return;
    try {
      await borrarMinuta(minuta.id);
      toast.success(`Minuta ${minuta.codigo} borrada`);
      navigate('/minutas');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo borrar');
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
  const puntoAbierto = abierto ? minuta.items.find((p) => p.id === abierto.id) ?? null : null;
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
            <Button size="sm" asChild><Link to={`/minutas/${minuta.id}/presentar`}><Presentation className="h-4 w-4" />Presentar</Link></Button>
            <Button size="sm" variant="outline" onClick={() => setEditando(true)}>Editar</Button>
            <Button size="sm" variant="outline" onClick={() => exportarMinutaPdf(minuta, { soloVisibles: true })}>
              <FileDown className="h-4 w-4" />Exportar PDF
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="ghost" className="text-muted-foreground">Borrar minuta</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Borrar la minuta {minuta.codigo}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Se borran sus puntos y evidencias. Las tareas vinculadas siguen existiendo en Tiusdei, solo pierden el vínculo.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={borrar}>Sí, borrar</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
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
          <span className="text-xs text-muted-foreground">El círculo cierra el punto con evidencia</span>
        </div>
        {minuta.items.length > 0 && (
          <ul>{minuta.items.map((p) => <FilaPunto key={p.id} minuta={minuta} p={p} hoy={hoy} onAbrir={(vista) => setAbierto({ id: p.id, vista })} />)}</ul>
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

      <EditarMinuta minuta={minuta} personas={personas} abierto={editando} onOpenChange={setEditando} onGuardada={setMinuta} />

      {abierto && puntoAbierto && (
        <PuntoDialog
          minuta={minuta}
          punto={puntoAbierto}
          vista={abierto.vista}
          personas={asignables}
          abierto
          onOpenChange={(v) => { if (!v) setAbierto(null); }}
          onActualizada={setMinuta}
        />
      )}
    </div>
  );
}
