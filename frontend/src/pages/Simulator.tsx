"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { AnimatedCounter } from "@/components/ui/AnimatedCounter";
import { KpiSkeleton, ChartSkeleton } from "@/components/ui/Skeleton";
import { api } from "@/lib/api";
import { DZD_PER_KWH } from "@/lib/constants";
import { formatCurrency } from "@/lib/format";
import {
  axisTick,
  chartColors,
  gridStroke,
  legendStyle,
  tooltipItemStyle,
  tooltipLabelStyle,
  tooltipStyle,
} from "@/lib/chartTheme";
import { Calculator, Zap, TrendingDown, Clock, ShieldCheck, Sparkles, Building2, Lightbulb, Wind } from "lucide-react";

const formatDzd = (value: number) => formatCurrency(value);

/** Compact currency for large capex / payback figures that would overflow. */
const formatDzdCompact = (value: number) =>
  `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value)} DZD`;

interface ScenarioConfig {
  investment: number;
  savingsPct: number;
  enabled: boolean;
}

export function SimulatorPage() {
  // Query 24h stats to extrapolate annual baseline consumption
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["stats", "SALLE1", 24],
    queryFn: () => api.getStatsSummary({ device_id: "SALLE1", hours: 24 }),
  });

  /*
   * Annual baseline.
   *
   * Extrapolating a 24 h counter only makes sense when the window actually
   * contains consumption. With a nearly empty database (demo, cold start) the
   * extrapolation collapses to a handful of kWh, which produces absurd
   * paybacks (100 000+ years). In that case we fall back to an explicit,
   * editable assumption instead of showing a meaningless number.
   */
  const measuredKwh = stats?.total_energy_kwh ?? 0;
  const extrapolatedKwh = measuredKwh > 0 ? Math.round(measuredKwh * 365) : 0;
  const measuredIsUsable = extrapolatedKwh >= 500;
  const [baselineOverride, setBaselineOverride] = useState<number | null>(null);
  const annualBaselineKwh = baselineOverride ?? (measuredIsUsable ? extrapolatedKwh : 5000);
  const annualBaselineCostDzd = Math.round(annualBaselineKwh * DZD_PER_KWH);

  // 3 Interactive Scenarios
  const [isolation, setIsolation] = useState<ScenarioConfig>({
    investment: 350000,
    savingsPct: 18,
    enabled: true,
  });

  const [lighting, setLighting] = useState<ScenarioConfig>({
    investment: 80000,
    savingsPct: 12,
    enabled: true,
  });

  const [hvac, setHvac] = useState<ScenarioConfig>({
    investment: 250000,
    savingsPct: 22,
    enabled: true,
  });

  // Calculations
  const totalInvestment =
    (isolation.enabled ? isolation.investment : 0) +
    (lighting.enabled ? lighting.investment : 0) +
    (hvac.enabled ? hvac.investment : 0);

  const rawSavingsPct =
    (isolation.enabled ? isolation.savingsPct : 0) +
    (lighting.enabled ? lighting.savingsPct : 0) +
    (hvac.enabled ? hvac.savingsPct : 0);

  // Cap combined savings at 75% max
  const combinedSavingsPct = Math.min(75, rawSavingsPct);

  const annualSavedKwh = Math.round(annualBaselineKwh * (combinedSavingsPct / 100));
  const annualSavedDzd = Math.round(annualSavedKwh * DZD_PER_KWH);

  const paybackYears =
    annualSavedDzd > 0
      ? totalInvestment > 0
        ? Math.round((totalInvestment / annualSavedDzd) * 10) / 10
        : 0
      : Infinity;

  // 5-Year Cumulative Projection Data
  const chartData = [1, 2, 3, 4, 5].map((year) => {
    const cumulativeSavings = Math.round(annualSavedDzd * year);
    return {
      year: `Année ${year}`,
      Investissement: totalInvestment,
      "Économies cumulées": cumulativeSavings,
      "Bénéfice Net": cumulativeSavings - totalInvestment,
    };
  });

  const fiveYearNetProfit = annualSavedDzd * 5 - totalInvestment;

  return (
    <div className="flex flex-col gap-6 page">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-[26px] font-bold tracking-tight text-foreground">
            <Calculator className="h-6 w-6 text-volt" aria-hidden="true" />
            Simulateur ROI « What-If »
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Simulez des leviers d&apos;efficacité énergétique et mesurez le retour sur
            investissement à partir d&apos;une base annuelle explicite.
          </p>
        </div>
        <div className="flex flex-col gap-1.5 sm:items-end">
          <label
            htmlFor="simulator-baseline"
            className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
          >
            Base annuelle (kWh)
          </label>
          <div className="flex items-center gap-2">
            <input
              id="simulator-baseline"
              type="number"
              min={100}
              step={500}
              value={annualBaselineKwh}
              onChange={(event) => setBaselineOverride(Number(event.target.value) || 0)}
              className="h-9 w-28 rounded-lg border border-input bg-card px-2 text-right font-mono text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Consommation annuelle de référence en kWh"
            />
            <Badge
              variant={baselineOverride == null && measuredIsUsable ? "success" : "warning"}
              dot
              className="whitespace-nowrap"
            >
              {baselineOverride == null && measuredIsUsable ? "Mesurée" : "Hypothèse"}
            </Badge>
          </div>
          <p className="font-mono text-[10px] text-muted-foreground">
            ≈ {formatDzdCompact(annualBaselineCostDzd)} / an
          </p>
        </div>
      </div>

      {/* KPI Highlights */}
      {statsLoading ? (
        <KpiSkeleton />
      ) : (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-border">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Investissement Total</span>
              <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <Building2 className="h-4 w-4" aria-hidden="true" />
              </div>
            </div>
            <p className="metric mt-2 text-[22px] font-bold leading-tight text-foreground">
              <AnimatedCounter value={totalInvestment} format={formatDzdCompact} />
            </p>
            <p className="text-xs text-muted-foreground mt-1">Capex global prévu</p>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Économie Annuelle</span>
              <div className="h-8 w-8 rounded-lg bg-eco/10 text-eco flex items-center justify-center">
                <TrendingDown className="h-4 w-4" aria-hidden="true" />
              </div>
            </div>
            <p className="metric mt-2 text-[22px] font-bold leading-tight text-eco">
              <AnimatedCounter value={annualSavedDzd} format={formatDzdCompact} />{" "}
              <span className="font-sans text-xs font-normal text-muted-foreground">/an</span>
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {annualSavedKwh.toLocaleString("fr-FR")} kWh/an ({combinedSavingsPct}%)
            </p>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Temps de retour (Payback)</span>
              <div className="h-8 w-8 rounded-lg bg-solar/10 text-solar flex items-center justify-center">
                <Clock className="h-4 w-4" aria-hidden="true" />
              </div>
            </div>
            <p
              className={`metric mt-2 text-[22px] font-bold leading-tight ${
                paybackYears === Infinity
                  ? "text-muted-foreground"
                  : paybackYears < 2
                    ? "text-eco"
                    : paybackYears > 5
                      ? "text-destructive"
                      : "text-solar"
              }`}
            >
              {paybackYears === Infinity ? "—" : <AnimatedCounter value={paybackYears} format={(v) => `${v.toFixed(1)} ans`} />}
            </p>
            <p
              className={`text-xs mt-1 ${
                paybackYears === Infinity
                  ? "text-muted-foreground"
                  : paybackYears < 2
                    ? "font-medium text-eco dark:text-eco"
                    : paybackYears > 5
                      ? "font-medium text-destructive dark:text-destructive"
                      : "text-muted-foreground"
              }`}
            >
              {paybackYears === Infinity
                ? "Sélectionnez au moins un levier"
                : paybackYears < 2
                  ? "Excellent retour (< 2 ans)"
                  : paybackYears > 5
                    ? "Retour long (> 5 ans)"
                    : "Retour à moyen terme (2-5 ans)"}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Gain Net à 5 ans</span>
              <div className="h-8 w-8 rounded-lg bg-volt/10 text-volt flex items-center justify-center">
                <Sparkles className="h-4 w-4" aria-hidden="true" />
              </div>
            </div>
            <p
              className={`metric mt-2 text-[22px] font-bold leading-tight ${
                fiveYearNetProfit >= 0 ? "text-eco" : "text-destructive"
              }`}
            >
              <AnimatedCounter value={fiveYearNetProfit} format={formatDzdCompact} />
            </p>
            <p className="text-xs text-muted-foreground mt-1">Bénéfice après amortissement</p>
          </CardContent>
        </Card>
      </div>
      )}

      {/* 3 Interactive Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card 1: Isolation */}
        <Card className={`transition-all border ${isolation.enabled ? "border-primary/50 shadow-sm" : "opacity-60 border-border"}`}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-md bg-solar/10 text-solar flex items-center justify-center">
                  <Building2 className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-base font-semibold">Isolation Thermique</CardTitle>
                  <CardDescription className="text-xs">Toiture & double vitrage</CardDescription>
                </div>
              </div>
              <input
                type="checkbox"
                checked={isolation.enabled}
                onChange={(e) => setIsolation({ ...isolation, enabled: e.target.checked })}
                className="h-4 w-4 accent-primary rounded cursor-pointer"
                title="Activer ce levier"
                aria-label="Activer l'isolation thermique"
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Investissement :</span>
                <span className="font-semibold text-foreground">{formatCurrency(isolation.investment)}</span>
              </div>
              <input
                type="range"
                min={50000}
                max={1000000}
                step={25000}
                disabled={!isolation.enabled}
                value={isolation.investment}
                onChange={(e) => setIsolation({ ...isolation, investment: Number(e.target.value) })}
                className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Économie estimée :</span>
                <span className="font-semibold text-eco dark:text-eco">{isolation.savingsPct}%</span>
              </div>
              <input
                type="range"
                min={5}
                max={40}
                step={1}
                disabled={!isolation.enabled}
                value={isolation.savingsPct}
                onChange={(e) => setIsolation({ ...isolation, savingsPct: Number(e.target.value) })}
                className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-eco"
              />
            </div>
          </CardContent>
        </Card>

        {/* Card 2: LED */}
        <Card className={`transition-all border ${lighting.enabled ? "border-primary/50 shadow-sm" : "opacity-60 border-border"}`}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-solar/12 text-solar">
                  <Lightbulb className="h-4 w-4" aria-hidden="true" />
                </div>
                <div>
                  <CardTitle className="text-base font-semibold">Éclairage LED</CardTitle>
                  <CardDescription className="text-xs">Rétrofit LED & capteurs</CardDescription>
                </div>
              </div>
              <input
                type="checkbox"
                checked={lighting.enabled}
                onChange={(e) => setLighting({ ...lighting, enabled: e.target.checked })}
                className="h-4 w-4 accent-primary rounded cursor-pointer"
                title="Activer ce levier"
                aria-label="Activer l'éclairage LED"
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Investissement :</span>
                <span className="font-semibold text-foreground">{formatCurrency(lighting.investment)}</span>
              </div>
              <input
                type="range"
                min={10000}
                max={300000}
                step={5000}
                disabled={!lighting.enabled}
                value={lighting.investment}
                onChange={(e) => setLighting({ ...lighting, investment: Number(e.target.value) })}
                className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Économie estimée :</span>
                <span className="font-semibold text-eco dark:text-eco">{lighting.savingsPct}%</span>
              </div>
              <input
                type="range"
                min={5}
                max={35}
                step={1}
                disabled={!lighting.enabled}
                value={lighting.savingsPct}
                onChange={(e) => setLighting({ ...lighting, savingsPct: Number(e.target.value) })}
                className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-eco"
              />
            </div>
          </CardContent>
        </Card>

        {/* Card 3: Climatisation */}
        <Card className={`transition-all border ${hvac.enabled ? "border-primary/50 shadow-sm" : "opacity-60 border-border"}`}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-md bg-volt/10 text-volt flex items-center justify-center">
                  <Wind className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-base font-semibold">Climatisation</CardTitle>
                  <CardDescription className="text-xs">Systèmes Inverter A+++</CardDescription>
                </div>
              </div>
              <input
                type="checkbox"
                checked={hvac.enabled}
                onChange={(e) => setHvac({ ...hvac, enabled: e.target.checked })}
                className="h-4 w-4 accent-primary rounded cursor-pointer"
                title="Activer ce levier"
                aria-label="Activer la climatisation performante"
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Investissement :</span>
                <span className="font-semibold text-foreground">{formatCurrency(hvac.investment)}</span>
              </div>
              <input
                type="range"
                min={50000}
                max={800000}
                step={25000}
                disabled={!hvac.enabled}
                value={hvac.investment}
                onChange={(e) => setHvac({ ...hvac, investment: Number(e.target.value) })}
                className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Économie estimée :</span>
                <span className="font-semibold text-eco dark:text-eco">{hvac.savingsPct}%</span>
              </div>
              <input
                type="range"
                min={5}
                max={50}
                step={1}
                disabled={!hvac.enabled}
                value={hvac.savingsPct}
                onChange={(e) => setHvac({ ...hvac, savingsPct: Number(e.target.value) })}
                className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-eco"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 5-Year Recharts Projection Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base font-semibold">
            <span>Projection ROI sur 5 ans — Économies cumulées vs Investissement</span>
            <Badge
              variant={paybackYears !== Infinity && paybackYears <= 5 ? "success" : "warning"}
              dot
              className="text-xs"
            >
              {paybackYears === Infinity
                ? "Aucun levier sélectionné"
                : paybackYears <= 5
                  ? `Rentable en ${paybackYears.toFixed(1)} ans`
                  : `Hors horizon 5 ans (${paybackYears.toFixed(1)} ans)`}
            </Badge>
          </CardTitle>
          <CardDescription>
            Évolution annuelle comparant l&apos;investissement initial au cumul des économies, en
            dinars algériens. {baselineOverride == null && !measuredIsUsable
              ? "Base annuelle : hypothèse de 5 000 kWh, modifiable en haut de page."
              : "Base annuelle issue des mesures."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {statsLoading ? (
            <ChartSkeleton height={340} />
          ) : (
          <div className="h-[340px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid stroke={gridStroke} strokeDasharray="4 4" vertical={false} />
                <XAxis dataKey="year" tick={axisTick} tickLine={false} axisLine={false} />
                <YAxis
                  tick={axisTick}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) => `${Math.round(val / 1000)}k DA`}
                />
                <Tooltip
                  cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
                  formatter={(value: number | string, name: string) => [
                    formatDzdCompact(Number(value)),
                    name,
                  ]}
                  contentStyle={tooltipStyle}
                  labelStyle={tooltipLabelStyle}
                  itemStyle={tooltipItemStyle}
                />
                <Legend wrapperStyle={legendStyle} iconType="circle" />
                <Bar
                  dataKey="Investissement"
                  fill={chartColors.solar}
                  radius={[6, 6, 0, 0]}
                  isAnimationActive
                  animationDuration={450}
                />
                <Bar
                  dataKey="Économies cumulées"
                  fill={chartColors.forecast}
                  radius={[6, 6, 0, 0]}
                  isAnimationActive
                  animationDuration={450}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
