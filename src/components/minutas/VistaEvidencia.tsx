import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Circle, HardDrive, ImagePlus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { agregarEvidencia, quitarEvidencia, type Minuta, type Punto } from '@/lib/minutasApi';
import { uploadEditorImage, type DriveFile } from '@/lib/apiClient';
import { fechaLocal, requisitosCierre } from '@/lib/minutas';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DriveBrowser } from '@/components/drive/DriveBrowser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { ListaEvidencias } from './ListaEvidencias';
import { usePuntoAcciones } from './usePuntoAcciones';

interface Props {
  punto: Punto;
  onActualizada: (minuta: Minuta) => void;
}

const MAX_IMAGEN = 8 * 1024 * 1024;

/** Evidencia del punto. Abierto: se arma el cierre (qué se hizo + evidencias). Cerrado: se muestra lo hecho. */
export function VistaEvidencia({ punto, onActualizada }: Props) {
  const { enviando, conError, accion } = usePuntoAcciones(punto.id, onActualizada);
  const [resolucion, setResolucion] = useState(punto.resolucion ?? '');
  const [enlaceNombre, setEnlaceNombre] = useState('');
  const [enlaceUrl, setEnlaceUrl] = useState('');
  const [driveAbierto, setDriveAbierto] = useState(false);

  useEffect(() => { setResolucion(punto.resolucion ?? ''); }, [punto.id, punto.resolucion]);

  const cerrado = punto.estado === 'completado' || punto.estado === 'aprobado';
  const requisitos = requisitosCierre({ responsable_cliente: punto.responsable_cliente, resolucion, evidencias: punto.evidencias.length });
  const puedeCerrar = requisitos.every((r) => r.ok);

  const agregarEnlace = async () => {
    const ok = await conError(
      () => agregarEvidencia(punto.id, { tipo: 'enlace', nombre: enlaceNombre.trim(), url: enlaceUrl.trim() }),
      'No se pudo agregar el enlace',
    );
    if (ok) { setEnlaceNombre(''); setEnlaceUrl(''); }
  };

  // Capturas: se suben con la misma subida de imágenes del editor (el servidor verifica que sean imágenes reales).
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

  // Ctrl+V en cualquier parte mientras esta vista está abierta.
  const subirRef = useRef(subirImagenes);
  subirRef.current = subirImagenes;
  useEffect(() => {
    if (cerrado) return;
    const pegar = (e: ClipboardEvent) => {
      const imagenes = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'));
      if (imagenes.length) { e.preventDefault(); subirRef.current(imagenes); }
    };
    document.addEventListener('paste', pegar);
    return () => document.removeEventListener('paste', pegar);
  }, [cerrado]);

  // Sin taskId, DriveBrowser solo devuelve el archivo elegido: no lo adjunta a ninguna tarea.
  const elegirDeDrive = async (file: DriveFile) => {
    setDriveAbierto(false);
    await conError(
      () => agregarEvidencia(punto.id, { tipo: 'drive', nombre: file.name, url: file.webViewLink ?? '', drive_file_id: file.id }),
      'No se pudo agregar el archivo de Drive',
    );
  };

  return (
    <>
      {cerrado ? (
        <div className="space-y-4">
          <section className="space-y-1">
            <h3 className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">{punto.responsable_cliente ? 'Qué llegó' : 'Qué se hizo'}</h3>
            <p className="text-sm">{punto.resolucion || 'Sin nota.'}</p>
          </section>
          <section className="space-y-1.5">
            <h3 className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">Evidencia</h3>
            <ListaEvidencias evidencias={punto.evidencias} />
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
            <ListaEvidencias evidencias={punto.evidencias} onQuitar={(ev) => conError(() => quitarEvidencia(ev.id), 'No se pudo quitar la evidencia')} />
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
      )}
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
    </>
  );
}
