"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ClientBucket, MonthBucket } from "@/lib/domain/report";

/**
 * RF-07 · D-04. Charts of the certificate history. Quiet on purpose: no entrance
 * animation, neutral tokens, cancelled certificates drawn apart from valid ones (D-25).
 */

const axis = { fontSize: 12, fill: "var(--muted-foreground)" } as const;
const tooltipStyle = {
  background: "var(--popover)",
  color: "var(--popover-foreground)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 12,
} as const;
const VALID = "var(--chart-3)";
const SECONDARY = "var(--chart-1)";

function Empty() {
  return <p className="flex h-64 items-center justify-center text-sm text-muted-foreground">Sin datos en el periodo.</p>;
}

export function MonthlyChart({ data }: { data: MonthBucket[] }) {
  if (data.length === 0) return <Empty />;
  return (
    <div className="h-64" role="img" aria-label="Gráfica de certificados por mes">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} />
          <YAxis allowDecimals={false} tick={axis} tickLine={false} axisLine={false} />
          <Tooltip cursor={{ fill: "var(--muted)" }} contentStyle={tooltipStyle} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="valid" name="Vigentes" stackId="a" fill={VALID} isAnimationActive={false} />
          <Bar dataKey="cancelled" name="Cancelados" stackId="a" fill={SECONDARY} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ClientChart({ data }: { data: ClientBucket[] }) {
  if (data.length === 0) return <Empty />;
  // Stack "within range" and "with deviation" so the bar length is the client's total
  const rows = data.map((c) => ({ name: c.clientName, inRange: c.valid - c.withDeviation, withDeviation: c.withDeviation }));
  return (
    <div className="h-64" role="img" aria-label="Gráfica de certificados vigentes por cliente">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <CartesianGrid horizontal={false} stroke="var(--border)" />
          <XAxis type="number" allowDecimals={false} tick={axis} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="name" width={130} tick={axis} tickLine={false} axisLine={false} />
          <Tooltip cursor={{ fill: "var(--muted)" }} contentStyle={tooltipStyle} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="inRange" name="Dentro de rango" stackId="a" fill={VALID} isAnimationActive={false} />
          <Bar dataKey="withDeviation" name="Con desviación" stackId="a" fill={SECONDARY} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
