import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

export function TasksByUser({ data }: { data: { user_name: string; count: number }[] }) {
  const chartData = data.map(d => ({ name: d.user_name?.split(' ')[0] || '?', count: Number(d.count) }));
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={chartData} layout="vertical">
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
        <YAxis dataKey="name" type="category" width={70} tick={{ fontSize: 11 }} />
        <Tooltip />
        <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
