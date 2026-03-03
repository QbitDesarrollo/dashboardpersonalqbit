import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const PRIORITY_COLORS: Record<string, string> = { alta: '#ef4444', media: '#f59e0b', baja: '#10b981' };
const PRIORITY_LABELS: Record<string, string> = { alta: 'Alta', media: 'Media', baja: 'Baja' };

export function TaskCountByPriority({ data }: { data: { prioridad: string; count: number }[] }) {
  const chartData = data.map(d => ({ name: PRIORITY_LABELS[d.prioridad] || d.prioridad, value: Number(d.count), key: d.prioridad }));
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={chartData}>
        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
        <Tooltip />
        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
          {chartData.map((entry) => <Cell key={entry.key} fill={PRIORITY_COLORS[entry.key] || '#94a3b8'} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
