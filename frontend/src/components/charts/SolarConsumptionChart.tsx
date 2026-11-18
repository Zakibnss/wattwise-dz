"use client";

import React from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatTimeFr, formatPower } from "@/lib/format";
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

interface SolarConsumptionChartProps {
  consumptionData: Array<{ timestamp: string; power: number }>;
  solarData: Array<{ timestamp: string; power_w: number }>;
  height?: number;
}

export function SolarConsumptionChart({
  consumptionData,
  solarData,
  height = 300,
}: SolarConsumptionChartProps) {
  // Merge solar and consumption series on a chronological timeline.
  const mergedData = React.useMemo(() => {
    // Ignore simulator fault spikes so the y-axis stays readable.
    const safeConsumption = consumptionData.filter((c) => (c.power ?? 0) <= 10000);

    if (solarData.length > 0) {
      return [...solarData]
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
        .map((s, idx) => {
          const cPoint =
            safeConsumption.length > 0
              ? safeConsumption[Math.min(idx, safeConsumption.length - 1)]
              : null;
          return {
            timestamp: s.timestamp,
            "Production solaire": Math.round(s.power_w),
            Consommation: cPoint ? Math.round(cPoint.power) : 0,
          };
        });
    }

    return [...safeConsumption]
      .slice(0, 50)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .map((c) => ({
        timestamp: c.timestamp,
        "Production solaire": 0,
        Consommation: Math.round(c.power),
      }));
  }, [consumptionData, solarData]);

  if (mergedData.length === 0) {
    return (
      <div style={{ height }}>
        <EmptyState
          variant="data"
          title="Aucune donnée solaire"
          description="La courbe de production photovoltaïque apparaîtra dès réception des mesures."
          className="h-full rounded-xl border border-dashed border-border bg-muted/20"
        />
      </div>
    );
  }

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={mergedData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="solarGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={chartColors.solar} stopOpacity={0.45} />
              <stop offset="100%" stopColor={chartColors.solar} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="consumptionGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={chartColors.consumption} stopOpacity={0.3} />
              <stop offset="100%" stopColor={chartColors.consumption} stopOpacity={0} />
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
            minTickGap={32}
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
            labelFormatter={(ts) => formatTimeFr(ts as string)}
            formatter={(value: number | string, name: string) => [
              formatPower(Number(value)),
              name,
            ]}
            contentStyle={tooltipStyle}
            labelStyle={tooltipLabelStyle}
            itemStyle={tooltipItemStyle}
          />
          <Legend verticalAlign="top" height={32} iconType="circle" wrapperStyle={legendStyle} />
          <Area
            type="monotone"
            dataKey="Production solaire"
            stroke={chartColors.solar}
            strokeWidth={2.2}
            fill="url(#solarGradient)"
            isAnimationActive
            animationDuration={450}
          />
          <Area
            type="monotone"
            dataKey="Consommation"
            stroke={chartColors.consumption}
            strokeWidth={2.2}
            fill="url(#consumptionGradient)"
            isAnimationActive
            animationDuration={450}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
