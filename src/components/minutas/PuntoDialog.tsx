import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Circle, ExternalLink, HardDrive, ImagePlus, Link2, Loader2, Plus, Search, SquareCheck, X } from 'lucide-react';
import { toast } from 'sonner';
import { accionPunto, agregarEvidencia, desvincularTarea, editarPunto, quitarEvidencia, vincularTarea, type AccionPunto, type Minuta, type Punto } from '@/lib/minutasApi';
import { getTasks, uploadEditorImage } from '@/lib/apiClient';
import { estadoPunto, requisitosCierre } from '@/lib/minutas';
import { TONO } from './tonos';
import { urlNuevaTareaDesdePunto } from '@/lib/tareaDesdePunto';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DriveBrowser } from '@/components/drive/DriveBrowser';
import type { DriveFile } from '@/lib/apiClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { SELECT } from './EditorPuntos';
import { cn } from '@/lib/utils';

export type VistaPunto = 'evidencia' | 'tareas' | 'gestionar';

interface Props {
  minuta: Minuta;
  punto: Punto;
  /** Qué parte del punto se abre: cada acción de la lista abre solo lo suyo. */
  vista: VistaPunto;
  personas: { id: string; nombre: string }[];
  abierto: boolean;
  onOpenChange: (abierto: boolean) => void;
  onActualizada: (minuta: Minuta) => void;
}


// Mismas etiquetas que Proyectos para los estados de tarea.
const ESTADO_TAREA: Record<string, string> = {
  backlog: 'Pendiente', en_proceso: 'En proceso', en_revision: 'En revisión', revision_interna: 'Revisión interna',
  revision_cliente: 'Revisión cliente', ajustes: 'Ajustes', aprobado: 'Aprobado', entregado: 'Entregado', bloqueado: 'Bloqueado',
};

interface TareaEncontrada { id: string; titulo_tarea: string; estado: string }

function fechaLocal(iso: string): string {
  return new Date(iso).toLocaleDateString('es-EC', { timeZone: 'America/Guayaquil', day: 'numeric', month: 'short', year: 'numeric' });
}


const TITULO_VISTA: Record<VistaPunto, string> = { evidencia: 'Evidencia', tareas: 'Tareas', gestionar: 'Gestionar' };

