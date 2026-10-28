import { useEffect, useState } from 'react';
import { User } from 'lucide-react';
import { getTeamLiveStatus } from '@/lib/apiClient';
import { estadoResponsable, type ResponsableVivo } from '@/lib/miDia';
import { formatTime } from '@/lib/dashboardDatos';
import type { metricasResponsables } from '@/lib/dashboardSeleccion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getInitials } from '@/lib/utils';

export function ResponsablesEstado({ metricas, autorizado, userId }: { metricas: ReturnType<typeof metricasResponsables>; autorizado: boolean; userId?: string }) {
  const [personas, setPersonas] = useState<ResponsableVivo[]>([]);
  useEffect(() => {
    setPersonas([]);
    if (!autorizado || !userId) return;
    let vivo = true, cargando = false;
    const cargar = async () => {
      if (cargando) return;
      cargando = true;
      try {
        const datos: { users: ResponsableVivo[] } = await getTeamLiveStatus();
        if (vivo) setPersonas(datos.users);
      } catch { if (vivo) setPersonas([]); }
      finally { cargando = false; }
    };
    void cargar();
    const timer = setInterval(() => void cargar(), 60000);
    return () => { vivo = false; clearInterval(timer); };
  }, [autorizado, userId]);
  return <Card className="glass-card">
    <CardHeader className="pb-2 sm:pb-4"><div className="flex items-center gap-2">
      <User className="h-4 w-4 sm:h-5 sm:w-5 text-primary" /><CardTitle className="text-base sm:text-lg">Métricas por Responsable</CardTitle>
    </div></CardHeader>
    <CardContent><div className="space-y-2 sm:space-y-3">
      {metricas.length === 0 ? <p className="text-center text-muted-foreground py-4 text-sm">No hay datos</p> : metricas.slice(0, 5).map(metric => {
        const estado = autorizado ? estadoResponsable(personas.find(p => p.user_id === metric.id)) : null;
        return <div key={metric.id} className="flex items-center justify-between gap-2 p-2 sm:p-3 rounded-lg bg-muted/50">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <Avatar className="h-7 w-7 sm:h-8 sm:w-8 shrink-0">
              {metric.avatar_url && <AvatarImage src={metric.avatar_url} alt={metric.nombre} className="object-cover" />}
              <AvatarFallback className="bg-primary/20 text-primary text-xs font-semibold">{getInitials(metric.nombre)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="font-medium text-foreground text-sm sm:text-base truncate">{metric.nombre}</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground">{metric.completadas}/{metric.total} completadas</p>
              {estado && <p className="flex items-center gap-1 text-[11px] text-muted-foreground" title={estado}>
                <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full shrink-0 ${estado.startsWith('Trabajando') ? 'bg-emerald-500' : estado.startsWith('En reunión') ? 'bg-violet-500' : 'bg-muted-foreground'}`} /><span className="truncate">{estado}</span>
              </p>}
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-4 text-xs sm:text-sm shrink-0">
            <div className="text-center"><p className="font-semibold text-foreground">{metric.entregables}</p><p className="text-[10px] sm:text-xs text-muted-foreground hidden sm:block">Entregables</p></div>
            <div className="text-center"><p className="font-semibold text-foreground">{formatTime(metric.tiempoTotal)}</p><p className="text-[10px] sm:text-xs text-muted-foreground hidden sm:block">Tiempo</p></div>
          </div>
        </div>;
      })}
    </div></CardContent>
  </Card>;
}
