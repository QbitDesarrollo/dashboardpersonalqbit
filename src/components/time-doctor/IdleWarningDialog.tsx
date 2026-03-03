import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

interface IdleWarningDialogProps {
  open: boolean;
  idleMinutes: number;
  onDismiss: () => void;
  onPause: () => void;
}

export function IdleWarningDialog({ open, idleMinutes, onDismiss, onPause }: IdleWarningDialogProps) {
  return (
    <Dialog open={open} onOpenChange={() => onDismiss()}>
      <DialogContent aria-describedby="idle-warn-desc">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-600">
            <AlertTriangle className="h-5 w-5" />
            Inactividad detectada
          </DialogTitle>
          <DialogDescription id="idle-warn-desc">
            Llevas {idleMinutes} minutos sin actividad y tu timer sigue corriendo.
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onPause}>Pausar timer</Button>
          <Button onClick={onDismiss}>Sigo trabajando</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
