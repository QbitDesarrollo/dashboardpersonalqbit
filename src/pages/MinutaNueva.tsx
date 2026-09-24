import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, NotebookPen, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import * as api from '@/lib/apiClient';
import { crearMinuta } from '@/lib/minutasApi';
import { aPuntosNuevos, hoyEcuador, puntosDesdeIa } from '@/lib/minutas';
import type { BorradorIa } from '@/lib/minutasIaApi';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { EditorPuntos, SELECT, type PuntoBorrador } from '@/components/minutas/EditorPuntos';
import { SelectorEquipo } from '@/components/minutas/SelectorEquipo';
import { GenerarConIa } from '@/components/minutas/GenerarConIa';
import { CupoIa } from '@/components/minutas/CupoIa';
import { useEstadoIa } from '@/components/minutas/useEstadoIa';

interface Opcion { id: string; nombre: string }

export default function MinutaNueva() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [marcas, setMarcas] = useState<Opcion[]>([]);
  const [proyectos, setProyectos] = useState<Opcion[]>([]);
  const [personas, setPersonas] = useState<Opcion[]>([]);

  const [brandId, setBrandId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [fecha, setFecha] = useState(hoyEcuador());
  const [titulo, setTitulo] = useState('');
  const [ownerId, setOwnerId] = useState(user?.id ?? '');
  const [miembros, setMiembros] = useState<string[]>([]);
  const [resumen, setResumen] = useState('');
  const [puntos, setPuntos] = useState<PuntoBorrador[]>([]);
  const [guardando, setGuardando] = useState(false);
  const { estado: ia, refrescar: refrescarIa } = useEstadoIa();
  const [iaAbierto, setIaAbierto] = useState(false);

  useEffect(() => {
    api.getBrands()
      .then((b: Array<Opcion & { activo?: unknown }>) => setMarcas((Array.isArray(b) ? b : []).filter((x) => x.activo !== 0 && x.activo !== false)))
      .catch(() => toast.error('No se pudieron cargar las marcas'));
    api.getProfiles()
      .then((p: Array<Opcion & { activo?: unknown }>) => setPersonas((Array.isArray(p) ? p : []).filter((x) => x.activo !== 0 && x.activo !== false)))
      .catch(() => toast.error('No se pudo cargar el equipo'));
  }, []);

  // The AI draft never overwrites what was already written: it fills blanks and appends points.
  const aplicarBorrador = (b: BorradorIa) => {
    setTitulo((t) => (t.trim() ? t : b.titulo));
    setResumen((r) => (!b.resumen ? r : r.trim() ? `${r.trim()}\n\n${b.resumen}` : b.resumen));
    setPuntos((p) => [...p, ...puntosDesdeIa(b.puntos)]);
    refrescarIa();
  };

  useEffect(() => {
    setProjectId('');
    if (!brandId) { setProyectos([]); return; }
    api.getProjects({ brand_id: brandId }).then((p) => setProyectos(p)).catch(() => setProyectos([]));
  }, [brandId]);

  // Los asignables son responsable + equipo primero.
  const asignables = useMemo(() => {
    const primero = new Set([ownerId, ...miembros]);
    return [...personas.filter((p) => primero.has(p.id)), ...personas.filter((p) => !primero.has(p.id))];
  }, [personas, ownerId, miembros]);

  const faltan = [!brandId && 'marca', !titulo.trim() && 'título', !fecha && 'fecha'].filter(Boolean) as string[];

  const guardar = async (estado: 'borrador' | 'publicada') => {
    if (faltan.length) return;
    setGuardando(true);
    try {
      const minuta = await crearMinuta({
        brand_id: brandId,
        project_id: projectId || null,
        fecha,
        titulo: titulo.trim(),
        owner_user_id: ownerId || undefined,
        miembros: miembros.filter((m) => m !== ownerId),
        resumen: resumen.trim() || null,
        estado,
        items: aPuntosNuevos(puntos),
      });
      toast.success(estado === 'borrador' ? 'Minuta guardada como borrador' : 'Minuta publicada');
      navigate(`/minutas/${minuta.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar la minuta');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-5">
      <Link to="/minutas" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />Minutas
      </Link>
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center"><NotebookPen className="h-5 w-5 text-primary" /></div>
        <div>
          <h1 className="text-2xl font-bold">Nueva minuta</h1>
          <p className="text-sm text-muted-foreground">Se numera sola por marca: M-01, M-02…</p>
        </div>
        {/* Only members of the desks enabled in Admin → Config see the AI button. */}
        {ia?.permitido && (
          <div className="ml-auto flex flex-col items-end gap-1.5">
            <Button variant="outline" onClick={() => setIaAbierto(true)}>
              <Sparkles className="h-4 w-4 text-primary" />Generar con IA
            </Button>
            <CupoIa estado={ia} />
          </div>
        )}
      </div>
      {ia?.permitido && (
        <GenerarConIa abierto={iaAbierto} onOpenChange={setIaAbierto} fecha={fecha} estado={ia} onBorrador={aplicarBorrador} />
      )}

      <Card><CardContent className="p-4 sm:p-5 space-y-4">
        <h2 className="font-semibold">Datos</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="mn-marca">Marca <span className="text-destructive">*</span></Label>
            <select id="mn-marca" aria-label="Marca" className={SELECT} value={brandId} onChange={(e) => setBrandId(e.target.value)}>
              <option value="">Selecciona una marca</option>
              {marcas.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mn-proyecto">Proyecto</Label>
            <select id="mn-proyecto" className={SELECT} value={projectId} onChange={(e) => setProjectId(e.target.value)} disabled={!brandId}>
              <option value="">{brandId ? 'Sin proyecto' : 'Elige primero la marca'}</option>
              {proyectos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mn-fecha">Fecha de la reunión <span className="text-destructive">*</span></Label>
            <Input id="mn-fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mn-titulo">Título <span className="text-destructive">*</span></Label>
          <Input id="mn-titulo" aria-label="Título" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej.: Revisión de avance del sitio" />
        </div>
        <div className="space-y-1.5 sm:max-w-xs">
          <Label htmlFor="mn-owner">Responsable de la minuta</Label>
          <select id="mn-owner" className={SELECT} value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
            {personas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <SelectorEquipo personas={personas} seleccionados={miembros} excluir={ownerId} onChange={setMiembros} />
          <p className="text-xs text-muted-foreground">Quienes estuvieron o siguen esta minuta. Aparecen primero al asignar puntos.</p>
        </div>
      </CardContent></Card>

      <Card><CardContent className="p-4 sm:p-5 space-y-2">
        <Label htmlFor="mn-resumen" className="font-semibold">Resumen y acuerdos</Label>
        <Textarea
          id="mn-resumen"
          rows={3}
          value={resumen}
          onChange={(e) => setResumen(e.target.value)}
          placeholder="Contexto de la reunión y decisiones generales. Ej.: el lanzamiento pasa al 26 de noviembre."
        />
      </CardContent></Card>

      <Card><CardContent className="p-4 sm:p-5 space-y-3">
        <h2 className="font-semibold">Puntos <span className="ml-1 text-xs font-normal text-muted-foreground">{puntos.length}</span></h2>
        <EditorPuntos puntos={puntos} onChange={setPuntos} personas={asignables} />
      </CardContent></Card>

      <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 bg-gradient-to-t from-background via-background to-transparent py-3">
        {faltan.length > 0 && <span className="mr-auto text-xs text-destructive">Falta: {faltan.join(', ')}</span>}
        <Button variant="outline" asChild><Link to="/minutas">Cancelar</Link></Button>
        <Button variant="outline" disabled={faltan.length > 0 || guardando} onClick={() => guardar('borrador')}>Guardar borrador</Button>
        <Button disabled={faltan.length > 0 || guardando} onClick={() => guardar('publicada')}>
          {guardando && <Loader2 className="h-4 w-4 animate-spin" />}Guardar y publicar
        </Button>
      </div>
    </div>
  );
}
