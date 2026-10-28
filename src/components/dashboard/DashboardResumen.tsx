import type { ReactNode } from 'react';
import type { Task } from '@/lib/dashboardDatos';
import type { MostrarTareas } from '@/lib/dashboardSeleccion';
import { DashboardUrgentes } from './DashboardUrgentes';
import { DashboardProgreso } from './DashboardProgreso';

interface Props {
  tareas: Task[];
  personas: { id: string; nombre: string }[];
  isEquipo: boolean;
  onMostrar: MostrarTareas;
  onAbrir: (id: string) => void;
  tuDia?: ReactNode;
  reuniones?: ReactNode;
}
/** Shared layout; T10 can supply the day and meetings slots without duplicating role views. */
export function DashboardResumen({ tareas, personas, isEquipo, onMostrar, onAbrir, tuDia, reuniones }: Props) {
  return <>
    {tuDia}
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-12 sm:gap-6">
      <div className="min-w-0 lg:col-span-7"><DashboardUrgentes tareas={tareas} personas={personas} isEquipo={isEquipo} onAbrir={onAbrir} /></div>
      <div className="min-w-0 lg:col-span-5">{reuniones}</div>
    </div>
    <DashboardProgreso tareas={tareas} isEquipo={isEquipo} onMostrar={onMostrar} />
  </>;
}
