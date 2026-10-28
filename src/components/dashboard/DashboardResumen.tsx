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
/** Jornada personal y agenda comparten fila; los indicadores de tareas reciben el alcance filtrado. */
export function DashboardResumen({ tareas, personas, isEquipo, onMostrar, onAbrir, tuDia, reuniones }: Props) {
  return <>
    <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-12 sm:gap-6">
      <div className="min-w-0 lg:col-span-8">{tuDia}</div>
      <div className="min-w-0 lg:col-span-4">{reuniones}</div>
    </div>
    <DashboardUrgentes tareas={tareas} personas={personas} isEquipo={isEquipo} onAbrir={onAbrir} />
    <DashboardProgreso tareas={tareas} isEquipo={isEquipo} onMostrar={onMostrar} />
  </>;
}
