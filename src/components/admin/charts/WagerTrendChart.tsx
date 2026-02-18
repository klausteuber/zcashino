'use client'

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'

interface DailyData {
  date: string
  vpWagered: number
  bjWagered: number
  bjPayout: number
  vpPayout: number
}

interface WagerTrendChartProps {
  data: DailyData[]
}

export default function WagerTrendChart({ data }: WagerTrendChartProps) {
  if (data.length === 0) {
    return (
      <div className="text-venetian-gold/50 text-sm text-center py-8">
        No wager data for this period.
      </div>
    )
  }

  return (
    <div className="w-full h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
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
            formatter={(value: number | undefined, name: string | undefined) => {
              const labels: Record<string, string> = {
                vpWagered: 'VP Wagered',
                bjWagered: 'BJ Wagered',
                bjPayout: 'BJ Payout',
                vpPayout: 'VP Payout',
              }
              const key = name ?? ''
              return [`${(value ?? 0).toFixed(4)} ZEC`, labels[key] || key]
            }}
            labelFormatter={(label: unknown) => `Date: ${String(label)}`}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, color: 'rgba(212, 175, 55, 0.6)' }}
            formatter={(value: string) => {
              const labels: Record<string, string> = {
                vpWagered: 'VP Wagered',
                bjWagered: 'BJ Wagered',
                bjPayout: 'BJ Payout',
                vpPayout: 'VP Payout',
              }
              return labels[value] || value
            }}
          />
          <Line
            type="monotone"
            dataKey="vpWagered"
            stroke="#d4af37"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="bjWagered"
            stroke="#06b6d4"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="bjPayout"
            stroke="#8b5cf6"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="vpPayout"
            stroke="#22c55e"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
