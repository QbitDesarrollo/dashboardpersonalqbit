import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RescheduleDialog, type MotivoReschedule } from '@/components/tasks/RescheduleDialog';
import { armarPayload, cambioDeFecha, validarEntregables, type PayloadTarea, type TareaEditable, type TareaFormValues } from '@/lib/tareaForm';
import { CamposAdjuntos } from './CamposAdjuntos';
import { CamposEntregables } from './CamposEntregables';
import { CamposPlanificacion } from './CamposPlanificacion';
import { CamposPrincipales } from './CamposPrincipales';
import { AvisoDuplicadas } from './AvisoDuplicadas';
import { actualizarTarea, crearTarea } from './guardarTarea';
import { useCatalogosTarea } from './useCatalogosTarea';
import { useTareaForm } from './useTareaForm';

export type TareaParaEditar = TareaEditable & { id: string; client_board_id?: string | null };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Task to edit. Without it the dialog creates a new task. */
  tarea?: TareaParaEditar | null;
  /** Values a new task starts with (e.g. from a minuta point). They win over the remembered selection. */
  prellenado?: Partial<TareaFormValues>;
  /** Desk preselected for a new task (the page's desk filter). */
  mesaPorDefecto?: string;
  puedeEditarArchivos?: boolean;
  /** Called after saving, before the dialog closes. */
  onGuardada?: (resultado: { id: string; creada: boolean }) => void;
}

/** Create/edit task dialog shared by every screen that creates tasks. */
export function TaskFormDialog({ open, onOpenChange, tarea, ...resto }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{tarea ? 'Editar Tarea' : 'Nueva Tarea'}</DialogTitle>
          <DialogDescription>{tarea ? 'Modifica los datos de la tarea.' : 'Crea una nueva tarea con marca, responsable y fechas.'}</DialogDescription>
        </DialogHeader>
        {/* Mounted on every open, so each opening starts from fresh values. */}
        {open && <FormularioTarea tarea={tarea} onCerrar={() => onOpenChange(false)} {...resto} />}
      </DialogContent>
    </Dialog>
  );
}

type Pendiente = { payload: PayloadTarea; oldFecha: string | null; newFecha: string | null };

function FormularioTarea({ tarea, prellenado, mesaPorDefecto, puedeEditarArchivos = true, onGuardada, onCerrar }: Omit<Props, 'open' | 'onOpenChange'> & { onCerrar: () => void }) {
  const catalogos = useCatalogosTarea();
  const form = useTareaForm({ tarea, prellenado, mesaPorDefecto, deliverableTypes: catalogos.deliverableTypes });
  const [guardando, setGuardando] = useState(false);
  const [reagenda, setReagenda] = useState<Pendiente | null>(null);
  const conFechaCliente = !!tarea?.client_board_id;

  const guardar = async (payload: Parameters<typeof actualizarTarea>[1]) => {
    setGuardando(true);
    try {
      if (tarea) {
        await actualizarTarea(tarea.id, payload, form.camposPersonalizados);
        onGuardada?.({ id: tarea.id, creada: false });
      } else {
        const id = await crearTarea({
          payload, valores: form.valores, archivos: form.archivos, archivosDrive: form.archivosDrive,
          camposPersonalizados: form.camposPersonalizados, catalogos,
        });
        onGuardada?.({ id, creada: true });
      }
      onCerrar();
    } catch (error) {
      toast.error('Error al guardar', { description: error instanceof Error ? error.message : String(error) });
    } finally {
      setGuardando(false);
    }
  };

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    const invalido = validarEntregables(form.valores.entregables);
    if (invalido) { toast.error(invalido.titulo, { description: invalido.descripcion }); return; }
    const payload = armarPayload(form.valores, { conFechaCliente });
    // Moving the due date of an existing task needs a reason first.
    const cambio = tarea ? cambioDeFecha(tarea.fecha_entrega, form.valores.fecha_entrega) : null;
    if (cambio) { setReagenda({ payload, ...cambio }); return; }
    await guardar(payload);
  };

  return (
    <>
      <form onSubmit={enviar} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <CamposPrincipales form={form} catalogos={catalogos} />
          {!tarea && <AvisoDuplicadas titulo={form.valores.titulo_tarea} brandId={form.valores.brand_id} />}
          <CamposEntregables form={form} tipos={catalogos.deliverableTypes} />
          <CamposPlanificacion form={form} tipos={catalogos.deliverableTypes} conFechaCliente={conFechaCliente} />
          <CamposAdjuntos form={form} taskId={tarea?.id} puedeEditarArchivos={puedeEditarArchivos} />
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="outline" onClick={onCerrar}>Cancelar</Button>
          <Button type="submit" disabled={guardando}>
            {guardando && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {tarea ? 'Guardar Cambios' : 'Crear Tarea'}
          </Button>
        </div>
      </form>

      <RescheduleDialog
        open={!!reagenda}
        fechaAnterior={reagenda?.oldFecha ?? null}
        fechaNueva={reagenda?.newFecha ?? null}
        onConfirm={async (motivo: MotivoReschedule, comentario: string) => {
          if (!reagenda) return;
          const payload = { ...reagenda.payload, motivo_reschedule: motivo, comentario_reschedule: comentario || null };
          setReagenda(null);
          await guardar(payload);
        }}
        onCancel={() => setReagenda(null)}
      />
    </>
  );
}
