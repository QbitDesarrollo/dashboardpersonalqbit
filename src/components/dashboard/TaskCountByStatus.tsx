import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

const STATUS_COLORS: Record<string, string> = {
  backlog: '#6b7280',
  en_proceso: '#3b82f6',
  en_revision: '#f59e0b',
  aprobado: '#10b981',
  entregado: '#8b5cf6',
  bloqueado: '#ef4444',
};
const STATUS_LABELS: Record<string, string> = {
  backlog: 'Backlog',
  en_proceso: 'En Proceso',
  en_revision: 'En Revisión',
  aprobado: 'Aprobado',
  entregado: 'Entregado',
  bloqueado: 'Bloqueado',
};

export function TaskCountByStatus({ data }: { data: { estado: string; count: number }[] }) {
  const chartData = data.map(d => ({ name: STATUS_LABELS[d.estado] || d.estado, value: Number(d.count), key: d.estado }));
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, value }) => `${name}: ${value}`}>
          {chartData.map((entry) => <Cell key={entry.key} fill={STATUS_COLORS[entry.key] || '#94a3b8'} />)}
        </Pie>
        <Tooltip />
      </PieChart>
    </ResponsiveContainer>
  );
}
