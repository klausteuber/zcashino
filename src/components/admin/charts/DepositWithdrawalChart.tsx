'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'

interface DailyData {
  date: string
  deposits: number
  withdrawals: number
}

interface DepositWithdrawalChartProps {
  data: DailyData[]
}

export default function DepositWithdrawalChart({ data }: DepositWithdrawalChartProps) {
  if (data.length === 0) {
    return (
      <div className="text-venetian-gold/50 text-sm text-center py-8">
        No transaction data for this period.
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
            formatter={(value: number | undefined, name: string | undefined) => [
              `${(value ?? 0).toFixed(4)} ZEC`,
              name ? name.charAt(0).toUpperCase() + name.slice(1) : '',
            ]}
            labelFormatter={(label: unknown) => `Date: ${String(label)}`}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, color: 'rgba(212, 175, 55, 0.6)' }}
          />
          <Bar dataKey="deposits" fill="#8b5cf6" radius={[2, 2, 0, 0]} />
          <Bar dataKey="withdrawals" fill="#d4af37" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
