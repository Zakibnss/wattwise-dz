"use client";

import React from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { ArrowDownRight, BatteryCharging, BatteryLow, PiggyBank, PlugZap, Sun } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/components/ui/Button";
import { formatCurrency, formatEnergy, formatEnergyAuto } from "@/lib/format";
import { tooltipItemStyle, tooltipLabelStyle, tooltipStyle } from "@/lib/chartTheme";
import type { SolarOptimizationResponse } from "@/lib/api";

const COLORS = {
  solar: "hsl(var(--chart-solar))",
  battery: "hsl(var(--chart-forecast))",
  grid: "hsl(var(--chart-grid))",
};

function statusLabel(status: string): { label: string; variant: "success" | "warning" | "outline" } {
  if (status === "ok") return { label: "Optimisation calculée", variant: "success" };
  if (status === "no_solar_production") return { label: "Sans production solaire", variant: "warning" };
  return { label: "Données insuffisantes", variant: "outline" };
}

interface EnergySourceWidgetProps {
  data?: SolarOptimizationResponse;
  isLoading?: boolean;
  compact?: boolean;
  className?: string;
}

/**
 * Active energy-source split (solar / battery / grid) with estimated savings.
 *
 * The optimizer is a deterministic estimate: savings are not billing-verified
 * and the battery state is simulated until a BMS is connected.
 */
