"use client";

import React from "react";
import {
  Activity,
  Atom,
  CloudSun,
  Database,
  Gauge,
  Thermometer,
  ThermometerSun,
  Zap,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatDateFr, formatPower } from "@/lib/format";
import type { PvDetailedResponse } from "@/lib/api";

const METRICS = [
  {
    key: "dc_voltage" as const,
    label: "Tension DC",
    icon: Activity,
    unit: "V",
    decimals: 1,
    iconClass: "bg-volt/10 text-volt",
  },
  {
    key: "dc_current" as const,
    label: "Courant DC",
    icon: Zap,
    unit: "A",
    decimals: 2,
    iconClass: "bg-volt/10 text-volt",
  },
  {
    key: "irradiance" as const,
    label: "Irradiance",
    icon: CloudSun,
    unit: "W/m²",
    decimals: 0,
    iconClass: "bg-solar/10 text-solar",
  },
  {
    key: "panel_temperature" as const,
    label: "Temp. panneau",
    icon: Thermometer,
    unit: "°C",
    decimals: 1,
    iconClass: "bg-copper/10 text-copper",
  },
  {
    key: "ambient_temperature" as const,
    label: "Temp. ambiante",
    icon: ThermometerSun,
    unit: "°C",
    decimals: 1,
    iconClass: "bg-eco/10 text-eco",
  },
  {
    key: "panel_efficiency" as const,
    label: "Rendement module",
    icon: Atom,
    unit: "%",
    decimals: 1,
    multiplier: 100,
    iconClass: "bg-eco/10 text-eco",
  },
] as const;

interface PvLiveMetricsProps {
  data?: PvDetailedResponse;
  isLoading?: boolean;
}

/** Real-time DC/AC and environmental measurements of the PV array. */
export function PvLiveMetrics({ data, isLoading = false }: PvLiveMetricsProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-3 w-64" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const latest = data?.latest;
  const available = data?.data_available && latest;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Gauge className="h-5 w-5 text-primary" aria-hidden="true" />
              Monitoring photovoltaïque en temps réel
            </CardTitle>
            <CardDescription>
              Mesures DC/AC, irradiance et températures de la dernière acquisition.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {latest?.data_source && (
              <Badge variant="outline" className="text-xs">
                <Database className="mr-1 h-3 w-3" aria-hidden="true" />
                {latest.data_source === "simulator" ? "Données simulées" : "Capteurs physiques"}
              </Badge>
            )}
            {data?.last_update && (
              <span className="text-[11px] text-muted-foreground">
                {formatDateFr(data.last_update)}
              </span>
            )}
            {data?.is_stale && (
              <Badge variant="warning" className="text-xs">
                Mesures obsolètes
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!available ? (
          <EmptyState
            variant="data"
            compact
            title="Aucune télémétrie photovoltaïque détaillée"
            description="Lancez le simulateur avancé ou connectez la passerelle MQTT pour alimenter ces mesures."
          />
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <p className="text-[11px] text-muted-foreground">Puissance DC</p>
              <p className="mt-1 text-lg font-bold text-foreground">
                {formatPower(latest.dc_power)}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <p className="text-[11px] text-muted-foreground">Puissance AC</p>
              <p className="mt-1 text-lg font-bold text-foreground">
                {formatPower(latest.ac_power)}
              </p>
            </div>
            {METRICS.map((metric) => {
              const Icon = metric.icon;
              const raw = latest[metric.key];
              const multiplier = "multiplier" in metric ? metric.multiplier : 1;
              const value =
                raw == null
                  ? "—"
                  : `${(raw * (multiplier ?? 1)).toFixed(metric.decimals)} ${metric.unit}`;
              return (
                <div
                  key={metric.key}
                  className="rounded-lg border border-border bg-muted/20 p-3"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] text-muted-foreground">{metric.label}</p>
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-md ${metric.iconClass}`}
                    >
                      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    </span>
                  </div>
                  <p className="mt-1 text-lg font-bold text-foreground">{value}</p>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
