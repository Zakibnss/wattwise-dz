"use client";

import React from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatPower, formatTimeFr } from "@/lib/format";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  axisTick,
  chartColors,
  gridStroke,
  tooltipItemStyle,
  tooltipLabelStyle,
  tooltipStyle,
} from "@/lib/chartTheme";

type PowerChartProps = {
  data: { timestamp: string; power: number }[];
  height?: number;
};

export function PowerChart({ data, height = 240 }: PowerChartProps) {
  // The API returns newest first; charts must read left-to-right chronologically.
  const chronological = React.useMemo(
    () =>
      [...(data ?? [])]
        .filter((d) => (d.power ?? 0) <= 10000) // ignore simulator fault spikes
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()),
    [data],
  );

  if (chronological.length === 0) {
    return (
      <div style={{ height }}>
        <EmptyState
          variant="data"
          title="Aucune donnée de consommation"
          description="Les mesures apparaîtront ici dès la première lecture du capteur."
          className="h-full rounded-xl border border-dashed border-border bg-muted/20"
        />
      </div>
    );
  }

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chronological} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="powerFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={chartColors.consumption} stopOpacity={0.35} />
              <stop offset="70%" stopColor={chartColors.consumption} stopOpacity={0.06} />
              <stop offset="100%" stopColor={chartColors.consumption} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={gridStroke} strokeDasharray="4 4" vertical={false} />
          <XAxis
            dataKey="timestamp"
            tickFormatter={(value) => formatTimeFr(value as string)}
            tick={axisTick}
            tickLine={false}
            axisLine={false}
            minTickGap={32}
          />
          <YAxis
            domain={["auto", "auto"]}
            tick={axisTick}
            tickLine={false}
            axisLine={false}
            width={56}
            tickFormatter={(value) => formatPower(value as number)}
          />
          <Tooltip
            cursor={{ stroke: chartColors.neutral, strokeDasharray: "4 4" }}
            labelFormatter={(value) => formatTimeFr(value as string)}
            formatter={(value) => [formatPower(value as number), "Puissance"]}
            contentStyle={tooltipStyle}
            labelStyle={tooltipLabelStyle}
            itemStyle={tooltipItemStyle}
          />
          <Area
            type="monotone"
            dataKey="power"
            stroke={chartColors.consumption}
            strokeWidth={2.2}
            fill="url(#powerFill)"
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "hsl(var(--card))" }}
            isAnimationActive
            animationDuration={450}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
