import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

/**
 * Modal global (en vez del window.confirm nativo feo) para el aviso de timer largo.
 * useTaskTimer dispara el evento 'timer:warning' con { horas, onPause } cada 2h.
 * Solo hay un timer activo a la vez, así que un único modal global alcanza.
 */
export function TimerWarningDialog() {
  const [state, setState] = useState<{ horas: number; onPause: () => void } | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { horas: number; onPause: () => void };
      setState({ horas: detail.horas, onPause: detail.onPause });
    };
    window.addEventListener('timer:warning', handler);
    return () => window.removeEventListener('timer:warning', handler);
  }, []);

  return (
    <AlertDialog open={!!state} onOpenChange={(o) => { if (!o) setState(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-amber-500" />
            Timer activo hace {state?.horas ?? 0}h
          </AlertDialogTitle>
          <AlertDialogDescription>
            Llevas <strong>{state?.horas ?? 0} horas</strong> con esta tarea activa. ¿Sigues trabajando en ella?
            Si te olvidaste de pausar, puedes detener el timer ahora.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => { state?.onPause(); setState(null); }}>
            Pausar el timer
          </AlertDialogCancel>
          <AlertDialogAction onClick={() => setState(null)}>
            Sí, sigo trabajando
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
