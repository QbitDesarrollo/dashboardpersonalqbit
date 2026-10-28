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
    <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-12 sm:gap-6">
      {/* Bound the urgent card's existing header / content, then filters / list / footer. */}
      <div className="min-w-0 lg:col-span-7 lg:h-[520px]
        lg:[&>.glass-card]:h-full lg:[&>.glass-card]:grid lg:[&>.glass-card]:grid-rows-[auto_minmax(0,1fr)]
        lg:[&>.glass-card>div:last-child]:grid lg:[&>.glass-card>div:last-child]:grid-rows-[auto_minmax(0,1fr)_auto]
        lg:[&_.overflow-y-auto]:max-h-none"><DashboardUrgentes tareas={tareas} personas={personas} isEquipo={isEquipo} onAbrir={onAbrir} /></div>
      <div className="min-w-0 lg:col-span-5">{reuniones}</div>
    </div>
    <DashboardProgreso tareas={tareas} isEquipo={isEquipo} onMostrar={onMostrar} />
  </>;
}
