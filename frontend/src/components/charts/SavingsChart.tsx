"use client";

import React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatEnergy } from "@/lib/format";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  axisTick,
  chartColors,
  gridStroke,
  tooltipItemStyle,
  tooltipLabelStyle,
  tooltipStyle,
} from "@/lib/chartTheme";

type SavingsChartProps = {
  data: { name: string; saved_kwh: number }[];
  height?: number;
};

export function SavingsChart({ data, height = 240 }: SavingsChartProps) {
  if (!data || data.length === 0) {
    return (
      <div style={{ height }}>
        <EmptyState
          variant="data"
          title="Pas encore d'économies"
          description="Enregistrez une première action pour visualiser vos économies d'énergie."
          className="h-full rounded-xl border border-dashed border-border bg-muted/20"
          compact
        />
      </div>
    );
  }

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={gridStroke} strokeDasharray="4 4" vertical={false} />
          <XAxis
            dataKey="name"
            tick={axisTick}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={axisTick}
            tickLine={false}
            axisLine={false}
            width={58}
            tickFormatter={(value) => formatEnergy(value as number)}
          />
          <Tooltip
            cursor={{ fill: "hsl(var(--muted) / 0.5)" }}
            formatter={(value) => [formatEnergy(value as number), "Économies"]}
            contentStyle={tooltipStyle}
            labelStyle={tooltipLabelStyle}
            itemStyle={tooltipItemStyle}
          />
          <Bar dataKey="saved_kwh" radius={[6, 6, 0, 0]} isAnimationActive animationDuration={450}>
            {data.map((_, i) => (
              <Cell
                key={i}
                fill={i === data.length - 1 ? chartColors.solar : chartColors.forecast}
                fillOpacity={i === data.length - 1 ? 1 : 0.72}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
