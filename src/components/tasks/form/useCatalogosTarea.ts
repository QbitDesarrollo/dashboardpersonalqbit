import { useEffect, useState } from 'react';
import * as api from '@/lib/apiClient';

export interface Opcion { id: string; nombre: string }
export interface Persona extends Opcion { email?: string | null; department_id?: string | null }
export interface TipoEntregable extends Opcion { minutos_estimados?: number | null }

export interface CatalogosTarea {
  brands: Opcion[];
  desks: Opcion[];
  users: Persona[];
  taskTypes: Opcion[];
  deliverableTypes: TipoEntregable[];
}

const activos = <T,>(data: unknown): T[] =>
  (Array.isArray(data) ? data : []).filter((x: { activo?: unknown }) => x.activo !== 0 && x.activo !== false);

/** Lists the task form chooses from. Loaded when the form opens. */
export function useCatalogosTarea(): CatalogosTarea {
  const [catalogos, setCatalogos] = useState<CatalogosTarea>({ brands: [], desks: [], users: [], taskTypes: [], deliverableTypes: [] });

  useEffect(() => {
    let vigente = true;
    Promise.all([api.getBrands(), api.getDesks(), api.getProfiles(), api.getTaskTypes(), api.getDeliverableTypes()])
      .then(([brands, desks, users, taskTypes, deliverableTypes]) => {
        if (!vigente) return;
        setCatalogos({
          brands: activos(brands),
          desks: activos(desks),
          users: Array.isArray(users) ? users : [],
          taskTypes: activos(taskTypes),
          deliverableTypes: activos(deliverableTypes),
        });
      })
      .catch(() => {});
    return () => { vigente = false; };
  }, []);

  return catalogos;
}
