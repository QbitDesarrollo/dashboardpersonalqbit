import { useState } from 'react';
import { FileUp, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { esperarBorrador, pedirBorrador, type BorradorIa, type EstadoIa } from '@/lib/minutasIaApi';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
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

/**
 * Paste the meeting transcript and/or what the client sent (email, to-do list) and get a minuta draft
 * to review before saving. Each source goes separately so the AI knows who said what.
 */
export function GenerarConIa({ abierto, onOpenChange, fecha, estado, onBorrador }: Props) {
  const [transcripcion, setTranscripcion] = useState('');
  const [notasCliente, setNotasCliente] = useState('');
  const [indicaciones, setIndicaciones] = useState('');
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const quedan = Math.max(estado.limite - estado.usados, 0);

  const cargar = async (archivo: File | undefined) => {
    if (!archivo) return;
    try {
      setTranscripcion(await archivo.text());
      setError(null);
    } catch {
      setError('No pudimos leer el archivo. Copia el texto y pégalo aquí.');
    }
  };

  const generar = async () => {
    setGenerando(true);
    setError(null);
    try {
      const { id } = await pedirBorrador({
        transcripcion: transcripcion.trim(), notas_cliente: notasCliente.trim(), indicaciones: indicaciones.trim(), fecha,
      });
      onBorrador(await esperarBorrador(id));
      toast.success('Listo. Revisa los puntos antes de guardar.');
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo generar la minuta.');
    } finally {
      setGenerando(false);
    }
  };

  return (
    <Dialog open={abierto} onOpenChange={(v) => { if (!generando) onOpenChange(v); }}>
      <DialogContent className="max-w-2xl w-[95vw] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" />Arma la minuta con IA</DialogTitle>
          <DialogDescription>
            Pega la transcripción, las notas del cliente o ambos. La IA te propone el título, el resumen y los puntos, y tú revisas todo antes de guardar.
          </DialogDescription>
        </DialogHeader>

        {!estado.disponible && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            La IA no está disponible en este momento. Si sigue así, avísale a un administrador.
          </p>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="ia-transcripcion">Transcripción de la reunión</Label>
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-primary hover:underline">
              <FileUp className="h-3.5 w-3.5" />Subir archivo
              <input
                type="file"
                accept=".txt,.vtt,.srt,text/plain"
                aria-label="Subir archivo"
                className="sr-only"
                onChange={(e) => { cargar(e.target.files?.[0]); e.target.value = ''; }}
              />
            </label>
          </div>
          <Textarea
            id="ia-transcripcion"
            rows={8}
            placeholder="Pega aquí la transcripción de Meet, Zoom o Teams."
            value={transcripcion}
            onChange={(e) => setTranscripcion(e.target.value)}
            disabled={generando}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="ia-notas">Notas del cliente (opcional)</Label>
          <Textarea
            id="ia-notas"
            rows={5}
            placeholder="Pega su correo o su lista de pendientes tal como llegó."
            value={notasCliente}
            onChange={(e) => setNotasCliente(e.target.value)}
            disabled={generando}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="ia-indicaciones">¿Algo que la IA deba tener en cuenta? (opcional)</Label>
          <Input
            id="ia-indicaciones"
            maxLength={500}
            placeholder="Ej.: Enfócate en el portal; lo de redes va en otra minuta."
            value={indicaciones}
            onChange={(e) => setIndicaciones(e.target.value)}
            disabled={generando}
          />
          <p className="text-xs text-muted-foreground">{`Te quedan ${quedan} de ${estado.limite} hoy. No guardamos lo que pegues aquí.`}</p>
        </div>

        {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        {generando && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />Armando la minuta… suele tomar entre 10 segundos y un minuto.
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" disabled={generando} onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={(!transcripcion.trim() && !notasCliente.trim()) || generando || !estado.disponible || quedan === 0} onClick={generar}>
            <Sparkles className="h-4 w-4" />Crear borrador
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
