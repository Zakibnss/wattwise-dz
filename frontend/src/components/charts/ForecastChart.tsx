"use client";

import React from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatPower } from "@/lib/format";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  axisTick,
  chartColors,
  gridStroke,
  tooltipItemStyle,
  tooltipLabelStyle,
  tooltipStyle,
} from "@/lib/chartTheme";

type ForecastChartProps = {
  predictions: {
    hour_offset: number;
    predicted_power: number;
    confidence_lower: number;
    confidence_upper: number;
  }[];
  height?: number;
};

export function ForecastChart({ predictions, height = 320 }: ForecastChartProps) {
  if (!predictions || predictions.length === 0) {
    return (
      <div style={{ height }}>
        <EmptyState
          variant="data"
          title="Aucune prévision disponible"
          description="Le modèle n'a pas encore produit de prévision pour les prochaines 24 heures."
          className="h-full rounded-xl border border-dashed border-border bg-muted/20"
        />
      </div>
    );
  }

  const chartData = predictions.map((p) => ({
    hour: `H+${p.hour_offset}`,
    predicted: p.predicted_power,
    band: [p.confidence_lower, p.confidence_upper] as [number, number],
  }));

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="forecastBand" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={chartColors.forecast} stopOpacity={0.28} />
              <stop offset="100%" stopColor={chartColors.forecast} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={gridStroke} strokeDasharray="4 4" vertical={false} />
          <XAxis
            dataKey="hour"
            tick={axisTick}
            tickLine={false}
            axisLine={false}
            minTickGap={24}
          />
          <YAxis
            tick={axisTick}
            tickLine={false}
            axisLine={false}
            width={56}
            tickFormatter={(value) => formatPower(value as number)}
          />
          <Tooltip
            cursor={{ stroke: chartColors.neutral, strokeDasharray: "4 4" }}
            formatter={(value: unknown, name: string) =>
              name === "band"
                ? [
                    `${formatPower((value as [number, number])[0])} – ${formatPower((value as [number, number])[1])}`,
                    "Intervalle",
                  ]
                : [formatPower(value as number), "Puissance prévue"]
            }
            contentStyle={tooltipStyle}
            labelStyle={tooltipLabelStyle}
            itemStyle={tooltipItemStyle}
          />
          <Area
            type="monotone"
            dataKey="band"
            fill="url(#forecastBand)"
            stroke="none"
            isAnimationActive
            animationDuration={450}
          />
          <Line
            type="monotone"
            dataKey="predicted"
            stroke={chartColors.forecast}
            strokeWidth={2.4}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "hsl(var(--card))" }}
            isAnimationActive
            animationDuration={500}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