export function EnergySourceWidget({
  data,
  isLoading = false,
  compact = false,
  className,
}: EnergySourceWidgetProps) {
  const status = statusLabel(data?.optimization_status ?? "no_data");
  const total =
    (data?.solar_used_kwh ?? 0) +
    (data?.battery_used_kwh ?? 0) +
    (data?.grid_used_kwh ?? 0);

  const pieData = React.useMemo(
    () =>
      [
        { name: "Solaire", value: data?.solar_used_kwh ?? 0, color: COLORS.solar },
        { name: "Batterie", value: data?.battery_used_kwh ?? 0, color: COLORS.battery },
        { name: "Réseau", value: data?.grid_used_kwh ?? 0, color: COLORS.grid },
      ].filter((entry) => entry.value > 0),
    [data?.solar_used_kwh, data?.battery_used_kwh, data?.grid_used_kwh],
  );

  const batteryLevel = Math.max(0, Math.min(100, data?.battery_level_percent ?? 0));

  // Split the value from its unit so the centre label never grows wider than
  // the donut hole ("0.02 kWh" at 18 px used to overflow onto the ring).
  const [totalValue, totalUnit] = formatEnergyAuto(total).split(" ");

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-3 w-56" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  const noData = !data || data.optimization_status === "no_data" || total <= 0;

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Sun className="h-5 w-5 text-solar" aria-hidden="true" />
              Source d&apos;énergie active
            </CardTitle>
            <CardDescription>
              Répartition estimée solaire / batterie / réseau sur la fenêtre analysée.
            </CardDescription>
          </div>
          <Badge variant={status.variant} className="text-xs">
            {status.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className={cn("space-y-4", compact && "space-y-3")}>
        {noData ? (
          <EmptyState
            variant="data"
            compact
            title="Pas assez de données pour optimiser"
            description={
              data?.recommendation_text ||
              "L'optimiseur a besoin de mesures de production solaire et de consommation. Aucune valeur n'est inventée."
            }
          />
        ) : (
          <>
            <div className="flex flex-col items-center gap-4 sm:flex-row">
              <div className={cn("relative shrink-0", compact ? "h-32 w-32" : "h-40 w-40")}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius="66%"
                      outerRadius="90%"
                      // A single 100 % slice must not be split by a padding gap.
                      paddingAngle={pieData.length > 1 ? 2 : 0}
                      stroke="none"
                      isAnimationActive
                      animationDuration={500}
                    >
                      {pieData.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number | string, name: string) => [
                        formatEnergy(Number(value)),
                        name,
                      ]}
                      contentStyle={tooltipStyle}
                      labelStyle={tooltipLabelStyle}
                      itemStyle={tooltipItemStyle}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-[12%] text-center">
                  <span className="flex items-baseline gap-1 whitespace-nowrap">
                    <span
                      className={cn(
                        "font-bold leading-none tabular-nums text-foreground",
                        compact ? "text-base" : "text-lg",
                      )}
                    >
                      {totalValue}
                    </span>
                    <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
                      {totalUnit ?? "kWh"}
                    </span>
                  </span>
                  <span className="mt-1 text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
                    total
                  </span>
                </div>
              </div>

              <ul className="flex-1 space-y-2 text-sm">
                <li className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: COLORS.solar }}
                      aria-hidden="true"
                    />
                    <Sun className="h-3.5 w-3.5" aria-hidden="true" /> Solaire
                  </span>
                  <strong className="text-foreground">
                    {formatEnergy(data?.solar_used_kwh ?? 0)}
                  </strong>
                </li>
                <li className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: COLORS.battery }}
                      aria-hidden="true"
                    />
                    <BatteryCharging className="h-3.5 w-3.5" aria-hidden="true" /> Batterie
                  </span>
                  <strong className="text-foreground">
                    {formatEnergy(data?.battery_used_kwh ?? 0)}
                  </strong>
                </li>
                <li className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: COLORS.grid }}
                      aria-hidden="true"
                    />
                    <PlugZap className="h-3.5 w-3.5" aria-hidden="true" /> Réseau
                  </span>
                  <strong className="text-foreground">
                    {formatEnergy(data?.grid_used_kwh ?? 0)}
                  </strong>
                </li>
                {(data?.unused_solar_kwh ?? 0) > 0 && (
                  <li className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>Surplus non valorisé</span>
                    <span>{formatEnergy(data?.unused_solar_kwh)}</span>
                  </li>
                )}
              </ul>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="rounded-xl border border-eco/25 bg-eco/8 px-3 py-2">
                <p className="flex items-center gap-1 text-[10px] uppercase tracking-[0.12em] text-eco">
                  <PiggyBank className="h-3 w-3" aria-hidden="true" />
                  Économie journalière estimée
                </p>
                <p className="metric mt-0.5 text-lg font-bold text-eco">
                  {formatCurrency(data?.estimated_daily_savings_dzd ?? 0)}
                </p>
                <p className="flex items-center gap-1 text-[11px] text-eco/80">
                  <ArrowDownRight className="h-3 w-3" aria-hidden="true" />
                  {(data?.estimated_savings_percent ?? 0).toFixed(1)} % vs scénario 100 % réseau
                </p>
              </div>

              <div className="rounded-xl border border-border bg-muted/25 px-3 py-2">
                <p className="flex items-center gap-1 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  <BatteryLow className="h-3 w-3" aria-hidden="true" />
                  Niveau batterie (simulé)
                </p>
                <p className="metric mt-0.5 text-lg font-bold text-foreground">
                  {batteryLevel.toFixed(0)} %
                </p>
                <div
                  className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(batteryLevel)}
                  aria-label="Niveau de batterie simulé"
                >
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-volt to-eco transition-[width] duration-700 ease-out"
                    style={{ width: `${batteryLevel}%` }}
                  />
                </div>
              </div>
            </div>

            <p className={cn("text-xs leading-relaxed text-muted-foreground", compact && "line-clamp-3")}>
              {data?.recommendation_text}
            </p>
          </>
        )}

        <p className="text-[11px] text-muted-foreground">
          Estimation déterministe · tarif {data?.tariff_dzd_per_kwh?.toFixed(2) ?? "—"} DZD/kWh
          {data?.battery_simulated ? " · batterie simulée (aucun BMS)" : ""}
          {data?.forecast_used ? " · profil horaire par persistance" : ""}
        </p>
      </CardContent>
    </Card>
  );
}
