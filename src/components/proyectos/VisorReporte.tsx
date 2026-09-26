import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { fechaCorta } from '@/lib/minutas';
import { aprobarReporte, eliminarReporte, enviarReporte, esperarReporte, leerReporte, pdfReporte, regenerarReporte, type Reporte } from '@/lib/reportesApi';
import { cn } from '@/lib/utils';
import { AccionesReporte } from './AccionesReporte';
import { ESTADO_REPORTE } from './estadosReporte';

interface Props {
  reporteId: string;
  abierto: boolean;
  onOpenChange: (abierto: boolean) => void;
  personas: { id: string; nombre: string }[];
  /** The report changed (regenerated, approved, sent): the list refreshes. */
  onCambio: () => void;
}

const periodo = (r: Reporte) => `${fechaCorta(r.periodo_desde)} – ${fechaCorta(r.periodo_hasta)} ${r.periodo_hasta.slice(0, 4)}`;
const enCurso = (r: Reporte) => r.estado === 'generando' || r.estado === 'programado';

/** A report inside Tiusdei: its PDF on the left, what can be done with it on the right. */
export function VisorReporte({ reporteId, abierto, onOpenChange, personas, onCambio }: Props) {
  const [reporte, setReporte] = useState<Reporte | null>(null);
  const [generando, setGenerando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  const esperar = useCallback(async () => {
    setGenerando(true);
    try {
      const r = await esperarReporte(reporteId);
      setReporte(r);
      return r;
    } finally {
      setGenerando(false);
    }
  }, [reporteId]);

  useEffect(() => {
    if (!abierto) return;
    let vigente = true;
    leerReporte(reporteId)
      .then((r) => { if (vigente) { setReporte(r); if (enCurso(r)) void esperar(); } })
      .catch((e) => toast.error(e instanceof Error ? e.message : 'No se pudo abrir el reporte'));
    return () => { vigente = false; };
  }, [abierto, reporteId, esperar]);

  // A fresh PDF every time the content changes (regenerated, approved).
  const huella = reporte?.contenido ? `${reporte.generado_en}|${reporte.estado}` : null;
  useEffect(() => {
    if (!huella) { setPdfUrl(null); return; }
    let url: string | null = null;
    let vigente = true;
    pdfReporte(reporteId)
      .then((blob) => { if (vigente) { url = URL.createObjectURL(blob); setPdfUrl(url); } })
      .catch(() => toast.error('No se pudo abrir el PDF del reporte.'));
    return () => { vigente = false; if (url) URL.revokeObjectURL(url); };
  }, [huella, reporteId]);

  const regenerar = async (indicaciones: string) => {
    setOcupado(true);
    try {
      await regenerarReporte(reporteId, indicaciones);
      const r = await esperar();
      if (r.error) toast.error('No se pudo regenerar el reporte.');
      else toast.success('Reporte regenerado');
      onCambio();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo regenerar el reporte.');
    } finally {
      setOcupado(false);
    }
  };

  const aprobar = async () => {
    setOcupado(true);
    try {
      const r = await aprobarReporte(reporteId);
      setReporte((prev) => ({ ...r, envios: prev?.envios ?? [] }));
      toast.success('Reporte aprobado');
      onCambio();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo aprobar el reporte.');
    } finally {
      setOcupado(false);
    }
  };

  const enviar = async (para: string[], cc: string[]) => {
    setOcupado(true);
    try {
      const { envios } = await enviarReporte(reporteId, para, cc);
      setReporte((prev) => (prev ? { ...prev, envios } : prev));
      toast.success('Reporte enviado');
      onCambio();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo enviar el reporte.');
      return false;
    } finally {
      setOcupado(false);
    }
  };

  const eliminar = async () => {
    if (!reporte || !window.confirm(`¿Eliminar el reporte ${periodo(reporte)}? No se puede deshacer.`)) return;
    setOcupado(true);
    try {
      await eliminarReporte(reporteId);
      toast.success('Reporte eliminado');
      onCambio();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo eliminar el reporte.');
    } finally {
      setOcupado(false);
    }
  };

  const estado = reporte ? ESTADO_REPORTE[generando ? 'generando' : reporte.estado] : null;

  return (
    <Dialog open={abierto} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92vh] w-[96vw] max-w-6xl flex-col gap-3 p-4 sm:p-5">
        <DialogHeader className="space-y-1 text-left">
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {reporte ? `Reporte ${periodo(reporte)}` : 'Reporte'}
            {estado && <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', estado.clase)}>{estado.texto}</span>}
          </DialogTitle>
          <DialogDescription>{reporte?.contenido?.proyecto?.nombre ?? 'Reporte semanal del proyecto'}</DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-h-[50vh] overflow-hidden rounded-lg border bg-muted/30">
            {generando ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                Dame un minuto, estoy generando el reporte… Puedes cerrar esta ventana: seguirá generándose.
              </div>
            ) : pdfUrl ? (
              <iframe title="Reporte en PDF" src={pdfUrl} className="h-full w-full" />
            ) : (
              <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
                {reporte && !reporte.contenido ? 'Este reporte todavía no tiene contenido.' : 'Cargando…'}
              </div>
            )}
          </div>
          <div className="min-h-0 space-y-4 overflow-y-auto">
            {pdfUrl && !generando && (
              <a href={pdfUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
                <ExternalLink className="h-4 w-4" />Abrir aparte
              </a>
            )}
            {reporte && <AccionesReporte reporte={reporte} personas={personas} ocupado={ocupado || generando} onRegenerar={regenerar} onAprobar={aprobar} onEnviar={enviar} />}
            {reporte && !generando && reporte.estado !== 'generando' && (
              <Button variant="ghost" size="sm" disabled={ocupado} onClick={eliminar} className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                <Trash2 className="h-4 w-4" />Eliminar reporte
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
