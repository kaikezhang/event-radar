import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

interface FilterBreakdownChartProps {
  breakdown: Record<string, number>;
}

const COLORS = [
  '#ff4444', '#ffaa00', '#4488ff', '#aa66ff',
  '#00ff88', '#ff6688', '#44ddff', '#ffcc44',
  '#88ff44', '#ff44aa',
];

export function FilterBreakdownChart({ breakdown }: FilterBreakdownChartProps) {
  const data = Object.entries(breakdown)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  if (data.length === 0) {
    return <div className="py-8 text-center text-sm text-radar-text-muted">No filter data</div>;
  }

  return (
    <div className="flex items-center gap-4">
      <div className="h-48 w-48 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={40}
              outerRadius={70}
              dataKey="value"
              stroke="#0a0a0a"
              strokeWidth={2}
            >
              {data.map((_, index) => (
                <Cell key={index} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: '#111111',
                border: '1px solid #1e1e1e',
                borderRadius: '8px',
                fontSize: '12px',
                fontFamily: 'JetBrains Mono',
              }}
              itemStyle={{ color: '#e0e0e0' }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-col gap-1.5 overflow-hidden">
        {data.map((item, i) => (
          <div key={item.name} className="flex items-center gap-2 text-xs">
            <span
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ background: COLORS[i % COLORS.length] }}
            />
            <span className="truncate text-radar-text-muted">{item.name}</span>
            <span className="ml-auto font-mono text-radar-text">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
