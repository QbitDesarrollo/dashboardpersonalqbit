import { useEffect, useState } from 'react';
import * as api from '@/lib/apiClient';
import { cargarTareasDashboard } from '@/lib/dashboardCarga';
import type { Task } from '@/lib/dashboardDatos';

interface Catalogo { id: string; nombre: string; activo?: boolean | number; avatar_url?: string | null }
export interface ActivityEntry {
  id: string; user_id: string; user_nombre: string; entity_type: string; entity_id: string; action: string;
  field_name?: string; old_value?: string; new_value?: string; created_at: string;
}
const vacio = { tasks: [] as Task[], profiles: [] as Catalogo[], brands: [] as Catalogo[], desks: [] as Catalogo[], recentActivity: [] as ActivityEntry[] };

/** No partial dashboard after a failed page, and no old user's response after a session change. */
export function useDashboardDatos(userId: string | undefined, verActividad: boolean) {
  const [datos, setDatos] = useState(vacio);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!userId) return;
    let vigente = true;
    setLoading(true); setError(null); setDatos(vacio);
    const cargar = async () => {
      try {
        const [tasks, profiles, brands, desks, recentActivity] = await Promise.all([
          cargarTareasDashboard(async (opciones) => {
            const r = await api.getTasks(opciones); return { tasks: r.tasks as Task[], total: r.total };
          }, () => vigente),
          api.getProfiles(), api.getBrands(), api.getDesks(), verActividad ? api.getRecentActivity(20) : Promise.resolve([]),
        ]);
        if (!vigente) return;
        const activos = (xs: unknown): Catalogo[] => Array.isArray(xs) ? (xs as Catalogo[]).filter((x) => x.activo) : [];
        setDatos({ tasks, profiles: activos(profiles), brands: activos(brands), desks: activos(desks),
          recentActivity: Array.isArray(recentActivity) ? recentActivity as ActivityEntry[] : [] });
      } catch {
        if (vigente) setError('No se pudieron cargar todos los datos del dashboard. Intenta de nuevo.');
      } finally { if (vigente) setLoading(false); }
    };
    void cargar();
    return () => { vigente = false; };
  }, [userId, verActividad, revision]);
  return { ...datos, loading, error, reintentar: () => setRevision((n) => n + 1) };
}
