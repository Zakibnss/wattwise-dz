"use client";

import React from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
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
  legendStyle,
  tooltipItemStyle,
  tooltipLabelStyle,
  tooltipStyle,
} from "@/lib/chartTheme";
import type { PvReadingPoint } from "@/lib/api";

interface ProductionComparisonChartProps {
  data: PvReadingPoint[];
  height?: number;
}

/**
 * Expected vs actual PV power.
 *
 * The expected curve is the irradiance-based model (G × A × η with temperature
 * derating); the actual curve is the measured AC output. A persistent gap
 * between both curves is what the diagnostic engine reports as an anomaly.
 */
export function ProductionComparisonChart({
  data,
  height = 300,
}: ProductionComparisonChartProps) {
  const chartData = React.useMemo(
    () =>
      [...data]
        .sort(
          (a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
        )
        .map((row) => ({
          timestamp: row.timestamp,
          "Attendue":
            row.expected_power != null ? Math.round(row.expected_power) : null,
          "Réelle":
            row.actual_power != null
              ? Math.round(row.actual_power)
              : row.ac_power != null
                ? Math.round(row.ac_power)
                : null,
        })),
    [data],
  );

  if (chartData.length === 0) {
    return (
      <div style={{ height }}>
        <EmptyState
          variant="data"
          title="Aucune mesure photovoltaïque détaillée"
          description="La comparaison production attendue / réelle apparaîtra dès réception des mesures DC, AC et d'irradiance."
          className="h-full rounded-xl border border-dashed border-border bg-muted/20"
        />
      </div>
    );
  }

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={chartData}
          margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="actualPvGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={chartColors.solar} stopOpacity={0.42} />
              <stop offset="100%" stopColor={chartColors.solar} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={gridStroke} strokeDasharray="4 4" vertical={false} />
          <XAxis
            dataKey="timestamp"
            tickFormatter={(ts) => formatTimeFr(ts)}
            tick={axisTick}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={28}
          />
          <YAxis
            tick={axisTick}
            tickLine={false}
            axisLine={false}
            width={56}
            tickFormatter={(w) => formatPower(w as number)}
          />
          <Tooltip
            cursor={{ stroke: chartColors.neutral, strokeDasharray: "4 4" }}
            labelFormatter={(ts) => {
              try {
                return new Date(ts as string).toLocaleString("fr-FR", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                });
              } catch {
                return String(ts);
              }
            }}
            formatter={(value: number | string, name: string) => [
              value == null ? "—" : formatPower(Number(value)),
              name,
            ]}
            contentStyle={tooltipStyle}
            labelStyle={tooltipLabelStyle}
            itemStyle={tooltipItemStyle}
          />
          <Legend
            verticalAlign="top"
            height={32}
            iconType="circle"
            wrapperStyle={legendStyle}
          />
          <Area
            type="monotone"
            dataKey="Réelle"
            stroke={chartColors.solar}
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#actualPvGradient)"
            isAnimationActive
            animationDuration={450}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="Attendue"
            stroke={chartColors.forecast}
            strokeWidth={2}
            strokeDasharray="6 4"
            dot={false}
            isAnimationActive
            animationDuration={450}
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
