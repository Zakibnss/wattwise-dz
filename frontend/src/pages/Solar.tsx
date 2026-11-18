"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { SolarConsumptionChart } from "@/components/charts/SolarConsumptionChart";
import { ProductionComparisonChart } from "@/components/charts/ProductionComparisonChart";
import { PvLiveMetrics } from "@/components/solar/PvLiveMetrics";
import { PvHealthPanel } from "@/components/solar/PvHealthPanel";
import { InverterPanel } from "@/components/solar/InverterPanel";
import { EnergySourceWidget } from "@/components/widgets/EnergySourceWidget";
import { AnimatedCounter } from "@/components/ui/AnimatedCounter";
import { KpiSkeleton, ChartSkeleton } from "@/components/ui/Skeleton";
import { api } from "@/lib/api";
import type { PvReadingPoint } from "@/lib/api";
import { formatPower, formatDateFr, formatEnergy, formatCurrency } from "@/lib/format";
import {
  Sun,
  Zap,
  BatteryCharging,
  Gauge,
  Leaf,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Activity,
  Info,
} from "lucide-react";

/** Trapezoidal integration of power samples (W) into energy (kWh). */
function integrateKwh(points: Array<{ timestamp: string; power: number | null }>): number {
  const ordered = points
    .filter((point) => point.power != null)
    .map((point) => ({
      time: new Date(point.timestamp).getTime(),
      power: Number(point.power),
    }))
    .sort((a, b) => a.time - b.time);

  let energyWh = 0;
  for (let i = 1; i < ordered.length; i += 1) {
    const gapHours = (ordered[i].time - ordered[i - 1].time) / 3_600_000;
    if (gapHours <= 0 || gapHours > 6) continue;
    energyWh += ((ordered[i].power + ordered[i - 1].power) / 2) * gapHours;
  }
  return Math.max(0, energyWh / 1000);
}

