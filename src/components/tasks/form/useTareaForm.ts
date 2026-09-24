import { useEffect, useMemo, useState } from 'react';
import * as api from '@/lib/apiClient';
import type { DriveFile } from '@/lib/apiClient';
import type { UploadedFile } from '@/components/tasks/FileUploader';
import {
  horasEstimadas, valoresDeTarea, valoresNuevos,
  type Recordados, type TareaEditable, type TareaFormValues,
} from '@/lib/tareaForm';
import type { Opcion, Persona, TipoEntregable } from './useCatalogosTarea';

export const CLAVE_RECORDADOS = 'nueva_tarea_defaults';

function leerRecordados(): Recordados {
  try { return JSON.parse(localStorage.getItem(CLAVE_RECORDADOS) || '{}'); } catch { return {}; }
}

interface Opciones {
  tarea?: TareaEditable | null;
  prellenado?: Partial<TareaFormValues>;
  mesaPorDefecto?: string;
  deliverableTypes: TipoEntregable[];
}

/** State of one open task form: values, the chosen desk's team and brands, estimated hours and pending attachments. */
export function useTareaForm({ tarea, prellenado, mesaPorDefecto, deliverableTypes }: Opciones) {
  const [valores, setValores] = useState<TareaFormValues>(() =>
    tarea ? valoresDeTarea(tarea) : valoresNuevos({ recordados: leerRecordados(), mesaPorDefecto, prellenado }));
  const cambiar = (parcial: Partial<TareaFormValues>) => setValores((prev) => ({ ...prev, ...parcial }));

  // The desk decides who can be responsible and which brands are allowed.
  const [deskMembers, setDeskMembers] = useState<Persona[]>([]);
  const [deskBrands, setDeskBrands] = useState<Opcion[] | null>(null);
  useEffect(() => {
    const deskId = valores.desk_id;
    if (!deskId) { setDeskMembers([]); setDeskBrands(null); return; }
    let vigente = true;
    api.getProfiles(deskId)
      .then((data) => { if (vigente) setDeskMembers(Array.isArray(data) ? data : []); })
      .catch(() => { if (vigente) setDeskMembers([]); });
    api.getDeskBrands(deskId)
      .then((data) => {
        if (!vigente) return;
        const list: Opcion[] = Array.isArray(data) ? data : [];
        if (list.length === 0) { setDeskBrands(null); return; }
        setDeskBrands(list);
        setValores((prev) => (prev.brand_id && !list.some((b) => b.id === prev.brand_id) ? { ...prev, brand_id: '' } : prev));
      })
      .catch(() => { if (vigente) setDeskBrands(null); });
    return () => { vigente = false; };
  }, [valores.desk_id]);

  const cambiarMesa = (deskId: string) => cambiar({ desk_id: deskId, responsable_user_id: '', responsable_ids: [] });

  // Estimated hours follow the deliverable types until someone types them by hand.
  const [estimadoManual, setEstimadoManual] = useState(() => tarea?.estimated_hours != null && Number(tarea.estimated_hours) > 0);
  const estimadoAuto = useMemo(() => horasEstimadas(valores.entregables, deliverableTypes), [valores.entregables, deliverableTypes]);
  useEffect(() => {
    if (estimadoManual || estimadoAuto == null) return;
    const v = String(estimadoAuto);
    setValores((prev) => (prev.estimated_hours === v ? prev : { ...prev, estimated_hours: v }));
  }, [estimadoAuto, estimadoManual]);

  // Attachments of a new task are kept here and attached once the task exists.
  const [archivos, setArchivos] = useState<UploadedFile[]>([]);
  const [archivosDrive, setArchivosDrive] = useState<DriveFile[]>([]);
  const [camposPersonalizados, setCamposPersonalizados] = useState<Record<string, unknown>>({});

  return {
    valores, cambiar, cambiarMesa, deskMembers, deskBrands,
    estimadoAuto, estimadoManual, setEstimadoManual,
    archivos, setArchivos, archivosDrive, setArchivosDrive, camposPersonalizados, setCamposPersonalizados,
  };
}

export type TareaFormState = ReturnType<typeof useTareaForm>;
