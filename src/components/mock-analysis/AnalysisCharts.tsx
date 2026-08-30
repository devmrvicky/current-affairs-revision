import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from 'recharts';

const PALETTE = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#0ea5e9', '#a855f7', '#14b8a6', '#eab308'];

export interface DonutDatum {
  name: string;
  value: number;
  color?: string;
}

/** Donut chart for categorical breakdowns (question preference, time distribution). Renders nothing but an empty-state note when every value is zero, rather than a misleading full ring. */
export function AnalysisDonutChart({ data, height = 220 }: { data: DonutDatum[]; height?: number }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) {
    return <div className="flex items-center justify-center text-xs" style={{ height, color: 'var(--text-muted)' }}>No data yet</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="80%" paddingAngle={2}>
          {data.map((d, i) => <Cell key={d.name} fill={d.color ?? PALETTE[i % PALETTE.length]} />)}
        </Pie>
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <Tooltip formatter={(((value: number, name: string) => [`${value} (${((value / total) * 100).toFixed(1)}%)`, name]) as any)} />
        <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: 11 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export interface BarComparisonDatum {
  label: string;
  value: number;
  maxValue?: number;
}

/** Bar chart comparing an achieved value against its ceiling (e.g. marks scored vs marks available) per category — used for Subject Performance. */
export function AnalysisBarChart({ data, height = 260, valueLabel = 'Score', maxLabel = 'Max' }: { data: BarComparisonDatum[]; height?: number; valueLabel?: string; maxLabel?: string }) {
  const hasMax = data.some((d) => d.maxValue !== undefined);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={50} />
        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
        <Tooltip />
        {hasMax && <Bar dataKey="maxValue" name={maxLabel} fill="var(--border)" radius={[4, 4, 0, 0]} />}
        <Bar dataKey="value" name={valueLabel} fill="#6366f1" radius={[4, 4, 0, 0]} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Simple horizontal percentage bars — used where a full chart would be overkill on narrow mobile widths (e.g. time distribution as a compact list alternative to the donut). */
export function HorizontalPercentBars({ data }: { data: { name: string; percentage: number; color?: string }[] }) {
  return (
    <div className="space-y-2.5">
      {data.map((d, i) => (
        <div key={d.name}>
          <div className="flex items-center justify-between text-xs mb-1">
            <span style={{ color: 'var(--text-secondary)' }}>{d.name}</span>
            <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{d.percentage}%</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
            <div className="h-full rounded-full" style={{ width: `${Math.min(100, d.percentage)}%`, background: d.color ?? PALETTE[i % PALETTE.length] }} />
          </div>
        </div>
      ))}
    </div>
  );
}
