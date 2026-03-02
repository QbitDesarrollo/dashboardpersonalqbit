import { useEffect, useState } from 'react';
import * as api from '@/lib/apiClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Timer, User, Building2, CheckSquare, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

const formatTime = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

const CHART_COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--info))',
  'hsl(var(--success))',
  'hsl(var(--warning))',
  'hsl(var(--destructive))',
  'hsl(220, 70%, 50%)',
  'hsl(280, 70%, 50%)',
];

export default function TimeTracking() {
  const [data, setData] = useState<Awaited<ReturnType<typeof api.getTimeAnalytics>> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const res = await api.getTimeAnalytics();
        setData(res);
      } catch (e) {
        console.error(e);
        toast.error('Error al cargar analytics');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const total = data?.total_seconds ?? 0;
  const byUser = data?.by_user ?? [];
  const byBrand = data?.by_brand ?? [];
  const topTasks = data?.top_tasks ?? [];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Tiempo registrado</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Analítica de tiempo trabajado por responsable, marca y tarea
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="p-4 rounded-xl bg-primary/10">
              <Timer className="h-10 w-10 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Tiempo total registrado</p>
              <p className="text-3xl font-bold text-foreground">{formatTime(total)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <User className="h-4 w-4" />
              Por responsable
            </CardTitle>
          </CardHeader>
          <CardContent>
            {byUser.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Sin datos</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={byUser} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" tickFormatter={(v) => formatTime(v)} fontSize={11} />
                  <YAxis dataKey="user_name" type="category" width={100} fontSize={11} tickFormatter={(v) => (v?.length > 12 ? v.slice(0, 12) + '…' : v)} />
                  <Tooltip formatter={(v: number) => formatTime(v)} labelFormatter={(_, payload) => payload[0]?.payload?.user_name} />
                  <Bar dataKey="total_seconds" radius={[0, 4, 4, 0]}>
                    {byUser.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-4 w-4" />
              Por marca
            </CardTitle>
          </CardHeader>
          <CardContent>
            {byBrand.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Sin datos</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={byBrand} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" tickFormatter={(v) => formatTime(v)} fontSize={11} />
                  <YAxis dataKey="brand_name" type="category" width={100} fontSize={11} tickFormatter={(v) => (v?.length > 12 ? v.slice(0, 12) + '…' : v)} />
                  <Tooltip formatter={(v: number) => formatTime(v)} labelFormatter={(_, payload) => payload[0]?.payload?.brand_name} />
                  <Bar dataKey="total_seconds" radius={[0, 4, 4, 0]}>
                    {byBrand.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[(i + 2) % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckSquare className="h-4 w-4" />
            Tareas con más tiempo
          </CardTitle>
        </CardHeader>
        <CardContent>
          {topTasks.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Sin datos. Usa el timer en las tareas para registrar tiempo.</p>
          ) : (
            <div className="space-y-2">
              {topTasks.map((task) => (
                <Link
                  key={task.id}
                  to={`/tareas?task=${task.id}`}
                  className={cn(
                    'flex items-center justify-between p-3 rounded-lg',
                    'hover:bg-muted/50 transition-colors'
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{task.titulo_tarea}</p>
                    <p className="text-xs text-muted-foreground">
                      {task.brand_name && `${task.brand_name} · `}
                      {task.resp_name || 'Sin asignar'}
                    </p>
                  </div>
                  <span className="font-mono text-sm font-medium shrink-0 ml-3">
                    {formatTime(task.total_seconds)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
