import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { AlertTriangle } from 'lucide-react';

export type MotivoReschedule = 'INTERNO' | 'CLIENTE' | 'ALCANCE' | 'FUERZA_MAYOR';

interface MotivoOption {
  value: MotivoReschedule;
  label: string;
  desc: string;
  cuenta: boolean; // ¿cuenta como atraso del equipo?
  color: string;
}

export const MOTIVO_OPTIONS: MotivoOption[] = [
  { value: 'INTERNO', label: 'Interno', desc: 'No alcanzamos a tiempo', cuenta: true, color: 'border-red-300 bg-red-50 text-red-700' },
  { value: 'CLIENTE', label: 'Cliente', desc: 'Esperando aprobación o cambios del cliente', cuenta: false, color: 'border-blue-300 bg-blue-50 text-blue-700' },
  { value: 'ALCANCE', label: 'Cambio de alcance', desc: 'La tarea creció o cambió', cuenta: false, color: 'border-amber-300 bg-amber-50 text-amber-700' },
  { value: 'FUERZA_MAYOR', label: 'Fuerza mayor', desc: 'Algo externo e imprevisible', cuenta: false, color: 'border-gray-300 bg-gray-50 text-gray-700' },
];

/**
 * Dialog que pide el motivo de un cambio de fecha de entrega.
 * Se usa cuando el usuario reagenda una tarea o subtarea.
 *
 * Uso:
 *   const [pending, setPending] = useState<{ newDate: string | null } | null>(null);
 *   ...
 *   <RescheduleDialog
 *     open={!!pending}
 *     fechaAnterior={...}
 *     fechaNueva={pending?.newDate}
 *     onConfirm={(motivo, comentario) => { aplicarCambio(pending.newDate, motivo, comentario); setPending(null); }}
 *     onCancel={() => setPending(null)}
 *   />
 */
export function RescheduleDialog({
  open,
  fechaAnterior,
  fechaNueva,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  fechaAnterior: string | null;
  fechaNueva: string | null;
  onConfirm: (motivo: MotivoReschedule, comentario: string) => void;
  onCancel: () => void;
}) {
  const [motivo, setMotivo] = useState<MotivoReschedule | null>(null);
  const [comentario, setComentario] = useState('');

  const fmt = (s: string | null) => {
    if (!s) return 'Sin fecha';
    try { return new Date(s + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }); }
    catch { return s; }
  };

  const handleConfirm = () => {
    if (!motivo) return;
    onConfirm(motivo, comentario.trim());
    setMotivo(null);
    setComentario('');
  };

  const handleCancel = () => {
    setMotivo(null);
    setComentario('');
    onCancel();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleCancel(); }}>
      <DialogContent className="max-w-md" aria-describedby="reschedule-desc">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            ¿Por qué se mueve la fecha?
          </DialogTitle>
          <DialogDescription id="reschedule-desc">
            {fmt(fechaAnterior)} <span className="mx-1">→</span> <strong>{fmt(fechaNueva)}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Motivo *</Label>
            <div className="grid grid-cols-1 gap-1.5">
              {MOTIVO_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setMotivo(opt.value)}
                  className={cn(
                    'flex items-start gap-2 p-2.5 rounded-lg border text-left transition-all',
                    motivo === opt.value ? cn(opt.color, 'ring-2 ring-offset-1') : 'border-border hover:bg-muted/50'
                  )}
                >
                  <div className="flex-1">
                    <div className="text-sm font-medium flex items-center gap-1.5">
                      {opt.label}
                      {!opt.cuenta && (
                        <span className="text-[9px] font-normal px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200">
                          no afecta cumplimiento
                        </span>
                      )}
                      {opt.cuenta && (
                        <span className="text-[9px] font-normal px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">
                          cuenta como atraso
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground">{opt.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Comentario (opcional)</Label>
            <Textarea
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              placeholder="Detalle del motivo..."
              rows={2}
              maxLength={500}
              className="text-sm resize-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={handleCancel}>Cancelar</Button>
            <Button onClick={handleConfirm} disabled={!motivo}>Confirmar cambio</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
