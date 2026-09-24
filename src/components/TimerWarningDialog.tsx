import { useEffect, useState } from 'react';
import { Clock, AlertTriangle } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

/**
 * Modal global (en vez del window.confirm nativo feo) para los avisos del timer.
 * useTaskTimer dispara:
 *  - 'timer:warning'      -> lleva muchas horas activo (cada 2h)  { horas, onPause }
 *  - 'timer:overestimate' -> superó las horas estimadas de la tarea { estimadas, trabajadas, onPause }
 * Solo hay un timer activo a la vez, así que un único modal global alcanza.
 */
type WarnState =
  | { kind: 'largo'; horas: number; titulo: string | null; onPause: () => void }
  | { kind: 'estimado'; estimadas: number; trabajadas: number; titulo: string | null; onPause: () => void };

export function TimerWarningDialog() {
  const [state, setState] = useState<WarnState | null>(null);

  useEffect(() => {
    const onWarn = (e: Event) => {
      const d = (e as CustomEvent).detail as { horas: number; titulo?: string | null; onPause: () => void };
      setState({ kind: 'largo', horas: d.horas, titulo: d.titulo || null, onPause: d.onPause });
    };
    const onOver = (e: Event) => {
      const d = (e as CustomEvent).detail as { estimadas: number; trabajadas: number; titulo?: string | null; onPause: () => void };
      setState({ kind: 'estimado', estimadas: d.estimadas, trabajadas: d.trabajadas, titulo: d.titulo || null, onPause: d.onPause });
    };
    window.addEventListener('timer:warning', onWarn);
    window.addEventListener('timer:overestimate', onOver);
    return () => {
      window.removeEventListener('timer:warning', onWarn);
      window.removeEventListener('timer:overestimate', onOver);
    };
  }, []);

  const isEstimado = state?.kind === 'estimado';

  return (
    <AlertDialog open={!!state} onOpenChange={(o) => { if (!o) setState(null); }}>
      <AlertDialogContent>
        {/* min-w-0: the dialog is a CSS grid; without it a long line widens the column past the border. */}
        <AlertDialogHeader className="min-w-0">
          <AlertDialogTitle className="flex items-center gap-2">
            {isEstimado ? (
              <><AlertTriangle className="h-5 w-5 text-destructive" />Pasaste las horas estimadas</>
            ) : (
              <><Clock className="h-5 w-5 text-amber-500" />Timer activo hace {state?.kind === 'largo' ? state.horas : 0}h</>
            )}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {state?.titulo && (
              <span className="block mb-1.5 font-medium text-foreground break-words line-clamp-2" title={state.titulo}>Tarea: {state.titulo}</span>
            )}
            {isEstimado && state?.kind === 'estimado' ? (
              <>Esta tarea estaba estimada en <strong>{state.estimadas}h</strong> y ya llevas <strong>{state.trabajadas}h</strong> trabajadas.
              Revisa si necesitas replantear el alcance, avisar de un atraso o pausar el timer.</>
            ) : (
              <>Llevas <strong>{state?.kind === 'largo' ? state.horas : 0} horas</strong> con esta tarea activa. ¿Sigues trabajando en ella?
              Si te olvidaste de pausar, puedes detener el timer ahora.</>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => { state?.onPause(); setState(null); }}>
            Pausar el timer
          </AlertDialogCancel>
          <AlertDialogAction onClick={() => setState(null)}>
            {isEstimado ? 'Entendido, sigo' : 'Sí, sigo trabajando'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