export function PuntoDialog({ minuta, punto, personas, vista, abierto, onOpenChange, onActualizada }: Props) {
  const [resolucion, setResolucion] = useState(punto.resolucion ?? '');
  const [enviando, setEnviando] = useState(false);
  const [enlaceNombre, setEnlaceNombre] = useState('');
  const [enlaceUrl, setEnlaceUrl] = useState('');
  const [driveAbierto, setDriveAbierto] = useState(false);
  const [titulo, setTitulo] = useState(punto.titulo);
  const [descripcion, setDescripcion] = useState(punto.descripcion ?? '');
  const [responsable, setResponsable] = useState(punto.responsable_cliente ? 'cliente' : punto.responsable?.id ?? '');
  const [fecha, setFecha] = useState(punto.fecha_compromiso ?? '');
  const [visible, setVisible] = useState(punto.visible_cliente);
  const [descartando, setDescartando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const navigate = useNavigate();
  const [busqueda, setBusqueda] = useState('');
  const [encontradas, setEncontradas] = useState<TareaEncontrada[]>([]);

  useEffect(() => {
    const texto = busqueda.trim();
    if (texto.length < 2) { setEncontradas([]); return; }
    let vigente = true;
    const t = setTimeout(() => {
      getTasks({ brand_id: minuta.brand_id, search: texto, limit: 8 })
        .then((r) => { if (vigente) setEncontradas(r.tasks as TareaEncontrada[]); })
        .catch(() => { if (vigente) setEncontradas([]); });
    }, 250);
    return () => { vigente = false; clearTimeout(t); };
  }, [busqueda, minuta.brand_id]);

  useEffect(() => {
    setTitulo(punto.titulo);
    setDescripcion(punto.descripcion ?? '');
    setResponsable(punto.responsable_cliente ? 'cliente' : punto.responsable?.id ?? '');
    setFecha(punto.fecha_compromiso ?? '');
    setVisible(punto.visible_cliente);
    setDescartando(false);
    setMotivo('');
  }, [punto]);

  useEffect(() => { setResolucion(punto.resolucion ?? ''); }, [punto.id, punto.resolucion]);

  const estado = estadoPunto(punto);
  const requisitos = requisitosCierre({ responsable_cliente: punto.responsable_cliente, resolucion, evidencias: punto.evidencias.length });
  const puedeCerrar = requisitos.every((r) => r.ok);

  const conError = async (fn: () => Promise<Minuta>, fallo: string) => {
    setEnviando(true);
    try {
      onActualizada(await fn());
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : fallo);
      return false;
    } finally {
      setEnviando(false);
    }
  };

  const accion = (a: AccionPunto, datos: { resolucion?: string; motivo?: string } = {}) =>
    conError(() => accionPunto(punto.id, a, datos), 'No se pudo actualizar el punto');

  const agregarEnlace = async () => {
    const ok = await conError(
      () => agregarEvidencia(punto.id, { tipo: 'enlace', nombre: enlaceNombre.trim(), url: enlaceUrl.trim() }),
      'No se pudo agregar el enlace',
    );
    if (ok) { setEnlaceNombre(''); setEnlaceUrl(''); }
  };

  // Capturas: se suben con la misma subida de imágenes del editor (el servidor verifica que sean imágenes reales).
  const MAX_IMAGEN = 8 * 1024 * 1024;
  const subirImagenes = async (archivos: File[]) => {
    for (const f of archivos) {
      if (!f.type.startsWith('image/')) { toast.error(`${f.name || 'El archivo'} no es una imagen`); continue; }
      if (f.size > MAX_IMAGEN) { toast.error(`${f.name || 'La imagen'} pesa más de 8 MB`); continue; }
      await conError(async () => {
        const { url } = await uploadEditorImage(f);
        return agregarEvidencia(punto.id, { tipo: 'imagen', nombre: f.name || 'captura.png', url });
      }, 'No se pudo subir la imagen');
    }
  };

  const pegar = (e: React.ClipboardEvent) => {
    if (vista !== 'evidencia') return;
    const imagenes = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'));
    if (imagenes.length) { e.preventDefault(); subirImagenes(imagenes); }
  };

  // Sin taskId, DriveBrowser solo devuelve el archivo elegido: no lo adjunta a ninguna tarea.
  const elegirDeDrive = async (file: DriveFile) => {
    setDriveAbierto(false);
    await conError(
      () => agregarEvidencia(punto.id, { tipo: 'drive', nombre: file.name, url: file.webViewLink ?? '', drive_file_id: file.id }),
      'No se pudo agregar el archivo de Drive',
    );
  };

  const cerrado = punto.estado === 'completado' || punto.estado === 'aprobado';

  const guardarDetalle = () => conError(() => editarPunto(punto.id, {
    titulo: titulo.trim(),
    descripcion: descripcion.trim() || null,
    responsable_user_id: responsable && responsable !== 'cliente' ? responsable : null,
    responsable_cliente: responsable === 'cliente',
    fecha_compromiso: fecha || null,
    visible_cliente: visible,
  }), 'No se pudieron guardar los cambios');

  const listaEvidencias = (editable: boolean) =>
    punto.evidencias.length === 0 ? null : (
      <ul className="space-y-1.5">
        {punto.evidencias.map((ev) => (
          <li key={ev.id} className="flex items-center gap-2 rounded-lg border px-3 py-2">
            {ev.tipo === 'imagen' ? (
              <a href={ev.url} target="_blank" rel="noreferrer" className="shrink-0">
                <img src={ev.url} alt={ev.nombre} className="h-10 w-14 rounded object-cover" />
              </a>
            ) : ev.tipo === 'drive' ? <HardDrive className="h-4 w-4 shrink-0 text-muted-foreground" /> : <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />}
            <a href={ev.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-sm font-medium hover:underline">
              {ev.nombre}<ExternalLink className="ml-1 inline h-3 w-3 text-muted-foreground" />
            </a>
            {editable && (
              <button
                type="button"
                aria-label={`Quitar ${ev.nombre}`}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => conError(() => quitarEvidencia(ev.id), 'No se pudo quitar la evidencia')}
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </li>
        ))}
      </ul>
    );


  return (
    <Dialog open={abierto} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-[95vw] max-h-[92vh] overflow-y-auto p-0 gap-0" onPaste={pegar}>
        <DialogHeader className="px-5 pt-5 pb-3 space-y-2 text-left">
          <DialogDescription className="font-mono text-xs uppercase tracking-wide">
            {minuta.codigo} · Punto {minuta.numero}.{punto.numero} · {TITULO_VISTA[vista]}
          </DialogDescription>
          <DialogTitle className="text-xl leading-snug">{punto.titulo}</DialogTitle>
          <span className={cn('inline-flex w-fit rounded-full px-2.5 py-0.5 text-xs font-medium', TONO[estado.tono])}>{estado.texto}</span>
        </DialogHeader>


        <div className="p-5 space-y-4">
          {vista === 'gestionar' && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="pd-titulo">Título</Label>
                <Input id="pd-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pd-descripcion">Descripción</Label>
                <Textarea id="pd-descripcion" rows={3} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Qué pidió el cliente, con el detalle que haga falta." />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="pd-responsable">Responsable</Label>
                  <select id="pd-responsable" className={SELECT} value={responsable} onChange={(e) => setResponsable(e.target.value)}>
                    <option value="">Sin responsable</option>
                    {personas.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                    <option value="cliente">Cliente</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pd-fecha">{responsable === 'cliente' ? 'Quedó en enviarlo el' : 'Fecha de compromiso'}</Label>
                  <Input id="pd-fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pd-visible">Visible para el cliente</Label>
                  <div className="flex h-10 items-center gap-2">
                    <Switch id="pd-visible" checked={visible} onCheckedChange={setVisible} />
                    <span className="text-sm text-muted-foreground">{visible ? 'Sí' : 'No, es interno'}</span>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button disabled={!titulo.trim() || enviando} onClick={guardarDetalle}>Guardar cambios</Button>
                {punto.estado === 'descartado' ? (
                  <Button variant="outline" disabled={enviando} onClick={() => accion('restaurar')}>Restaurar</Button>
                ) : punto.estado !== 'aprobado' && (
                  <Button variant="ghost" className="text-muted-foreground" onClick={() => setDescartando((v) => !v)}>Descartar punto</Button>
                )}
              </div>
              {punto.estado === 'descartado' && punto.motivo_descarte && (
                <p className="rounded-lg bg-muted px-3 py-2 text-sm">Descartado: {punto.motivo_descarte}</p>
              )}
              {descartando && (
                <div className="space-y-2 rounded-lg border border-dashed p-3">
                  <Label htmlFor="pd-motivo">Motivo del descarte</Label>
                  <Input id="pd-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: el cliente retiró el pedido." />
                  <Button variant="destructive" size="sm" disabled={!motivo.trim() || enviando} onClick={() => accion('descartar', { motivo: motivo.trim() })}>
                    Confirmar descarte
                  </Button>
                </div>
              )}
            </div>
          )}

          {vista === 'tareas' && (
            <div className="space-y-4">
              {punto.tareas.length === 0 ? (
                <p className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
                  Este punto todavía no tiene tareas. Si es algo rápido, ciérralo directo con evidencia.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {punto.tareas.map((t) => (
                    <li key={t.id} className="flex items-center gap-3 rounded-lg border px-3 py-2">
                      <SquareCheck className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{t.titulo_tarea}</p>
                        <p className="text-xs text-muted-foreground">
                          {ESTADO_TAREA[t.estado] ?? t.estado}
                          {t.responsable && ` · ${t.responsable.nombre}`}
                          {t.fecha_entrega && ` · entrega ${t.fecha_entrega}`}
                        </p>
                      </div>
                      <button
                        type="button"
                        aria-label={`Desvincular ${t.titulo_tarea}`}
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        onClick={() => conError(() => desvincularTarea(punto.id, t.id), 'No se pudo desvincular la tarea')}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => navigate(urlNuevaTareaDesdePunto({
                  brandId: minuta.brand_id,
                  projectId: minuta.project_id,
                  titulo: punto.titulo,
                  detalle: [punto.descripcion, `Origen: ${minuta.brand_nombre} ${minuta.codigo}, punto ${minuta.numero}.${punto.numero}.`].filter(Boolean).join('\n\n'),
                  fechaEntrega: punto.fecha_compromiso,
                  minutaItemId: punto.id,
                  minutaId: minuta.id,
                }))}>
                  <Plus className="h-4 w-4" />Nueva tarea
                </Button>
                <span className="text-xs text-muted-foreground">Abre el formulario de tarea de siempre, prellenado. Al guardar vuelves aquí.</span>
              </div>
              <div className="space-y-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    aria-label={`Buscar una tarea de ${minuta.brand_nombre}`}
                    className="pl-9"
                    placeholder={`Vincular una tarea existente de ${minuta.brand_nombre}`}
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                  />
                </div>
                {encontradas.filter((t) => !punto.tareas.some((v) => v.id === t.id)).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    aria-label={`Vincular ${t.titulo_tarea}`}
                    className="flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm hover:bg-muted"
                    onClick={async () => { if (await conError(() => vincularTarea(punto.id, t.id), 'No se pudo vincular la tarea')) setBusqueda(''); }}
                  >
                    <span className="truncate">{t.titulo_tarea}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{ESTADO_TAREA[t.estado] ?? t.estado}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {vista === 'evidencia' && (cerrado ? (
            <div className="space-y-4">
              <section className="space-y-1">
                <h3 className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">{punto.responsable_cliente ? 'Qué llegó' : 'Qué se hizo'}</h3>
                <p className="text-sm">{punto.resolucion || 'Sin nota.'}</p>
              </section>
              <section className="space-y-1.5">
                <h3 className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">Evidencia</h3>
                {listaEvidencias(false)}
              </section>
              <p className="text-xs text-muted-foreground">
                {punto.completado_en && `Cerrado el ${fechaLocal(punto.completado_en)}`}
                {punto.completado_por && ` por ${punto.completado_por.nombre}`}
                {punto.aprobado_en && ` · Aprobado el ${fechaLocal(punto.aprobado_en)}${punto.aprobado_via === 'reunion' ? ' en reunión' : ''}${punto.aprobado_por_nombre ? ` (${punto.aprobado_por_nombre})` : ''}`}
              </p>
              {punto.estado === 'completado' && !punto.responsable_cliente && (
                <div className="flex flex-wrap gap-2">
                  <Button disabled={enviando} onClick={() => accion('aprobar')}><CheckCircle2 className="h-4 w-4" />Aprobado en reunión</Button>
                  <Button variant="outline" disabled={enviando} onClick={() => accion('reabrir')}>Reabrir</Button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <p className="rounded-lg bg-primary/10 px-3 py-2 text-sm">
                {punto.responsable_cliente
                  ? 'Para marcarlo como recibido, adjunta lo que envió el cliente.'
                  : 'Para cerrar el punto, explica qué se hizo y adjunta al menos una evidencia.'}
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="pd-resolucion">{punto.responsable_cliente ? 'Nota (opcional)' : '¿Qué se hizo?'}</Label>
                <Textarea
                  id="pd-resolucion"
                  rows={3}
                  value={resolucion}
                  onChange={(e) => setResolucion(e.target.value)}
                  placeholder="Explica en dos o tres líneas qué se entregó y dónde se puede ver."
                />
              </div>
              <div className="space-y-2">
                <span className="text-sm font-medium">Evidencia</span>
                {listaEvidencias(true)}
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto]">
                  <Input aria-label="Nombre del enlace" placeholder="Nombre (ej.: Home en staging)" value={enlaceNombre} onChange={(e) => setEnlaceNombre(e.target.value)} />
                  <Input aria-label="URL" placeholder="https://" value={enlaceUrl} onChange={(e) => setEnlaceUrl(e.target.value)} />
                  <Button type="button" variant="outline" disabled={!enlaceNombre.trim() || !enlaceUrl.trim() || enviando} onClick={agregarEnlace}>
                    Agregar enlace
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setDriveAbierto(true)}>
                    <HardDrive className="h-4 w-4" />Elegir de Drive
                  </Button>
                  <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground">
                    <ImagePlus className="h-4 w-4" />Subir imagen
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      aria-label="Subir imagen"
                      className="sr-only"
                      onChange={(e) => { subirImagenes(Array.from(e.target.files ?? [])); e.target.value = ''; }}
                    />
                  </label>
                  <span className="text-xs text-muted-foreground">o pega una captura con Ctrl+V</span>
                </div>
              </div>
              <ul className="space-y-1 text-sm">
                {requisitos.map((r) => (
                  <li key={r.texto} className={cn('flex items-center gap-2', r.ok ? 'text-primary' : 'text-muted-foreground')}>
                    {r.ok ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}{r.texto}
                  </li>
                ))}
              </ul>
              <Button disabled={!puedeCerrar || enviando} onClick={() => accion('completar', { resolucion: resolucion.trim() })}>
                {enviando && <Loader2 className="h-4 w-4 animate-spin" />}
                {punto.responsable_cliente ? 'Marcar como recibido' : 'Marcar como completado'}
              </Button>
            </div>
          ))}
        </div>

        <Dialog open={driveAbierto} onOpenChange={setDriveAbierto}>
          <DialogContent className="max-w-2xl h-[70vh] flex flex-col p-0 gap-0">
            <DialogHeader className="px-4 pt-4 pb-2 shrink-0">
              <DialogTitle>Evidencia desde Google Drive</DialogTitle>
              <DialogDescription>Elige el archivo que respalda este punto.</DialogDescription>
            </DialogHeader>
            <div className="flex-1 min-h-0 overflow-hidden">
              {driveAbierto && <DriveBrowser mode="picker" onSelect={elegirDeDrive} onClose={() => setDriveAbierto(false)} />}
            </div>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
