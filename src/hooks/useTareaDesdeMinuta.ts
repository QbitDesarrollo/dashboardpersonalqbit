import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { vincularTarea } from '@/lib/minutasApi';
import { leerPrefillNuevaTarea, type PrefillNuevaTarea } from '@/lib/tareaDesdePunto';

const PARAMS = ['nueva', 'brand_id', 'project_id', 'titulo', 'detalle', 'fecha_entrega', 'minuta_item', 'volver'];

/**
 * "Nueva tarea" desde un punto de minuta (ver lib/tareaDesdePunto.ts).
 * Abre el formulario de Tareas prellenado y, cuando la tarea se crea,
 * la vincula al punto y vuelve a la minuta.
 */
export function useTareaDesdeMinuta(abrirFormulario: (form: PrefillNuevaTarea['form']) => void) {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const vinculo = useRef<{ minutaItemId: string | null; volver: string | null } | null>(null);
  const abrir = useRef(abrirFormulario);
  abrir.current = abrirFormulario;

  useEffect(() => {
    const prefill = leerPrefillNuevaTarea(searchParams);
    if (!prefill) return;
    vinculo.current = { minutaItemId: prefill.minutaItemId, volver: prefill.volver };
    abrir.current(prefill.form);
    // Se limpian para que recargar la página no vuelva a abrir el formulario.
    setSearchParams((actual) => {
      const siguiente = new URLSearchParams(actual);
      PARAMS.forEach((k) => siguiente.delete(k));
      return siguiente;
    }, { replace: true });
  }, [searchParams, setSearchParams]);

  const alCrearTarea = async (taskId: string) => {
    const v = vinculo.current;
    if (!v) return;
    vinculo.current = null;
    if (v.minutaItemId) {
      try {
        await vincularTarea(v.minutaItemId, taskId);
        toast.success('Tarea vinculada al punto de la minuta');
      } catch {
        toast.error('La tarea se creó, pero no se pudo vincular al punto. Vincúlala desde la minuta.');
      }
    }
    if (v.volver) navigate(v.volver);
  };

  const cancelar = () => { vinculo.current = null; };

  return { alCrearTarea, cancelar };
}