export function SolarPage() {
  const reduceMotion = useReducedMotion();

  const { data: solarCurrent, isLoading: currentLoading } = useQuery({
    queryKey: ["solar-current"],
    queryFn: () => api.getSolarCurrent(),
    refetchInterval: 15000,
  });
  const { data: solarHistory = [], isLoading: historyLoading } = useQuery({
    queryKey: ["solar-history"],
    queryFn: () => api.getSolarHistory(24),
    refetchInterval: 60000,
  });
  const { data: readings = [], isLoading: readingsLoading } = useQuery({
    queryKey: ["readings-latest", "solar"],
    queryFn: () => api.getReadingsLatest({ limit: 100, device_id: "SALLE1" }),
  });
  const { data: pvDetailed, isLoading: pvDetailedLoading } = useQuery({
    queryKey: ["pv-detailed"],
    queryFn: () => api.getPvDetailed({ hours: 24 }),
    refetchInterval: 30000,
  });
  const { data: pvFaults, isLoading: pvFaultsLoading } = useQuery({
    queryKey: ["pv-faults"],
    queryFn: () => api.getPvFaults(),
    refetchInterval: 60000,
  });
  const { data: inverter, isLoading: inverterLoading } = useQuery({
    queryKey: ["pv-inverter"],
    queryFn: () => api.getInverterStatus({ hours: 24 }),
    refetchInterval: 60000,
  });
  const { data: optimization, isLoading: optimizationLoading } = useQuery({
    queryKey: ["pv-optimization"],
    queryFn: () => api.getSolarOptimization(),
    refetchInterval: 60000,
  });

  const solarPowerW = pvDetailed?.actual_power_w ?? solarCurrent?.power_w ?? 0;
  const solarPowerKw = solarPowerW / 1000;
  const currentConsumptionW = readings[0]?.power ?? 0;
  const isSelfConsuming = solarPowerW > currentConsumptionW && solarPowerW > 10;
  const coveragePct =
    currentConsumptionW > 0 ? Math.min(100, (solarPowerW / currentConsumptionW) * 100) : 0;
  const loading = currentLoading || readingsLoading;
  const isSimulated = (pvDetailed?.data_source ?? "simulator") === "simulator";

  const history = pvDetailed?.history ?? [];
  const actualEnergyKwh = React.useMemo(
    () =>
      integrateKwh(
        history.map((row: PvReadingPoint) => ({
          timestamp: row.timestamp,
          power: row.actual_power ?? row.ac_power,
        })),
      ),
    [history],
  );
  const expectedEnergyKwh = React.useMemo(
    () =>
      integrateKwh(
        history.map((row: PvReadingPoint) => ({
          timestamp: row.timestamp,
          power: row.expected_power,
        })),
      ),
    [history],
  );
  const performanceRatio =
    expectedEnergyKwh > 0 ? (actualEnergyKwh / expectedEnergyKwh) * 100 : null;

  const kpis = [
    {
      title: "Production actuelle",
      icon: Sun,
      iconClass: "bg-solar/10 text-solar",
      value: solarPowerKw,
      format: (v: number) => `${v.toFixed(3)} kW`,
      subtitle: formatPower(solarPowerW),
    },
    {
      title: "Puissance crête installée",
      icon: Gauge,
      iconClass: "bg-primary/10 text-primary",
      value: solarCurrent?.peak_kw ?? 6.5,
      format: (v: number) => `${v.toFixed(1)} kW`,
      subtitle: "Capacité nominale du champ PV",
    },
    {
      title: "Couverture solaire",
      icon: BatteryCharging,
      iconClass: isSelfConsuming
        ? "bg-eco/10 text-eco dark:text-eco"
        : "bg-muted text-muted-foreground",
      value: coveragePct,
      format: (v: number) => `${v.toFixed(1)} %`,
      subtitle: isSelfConsuming ? "Autoconsommation active" : "Soutirage réseau",
    },
    {
      title: "Consommation actuelle",
      icon: Zap,
      iconClass: "bg-volt/10 text-volt",
      value: currentConsumptionW,
      format: (v: number) => formatPower(v),
      subtitle: readings[0]?.timestamp ? formatDateFr(readings[0].timestamp) : "—",
    },
  ];

  return (
    <div className="page flex flex-col gap-6">
      {/* Section 1 — header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <motion.div
            animate={reduceMotion ? undefined : { rotate: 360 }}
            transition={{ duration: 24, repeat: Infinity, ease: "linear" }}
            className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-solar to-copper text-white shadow-sm"
            aria-hidden="true"
          >
            <Sun className="h-6 w-6" />
          </motion.div>
          <div>
            <h1 className="text-[26px] font-bold tracking-tight text-foreground">Production Solaire</h1>
            <p className="text-sm text-muted-foreground">
              Monitoring avancé du champ PV, diagnostic, onduleur et optimisation énergétique.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="text-xs">
            <Sun className="mr-1 h-3.5 w-3.5 text-solar" aria-hidden="true" />
            {solarPowerW > 5 ? "Génération en cours" : "Aucune génération"}
          </Badge>
          <Badge variant={isSimulated ? "warning" : "success"} className="text-xs">
            {isSimulated ? "Données simulées" : "Capteurs physiques"}
          </Badge>
          {isSelfConsuming && (
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              <Badge className="border-0 bg-gradient-to-r from-eco to-volt text-xs font-semibold text-white shadow-sm">
                Autoconsommation active
              </Badge>
            </motion.div>
          )}
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <RefreshCw className="h-3 w-3" aria-hidden="true" />
            Actualisation 15 s
          </span>
        </div>
      </div>

      {/* Section 2 — overview KPIs */}
      {loading ? (
        <KpiSkeleton />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {kpis.map((kpi) => {
            const Icon = kpi.icon;
            return (
              <div
                key={kpi.title}
                className="relative overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-panel transition-shadow hover:shadow-panel-hover"
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      {kpi.title}
                    </p>
                    <p className="metric mt-2 truncate text-[26px] font-bold leading-none text-foreground">
                      <AnimatedCounter value={kpi.value} format={kpi.format} />
                    </p>
                    <p className="mt-1.5 truncate text-[11px] text-muted-foreground">{kpi.subtitle}</p>
                  </div>
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${kpi.iconClass}`}>
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Section 3 — real-time monitoring */}
      <PvLiveMetrics data={pvDetailed} isLoading={pvDetailedLoading} />

      {/* Section 4 — expected vs actual */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <Activity className="h-5 w-5 text-eco" aria-hidden="true" />
                Production attendue vs réelle
              </CardTitle>
              <CardDescription>
                Puissance attendue = irradiance × surface × rendement, corrigée par la température.
              </CardDescription>
            </div>
            {pvDetailed?.deviation_percent != null && (
              <Badge
                variant={pvDetailed.deviation_percent < -10 ? "warning" : "success"}
                className="text-xs"
              >
                {pvDetailed.deviation_percent < 0 ? (
                  <TrendingDown className="mr-1 h-3 w-3" aria-hidden="true" />
                ) : (
                  <TrendingUp className="mr-1 h-3 w-3" aria-hidden="true" />
                )}
                Écart {pvDetailed.deviation_percent > 0 ? "+" : ""}
                {pvDetailed.deviation_percent.toFixed(1)} %
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
            <div className="lg:col-span-3">
              {pvDetailedLoading ? (
                <ChartSkeleton height={300} />
              ) : (
                <ProductionComparisonChart data={history} height={300} />
              )}
            </div>
            <div className="flex flex-col gap-2">
              <div className="rounded-lg bg-muted/40 px-3 py-2">
                <p className="text-[11px] text-muted-foreground">Puissance attendue</p>
                <p className="text-lg font-semibold text-foreground">
                  {formatPower(pvDetailed?.expected_power_w)}
                </p>
              </div>
              <div className="rounded-lg bg-muted/40 px-3 py-2">
                <p className="text-[11px] text-muted-foreground">Puissance réelle</p>
                <p className="text-lg font-semibold text-foreground">
                  {formatPower(pvDetailed?.actual_power_w)}
                </p>
              </div>
              <div className="rounded-lg bg-muted/40 px-3 py-2">
                <p className="text-[11px] text-muted-foreground">Écart absolu</p>
                <p className="text-lg font-semibold text-foreground">
                  {pvDetailed?.deviation_w != null
                    ? `${pvDetailed.deviation_w > 0 ? "+" : ""}${formatPower(
                        pvDetailed.deviation_w,
                      )}`
                    : "—"}
                </p>
              </div>
              <p className="mt-auto flex items-start gap-1.5 text-[11px] text-muted-foreground">
                <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                Un écart durable est traité comme une anomalie à inspecter, pas comme un défaut
                confirmé.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sections 5 & 6 — PV health and inverter */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <PvHealthPanel data={pvFaults} isLoading={pvFaultsLoading} />
        <InverterPanel data={inverter} isLoading={inverterLoading} />
      </div>

      {/* Section 7 — energy-source optimization */}
      <EnergySourceWidget data={optimization} isLoading={optimizationLoading} />

      {/* Section 8 — historical performance */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <Leaf className="h-5 w-5 text-eco" aria-hidden="true" />
                Performance historique (24 h)
              </CardTitle>
              <CardDescription>
                Courbe photovoltaïque comparée à la consommation électrique du bâtiment.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="rounded-md bg-muted/50 px-2 py-1">
                Produit : <strong className="text-foreground">{formatEnergy(actualEnergyKwh)}</strong>
              </span>
              <span className="rounded-md bg-muted/50 px-2 py-1">
                Attendu : <strong className="text-foreground">{formatEnergy(expectedEnergyKwh)}</strong>
              </span>
              <span className="rounded-md bg-muted/50 px-2 py-1">
                Ratio de performance :{" "}
                <strong className="text-foreground">
                  {performanceRatio != null ? `${performanceRatio.toFixed(1)} %` : "—"}
                </strong>
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {historyLoading && readingsLoading ? (
            <ChartSkeleton height={300} />
          ) : (
            <SolarConsumptionChart
              height={300}
              consumptionData={readings.map((r) => ({
                timestamp: r.timestamp,
                power: r.power ?? 0,
              }))}
              solarData={solarHistory}
            />
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Leaf className="h-4 w-4 text-eco" aria-hidden="true" />
              Intégration photovoltaïque
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              La production solaire est comparée en temps réel à la consommation du bâtiment. Lorsque
              la production dépasse la consommation, l&apos;énergie excédentaire est autoconsommée et
              réduit directement le soutirage depuis le réseau Sonelgaz.
            </p>
            <p>
              Chaque kilowattheure solaire autoconsommé évite environ 0,45 kg de CO₂, conformément au
              facteur d&apos;émission du mix électrique algérien.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Indicateurs de performance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Taux de couverture instantané</span>
                <span className="font-semibold text-foreground">{coveragePct.toFixed(1)} %</span>
              </div>
              <div
                className="h-2.5 w-full overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(coveragePct)}
                aria-label="Taux de couverture solaire instantané"
              >
                <div
                  className="h-full rounded-full bg-gradient-to-r from-solar to-eco transition-[width] duration-700 ease-out"
                  style={{ width: `${coveragePct}%` }}
                />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-xs">
              <span className="text-muted-foreground">Statut du champ PV</span>
              <span className="flex items-center gap-1.5 font-medium text-foreground">
                <span
                  className={`h-2 w-2 rounded-full ${
                    solarPowerW > 5 ? "animate-pulse bg-eco" : "bg-muted-foreground"
                  }`}
                  aria-hidden="true"
                />
                {solarPowerW > 5 ? "En production" : "Hors production"}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-xs">
              <span className="text-muted-foreground">Économie journalière estimée</span>
              <span className="font-medium text-foreground">
                {formatCurrency(optimization?.estimated_daily_savings_dzd ?? 0)}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-xs">
              <span className="text-muted-foreground">Dernière mesure</span>
              <span className="font-medium text-foreground">
                {pvDetailed?.last_update
                  ? formatDateFr(pvDetailed.last_update)
                  : solarCurrent?.timestamp
                    ? formatDateFr(solarCurrent.timestamp)
                    : "—"}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
