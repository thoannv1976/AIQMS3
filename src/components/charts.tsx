"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

const PALETTE = ["#2563eb", "#16a34a", "#f59e0b", "#dc2626", "#9333ea", "#0891b2", "#64748b", "#db2777"];

export function BarChartCard({
  data,
  xKey,
  barKey,
  height = 260,
  color = "#2563eb",
}: {
  data: Array<Record<string, string | number>>;
  xKey: string;
  barKey: string;
  height?: number;
  color?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
        <XAxis dataKey={xKey} tick={{ fontSize: 11, fill: "#64748b" }} interval={0} />
        <YAxis tick={{ fontSize: 11, fill: "#64748b" }} />
        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
        <Bar dataKey={barKey} fill={color} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function PieChartCard({
  data,
  height = 260,
}: {
  data: Array<{ name: string; value: number; color?: string }>;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={45} paddingAngle={2}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.color ?? PALETTE[i % PALETTE.length]} />
          ))}
        </Pie>
        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
