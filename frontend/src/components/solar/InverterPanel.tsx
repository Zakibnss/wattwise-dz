"use client";

import React from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Activity, Cpu, Thermometer, TriangleAlert, Zap } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/components/ui/Button";
import { formatDateFr, formatPower, formatTimeFr } from "@/lib/format";
import {
  axisTick,
  chartColors,
  gridStroke,
  tooltipItemStyle,
  tooltipLabelStyle,
  tooltipStyle,
} from "@/lib/chartTheme";
import type { InverterStatusResponse } from "@/lib/api";

interface InverterPanelProps {
  data?: InverterStatusResponse;
  isLoading?: boolean;
}

function statusVariant(status: string | null): "success" | "warning" | "secondary" {
  if (status === "RUNNING") return "success";
  if (status === "DERATED" || status === "FAULT") return "warning";
  return "secondary";
}

function Metric({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  tone?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/25 px-3 py-2">
      <p className="flex items-center gap-1 text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
        <Icon className="h-3 w-3" aria-hidden="true" />
        {label}
      </p>
      <p className={cn("mt-1 text-sm font-semibold text-foreground", tone)}>{value}</p>
    </div>
  );
}

/** Inverter efficiency, temperature and maintenance advice. */
export function InverterPanel({ data, isLoading = false }: InverterPanelProps) {
  const chartData = React.useMemo(
    () =>
      [...(data?.efficiency_history ?? [])]
        .sort(
          (a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
        )
        .map((point) => ({
          timestamp: point.timestamp,
          efficiency: point.efficiency_percent,
        })),
    [data?.efficiency_history],
  );

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-3 w-60" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  const available = data?.data_available ?? false;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Cpu className="h-5 w-5 text-primary" aria-hidden="true" />
              Onduleur photovoltaïque
            </CardTitle>
            <CardDescription>
              Rendement DC→AC, température et historique de conversion.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {data?.operating_status && (
              <Badge variant={statusVariant(data.operating_status)} className="text-xs">
                {data.operating_status}
              </Badge>
            )}
            {data?.degraded && (
              <Badge variant="destructive" className="text-xs">
                Rendement dégradé
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!available ? (
          <EmptyState
            variant="data"
            compact
            title="Télémétrie onduleur indisponible"
            description={
              data?.data_availability_message ??
              "Aucune valeur de rendement n'est inventée : connectez la liaison de communication de l'onduleur."
            }
          />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              <Metric
                label="Rendement"
                value={
                  data?.efficiency_percent != null
                    ? `${data.efficiency_percent.toFixed(1)} %`
                    : "—"
                }
                icon={Activity}
                tone={
                  data?.degraded ? "text-destructive" : "text-eco dark:text-eco"
                }
              />
              <Metric
                label="Rendement moyen"
                value={
                  data?.average_efficiency_percent != null
                    ? `${data.average_efficiency_percent.toFixed(1)} %`
                    : "—"
                }
                icon={GaugeIcon}
              />
              <Metric
                label="Température"
                value={
                  data?.temperature_c != null
                    ? `${data.temperature_c.toFixed(1)} °C`
                    : "—"
                }
                icon={Thermometer}
              />
              <Metric
                label="Entrée DC"
                value={
                  data?.dc_input_power_w != null
                    ? formatPower(data.dc_input_power_w)
                    : "—"
                }
                icon={Zap}
              />
              <Metric
                label="Sortie AC"
                value={
                  data?.ac_output_power_w != null
                    ? formatPower(data.ac_output_power_w)
                    : "—"
                }
                icon={Zap}
              />
            </div>

            {chartData.length > 1 ? (
              <div className="w-full" style={{ height: 180 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={chartData}
                    margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid stroke={gridStroke} strokeDasharray="4 4" vertical={false} />
                    <XAxis
                      dataKey="timestamp"
                      tickFormatter={(ts) => formatTimeFr(ts)}
                      tick={{ ...axisTick, fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                      minTickGap={30}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tick={{ ...axisTick, fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                      width={40}
                      tickFormatter={(v) => `${v}%`}
                    />
                    <Tooltip
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
                      formatter={(value: number | string) => [
                        `${Number(value).toFixed(1)} %`,
                        "Rendement",
                      ]}
                      contentStyle={tooltipStyle}
                      labelStyle={tooltipLabelStyle}
                      itemStyle={tooltipItemStyle}
                    />
                    <Line
                      type="monotone"
                      dataKey="efficiency"
                      stroke={chartColors.forecast}
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive
                      animationDuration={400}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="rounded-lg bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                Historique de rendement insuffisant pour tracer une courbe.
              </p>
            )}
          </>
        )}

        {(data?.warnings?.length ?? 0) > 0 && (
          <div className="space-y-2">
            {data?.warnings.map((fault) => (
              <div
                key={fault.id}
                className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning"
              >
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <div>
                  <p className="font-medium">{fault.message}</p>
                  {fault.recommended_action && (
                    <p className="mt-0.5 text-xs opacity-90">{fault.recommended_action}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {(data?.recommendations?.length ?? 0) > 0 && (
          <ul className="space-y-1 text-xs text-muted-foreground">
            {data?.recommendations.map((recommendation) => (
              <li key={recommendation} className="flex items-start gap-1.5">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                {recommendation}
              </li>
            ))}
          </ul>
        )}

        <p className="text-[11px] text-muted-foreground">
          {data?.data_availability_message}
          {data?.last_update ? ` · Dernière mesure : ${formatDateFr(data.last_update)}` : ""}
        </p>
      </CardContent>
    </Card>
  );
}

/** Small gauge glyph kept local so the metric row stays aligned. */
function GaugeIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M12 14l4-4" />
      <path d="M3.34 19a10 10 0 1 1 17.32 0" />
    </svg>
  );
}
