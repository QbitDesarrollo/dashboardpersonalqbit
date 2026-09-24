import { toast } from 'sonner';
import * as api from '@/lib/apiClient';
import type { DriveFile } from '@/lib/apiClient';
import { sendTaskNotification } from '@/lib/api';
import type { UploadedFile } from '@/components/tasks/FileUploader';
import { recordables, type PayloadTarea, type TareaFormValues } from '@/lib/tareaForm';
import type { CatalogosTarea } from './useCatalogosTarea';
import { CLAVE_RECORDADOS } from './useTareaForm';

type Payload = PayloadTarea & { motivo_reschedule?: string; comentario_reschedule?: string | null };

function camposConValor(campos: Record<string, unknown>) {
  return Object.entries(campos).filter(([, v]) => v !== '' && v != null).map(([field_id, value]) => ({ field_id, value }));
}

export async function actualizarTarea(id: string, payload: Payload, camposPersonalizados: Record<string, unknown>) {
  const result: { error?: string } = await api.patchTask(id, payload);
  if (result?.error) throw new Error(result.error);
  const campos = camposConValor(camposPersonalizados);
  if (campos.length > 0) await api.saveTaskCustomFields(id, campos).catch(() => {});
  toast.success('Tarea actualizada');
}

/** Creates the task and then everything that hangs from it: files, Drive files, custom fields and the email to the responsible. */
export async function crearTarea({ payload, valores, archivos, archivosDrive, camposPersonalizados, catalogos }: {
  payload: Payload;
  valores: TareaFormValues;
  archivos: UploadedFile[];
  archivosDrive: DriveFile[];
  camposPersonalizados: Record<string, unknown>;
  catalogos: CatalogosTarea;
}): Promise<string> {
  const creada: { id?: string; error?: string } = await api.createTask(payload);
  if (creada?.error) throw new Error(creada.error);
  const id = creada.id as string;

  if (archivos.length > 0 && id) {
    try { await api.assignFilesToTask(archivos.map((f) => f.id), id); } catch { /* silent */ }
  }
  if (id) {
    for (const df of archivosDrive) {
      try { await api.attachDriveFile(id, df); } catch { /* silent */ }
    }
    const campos = camposConValor(camposPersonalizados);
    if (campos.length > 0) await api.saveTaskCustomFields(id, campos).catch(() => {});
  }

  toast.success('Tarea creada');
  try { localStorage.setItem(CLAVE_RECORDADOS, JSON.stringify(recordables(valores))); } catch { /* storage unavailable */ }

  await avisarAlResponsable(id, valores, catalogos);
  return id;
}

async function avisarAlResponsable(taskId: string, valores: TareaFormValues, { users, brands }: CatalogosTarea) {
  if (!valores.responsable_user_id) return;
  const responsable = users.find((u) => u.id === valores.responsable_user_id);
  if (!responsable?.email) return;
  try {
    await sendTaskNotification({
      taskId,
      taskTitle: valores.titulo_tarea,
      brandName: brands.find((b) => b.id === valores.brand_id)?.nombre || 'Sin marca',
      fechaEntrega: valores.fecha_entrega,
      prioridad: valores.prioridad,
      recipientEmail: responsable.email,
      recipientName: responsable.nombre,
      detalle: valores.detalle || undefined,
      fechaInicio: valores.fecha_inicio || undefined,
      archivosAdjuntos: valores.enlaces ? valores.enlaces.split('\n').filter(Boolean) : undefined,
    });
    toast.success('Notificación enviada al responsable');
  } catch (emailError) {
    console.error('Error sending email:', emailError);
    toast.info('Tarea creada, pero no se pudo enviar la notificación por email');
  }
}
