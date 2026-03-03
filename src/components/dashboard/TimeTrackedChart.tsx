import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

export function TimeTrackedChart({ data }: { data: { user_name: string; total_seconds: number }[] }) {
  const chartData = data.map(d => ({ name: d.user_name?.split(' ')[0] || '?', hours: Number((Number(d.total_seconds) / 3600).toFixed(1)) }));
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={chartData} layout="vertical">
        <XAxis type="number" tick={{ fontSize: 11 }} />
        <YAxis dataKey="name" type="category" width={70} tick={{ fontSize: 11 }} />
        <Tooltip formatter={(value: number) => [`${value}h`, 'Horas']} />
        <Bar dataKey="hours" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
