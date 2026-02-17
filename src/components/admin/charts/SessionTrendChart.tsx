'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

interface DailyData {
  date: string
  activeSessions: number
}

interface SessionTrendChartProps {
  data: DailyData[]
}

export default function SessionTrendChart({ data }: SessionTrendChartProps) {
  if (data.length === 0) {
    return (
      <div className="text-venetian-gold/50 text-sm text-center py-8">
        No session data for this period.
      </div>
    )
  }

  return (
    <div className="w-full h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(212, 175, 55, 0.1)" />
          <XAxis
            dataKey="date"
            tick={{ fill: 'rgba(212, 175, 55, 0.5)', fontSize: 11 }}
            tickFormatter={(v: string) => v.slice(5)}
          />
          <YAxis
            tick={{ fill: 'rgba(212, 175, 55, 0.5)', fontSize: 11 }}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#0a0a0a',
              border: '1px solid rgba(212, 175, 55, 0.3)',
              borderRadius: '8px',
              color: '#f5f0e8',
              fontSize: 12,
            }}
            formatter={(value: number | undefined) => [
              `${value ?? 0}`,
              'Active Sessions',
            ]}
            labelFormatter={(label: unknown) => `Date: ${String(label)}`}
          />
          <Bar dataKey="activeSessions" fill="#14b8a6" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
