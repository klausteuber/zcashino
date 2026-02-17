'use client'

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

interface DailyData {
  date: string
  ggr: number
}

interface GGRChartProps {
  data: DailyData[]
}

export default function GGRChart({ data }: GGRChartProps) {
  if (data.length === 0) {
    return (
      <div className="text-venetian-gold/50 text-sm text-center py-8">
        No GGR data for this period.
      </div>
    )
  }

  return (
    <div className="w-full h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(212, 175, 55, 0.1)" />
          <XAxis
            dataKey="date"
            tick={{ fill: 'rgba(212, 175, 55, 0.5)', fontSize: 11 }}
            tickFormatter={(v: string) => v.slice(5)}
          />
          <YAxis
            tick={{ fill: 'rgba(212, 175, 55, 0.5)', fontSize: 11 }}
            tickFormatter={(v: number) => `${v.toFixed(2)}`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#0a0a0a',
              border: '1px solid rgba(212, 175, 55, 0.3)',
              borderRadius: '8px',
              color: '#f5f0e8',
              fontSize: 12,
            }}
            formatter={(value: number | undefined) => [`${(value ?? 0).toFixed(4)} ZEC`, 'GGR']}
            labelFormatter={(label: unknown) => `Date: ${String(label)}`}
          />
          <Area
            type="monotone"
            dataKey="ggr"
            stroke="#8b5cf6"
            fill="rgba(139, 92, 246, 0.2)"
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
