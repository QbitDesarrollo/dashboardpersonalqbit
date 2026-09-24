import { useState } from 'react';
import { FileUp, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { esperarBorrador, pedirBorrador, type BorradorIa, type EstadoIa } from '@/lib/minutasIaApi';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface Props {
  abierto: boolean;
  onOpenChange: (abierto: boolean) => void;
  /** Meeting date: relative dates in the transcript ("el viernes") are computed from it. */
  fecha: string;
  estado: EstadoIa;
  onBorrador: (borrador: BorradorIa) => void;
}

/** Paste (or load) a meeting transcript and get a minuta draft to review before saving. */
export function GenerarConIa({ abierto, onOpenChange, fecha, estado, onBorrador }: Props) {
  const [transcripcion, setTranscripcion] = useState('');
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const quedan = Math.max(estado.limite - estado.usados, 0);

  const cargar = async (archivo: File | undefined) => {
    if (!archivo) return;
    try {
      setTranscripcion(await archivo.text());
      setError(null);
    } catch {
      setError('No se pudo leer el archivo. Copia y pega el texto.');
    }
  };

  const generar = async () => {
    setGenerando(true);
    setError(null);
    try {
      const { id } = await pedirBorrador({ transcripcion: transcripcion.trim(), fecha });
      onBorrador(await esperarBorrador(id));
      toast.success('Borrador listo: revisa los puntos antes de guardar.');
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo generar la minuta.');
    } finally {
      setGenerando(false);
    }
  };

  return (
    <Dialog open={abierto} onOpenChange={(v) => { if (!generando) onOpenChange(v); }}>
      <DialogContent className="max-w-2xl w-[95vw]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" />Generar la minuta con IA</DialogTitle>
          <DialogDescription>
            Pega la transcripción de la reunión. La IA propone título, resumen y puntos; tú los revisas antes de guardar. La transcripción no se guarda.
          </DialogDescription>
        </DialogHeader>

        {!estado.disponible && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">La IA no está disponible ahora: {estado.detalle}</p>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="ia-transcripcion">Transcripción de la reunión</Label>
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-primary hover:underline">
              <FileUp className="h-3.5 w-3.5" />Cargar archivo
              <input
                type="file"
                accept=".txt,.vtt,.srt,text/plain"
                aria-label="Cargar archivo"
                className="sr-only"
                onChange={(e) => { cargar(e.target.files?.[0]); e.target.value = ''; }}
              />
            </label>
          </div>
          <Textarea
            id="ia-transcripcion"
            rows={12}
            className="font-mono text-xs"
            placeholder="Even: Buenas, revisemos el avance del home…"
            value={transcripcion}
            onChange={(e) => setTranscripcion(e.target.value)}
            disabled={generando}
          />
          <p className="text-xs text-muted-foreground">Te quedan {quedan} de {estado.limite} hoy.</p>
        </div>

        {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        {generando && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />Generando… suele tardar entre 10 segundos y un minuto.
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" disabled={generando} onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={!transcripcion.trim() || generando || !estado.disponible || quedan === 0} onClick={generar}>
            <Sparkles className="h-4 w-4" />Generar borrador
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
