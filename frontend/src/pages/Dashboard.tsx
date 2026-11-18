"use client";

import React, { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { motion } from "framer-motion";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button, cn } from "@/components/ui/Button";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  ReferenceLine,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { KpiSkeleton, ChartSkeleton } from "@/components/ui/Skeleton";
import { AnimatedCounter } from "@/components/ui/AnimatedCounter";
import { Sparkline } from "@/components/widgets/Sparkline";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  formatPower,
  formatEnergyAuto,
  formatCurrency,
  formatRelativeFr,
} from "@/lib/format";
import {
  systemStatusFromCounts,
  ALERT_TYPE_LABELS,
} from "@/lib/constants";
import { api } from "@/lib/api";
import {
  axisTick,
  chartColors,
  gridStroke,
  tooltipItemStyle,
  tooltipLabelStyle,
  tooltipStyle,
  legendStyle,
} from "@/lib/chartTheme";
import {
  Zap,
  Sun,
  PiggyBank,
  Bell,
  BrainCircuit,
  ArrowUpRight,
  ArrowDownRight,
  ChevronRight,
  RefreshCw,
  Radio,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

type KpiTone = "volt" | "solar" | "eco" | "alert";

const TONE_CLASSES: Record<KpiTone, { chip: string; rail: string; spark: string }> = {
  volt: {
    chip: "bg-volt/12 text-volt",
    rail: "from-volt/70 via-volt/25 to-transparent",
    spark: "hsl(var(--volt))",
  },
  solar: {
    chip: "bg-solar/12 text-solar",
    rail: "from-solar/70 via-solar/25 to-transparent",
    spark: "hsl(var(--solar))",
  },
  eco: {
    chip: "bg-eco/12 text-eco",
    rail: "from-eco/70 via-eco/25 to-transparent",
    spark: "hsl(var(--eco))",
  },
  alert: {
    chip: "bg-destructive/12 text-destructive",
    rail: "from-destructive/70 via-destructive/25 to-transparent",
    spark: "hsl(var(--destructive))",
  },
};

function KpiCard({
  title,
  icon: Icon,
  tone,
  value,
  subtitle,
  delta,
  spark,
  delay = 0,
}: {
  title: string;
  icon: React.ElementType;
  tone: KpiTone;
  value: React.ReactNode;
  subtitle: string;
  delta?: { value: number; suffix: string; positiveIsGood?: boolean } | null;
  spark?: number[];
  delay?: number;
}) {
  const palette = TONE_CLASSES[tone];
  const DeltaIcon = delta && delta.value < 0 ? ArrowDownRight : ArrowUpRight;
  const positive = delta ? (delta.positiveIsGood ?? false ? delta.value >= 0 : delta.value < 0) : false;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="group relative overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-panel transition-shadow duration-200 hover:shadow-panel-hover"
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute inset-x-0 top-0 h-px bg-gradient-to-r opacity-80",
          palette.rail,
        )}
      />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {title}
          </p>
          <p className="metric mt-2 truncate text-[26px] font-bold leading-none text-foreground">
            {value}
          </p>
          <p className="mt-1.5 truncate text-[11px] text-muted-foreground">{subtitle}</p>
        </div>
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
            palette.chip,
          )}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>

      <div className="mt-3 flex items-end justify-between gap-2">
        {delta ? (
          <span
            className={cn(
              "flex items-center gap-1 whitespace-nowrap font-mono text-[10px] font-semibold",
              positive ? "text-eco" : "text-copper",
            )}
          >
            <DeltaIcon className="h-3 w-3 shrink-0" aria-hidden="true" />
            {delta.value > 0 ? "+" : "−"}
            {Math.abs(delta.value)}
            {delta.suffix}
          </span>
        ) : (
          <span />
        )}
        {spark && spark.length > 1 && (
          <Sparkline
            values={spark}
            width={86}
            height={26}
            stroke={palette.spark}
            className="opacity-90"
          />
        )}
      </div>
    </motion.div>
  );
}

const INSIGHT_SEVERITY: Record<string, { badge: "destructive" | "warning" | "volt"; icon: typeof Zap }> = {
  critical: { badge: "destructive", icon: AlertTriangle },
  warning: { badge: "warning", icon: Bell },
  info: { badge: "volt", icon: ShieldCheck },
};

export function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: tree } = useQuery({
    queryKey: ["building-tree"],
    queryFn: () => api.getBuildingTree(1),
    staleTime: 30000,
  });

  const { data: insights, isLoading: insightsLoading } = useQuery({
    queryKey: ["insights"],
    queryFn: () => api.getInsights(),
    refetchInterval: 60000,
  });

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["stats", "SALLE1", 24],
    queryFn: () => api.getStatsSummary({ device_id: "SALLE1", hours: 24 }),
    refetchInterval: 30000,
  });

  const { data: readings, isLoading: readingsLoading } = useQuery({
    queryKey: ["readings-latest"],
    queryFn: () => api.getReadingsLatest({ limit: 100, device_id: "SALLE1" }),
    refetchInterval: 10000,
  });

  const { data: solarHistory = [], isLoading: solarLoading } = useQuery({
    queryKey: ["solar-history"],
    queryFn: () => api.getSolarHistory(24),
    refetchInterval: 60000,
  });

  const { data: savings, isLoading: savingsLoading } = useQuery({
    queryKey: ["savings-summary"],
    queryFn: () =>
      api.getSavingsSummary({
        from: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10),
      }),
    refetchInterval: 60000,
  });

  const { data: alerts = [], isLoading: alertsLoading } = useQuery({
    queryKey: ["alerts-active"],
    queryFn: () => api.getAlertsActive({}),
    refetchInterval: 30000,
  });

  const zones = useMemo(() => (tree?.floors ?? []).flatMap((floor) => floor.zones), [tree]);
  const buildingName = tree?.name ?? "ESI-SBA";

  // --- System status badge -------------------------------------------------
  const criticalCount = insights?.critical_count ?? 0;
  const warningCount = insights?.warning_count ?? 0;
  const systemStatus = systemStatusFromCounts(criticalCount, warningCount);
  const SYSTEM_BADGE: Record<string, "success" | "warning" | "destructive"> = {
    ok: "success",
    warning: "warning",
    critical: "destructive",
  };

  // --- KPI values ----------------------------------------------------------
  const energy = stats?.total_energy_kwh;
  const powerStats = stats
    ? { avg: stats.avg_power_w, max: stats.max_power_w }
    : null;
  const consumptionDelta =
    powerStats && powerStats.avg != null && powerStats.max != null && powerStats.avg > 0
      ? Math.round(((powerStats.max - powerStats.avg) / powerStats.avg) * 100)
      : null;

  const solarKwh = useMemo(() => {
    if (solarHistory.length === 0) return null;
    const spanHours = 24;
    return solarHistory.reduce((acc, point) => acc + (point.power_kw ?? 0), 0) *
      (spanHours / solarHistory.length);
  }, [solarHistory]);
  const solarSpark = solarHistory.slice(0, 40).map((p) => p.power_kw).reverse();

  const readingsSpark = (readings ?? [])
    .slice(0, 40)
    .map((r) => r.power ?? 0)
    .reverse();

  const anomalyCritical = alerts.filter(
    (a) => a.severity === "CRITICAL" || a.severity === "HIGH",
  ).length;

  // --- Chart 1: consumption vs reference ------------------------------------
  const consumptionData = useMemo(
    () =>
      (readings ?? [])
        .filter((r) => (r.power ?? 0) > 0 && (r.power ?? 0) <= 10000)
        .slice(0, 60)
        .map((r) => ({
          timestamp: r.timestamp,
          power: r.power ?? 0,
        }))
        .sort(
          (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
        ),
    [readings],
  );
  const referencePower = powerStats?.avg ?? null;

  // --- Chart 2: zone breakdown pie -----------------------------------------
  const zoneData = useMemo(
    () =>
      zones
        .map((zone) => ({
          name: zone.name,
          value: Number(
            zone.equipment.reduce((acc, eq) => acc + (eq.current_power_kw ?? 0), 0).toFixed(2),
          ),
          status: zone.equipment.some((eq) => eq.status === "alert")
            ? "alert"
            : zone.equipment.some((eq) => eq.status === "warning")
              ? "warning"
              : "ok",
        }))
        .filter((z) => z.value > 0),
    [zones],
  );
  const ZONE_COLORS: Record<string, string> = {
    ok: chartColors.success,
    warning: chartColors.warning,
    alert: chartColors.danger,
  };

  // --- Action prioritaire ---------------------------------------------------
  const priorityAlert = useMemo(() => {
    const order: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    return [...alerts].sort(
      (a, b) => (order[a.severity ?? "LOW"] ?? 4) - (order[b.severity ?? "LOW"] ?? 4),
    )[0];
  }, [alerts]);

  const refresh = () => {
    queryClient.invalidateQueries();
    toast.success("Données actualisées");
  };

  const kpisLoading = statsLoading || solarLoading || savingsLoading || alertsLoading;

  return (
    <div className="page flex flex-col gap-5">
      {/* ------------------------------ Header ------------------------------ */}
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[26px] font-bold leading-tight tracking-tight text-foreground">
              {buildingName}
            </h1>
            <Badge variant={SYSTEM_BADGE[systemStatus.key]} dot>
              {systemStatus.label}
            </Badge>
            <Badge variant="outline" className="gap-1">
              <Radio className="h-2.5 w-2.5" aria-hidden="true" />
              TEMPS RÉEL
              <span className="live-dot" aria-hidden="true" />
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Centre de contrôle énergétique · dernière mise à jour{" "}
            {readings?.[0]?.timestamp ? formatRelativeFr(readings[0].timestamp) : "—"}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={refresh}
          aria-label="Actualiser le tableau de bord"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          Actualiser
        </Button>
      </div>

      {/* ------------------- Hero : Briefing Énergétique IA ------------------ */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        className="relative overflow-hidden rounded-2xl border border-volt/30 bg-gradient-to-br from-volt/10 via-card to-solar/8 p-5 shadow-panel"
      >
        <span
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-volt via-solar to-transparent"
        />
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-volt/15 text-volt">
            <BrainCircuit className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold text-foreground">
                Briefing Énergétique de l&apos;IA
              </h2>
              <Badge variant="volt">Energy Brain</Badge>
              {(criticalCount > 0 || warningCount > 0) && (
                <Badge variant={criticalCount > 0 ? "destructive" : "warning"}>
                  {criticalCount > 0
                    ? `${criticalCount} critique(s)`
                    : `${warningCount} à surveiller`}
                </Badge>
              )}
            </div>
            {insightsLoading ? (
              <div className="mt-2 space-y-2">
                <div className="h-3.5 w-3/4 animate-pulse rounded bg-muted" />
                <div className="h-3.5 w-1/2 animate-pulse rounded bg-muted" />
              </div>
            ) : (
              <>
                <p className="mt-1.5 text-[13px] leading-relaxed text-foreground/90">
                  {insights?.briefing ?? "Analyse en cours du bâtiment…"}
                </p>
                {insights && insights.insights.length > 1 && (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {insights.insights.slice(1, 4).map((insight) => {
                      const meta = INSIGHT_SEVERITY[insight.severity] ?? INSIGHT_SEVERITY.info;
                      const Icon = meta.icon;
                      return (
                        <span
                          key={insight.rule_id}
                          className="flex items-center gap-1.5 rounded-full border border-border/70 bg-background/50 px-2.5 py-1 text-[11px] text-foreground/80"
                        >
                          <Icon className="h-3 w-3" aria-hidden="true" />
                          {insight.title}
                        </span>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </motion.div>

      {/* ------------------------------- KPIs ------------------------------- */}
      {kpisLoading ? (
        <KpiSkeleton count={4} />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            title="Consommation du jour"
            icon={Zap}
            tone="volt"
            value={
              energy != null ? (
                <>
                  <AnimatedCounter value={energy} format={(v) => formatEnergyAuto(v)} />
                  <span className="ml-1 text-sm font-medium text-muted-foreground">kWh</span>
                </>
              ) : (
                "—"
              )
            }
            subtitle={
              powerStats ? `pic ${formatPower(powerStats.max)} · moy. ${formatPower(powerStats.avg)}` : "—"
            }
            delta={
              consumptionDelta != null
                ? { value: consumptionDelta, suffix: " % vs moyenne", positiveIsGood: false }
                : null
            }
            spark={readingsSpark}
            delay={0}
          />
          <KpiCard
            title="Production Solaire"
            icon={Sun}
            tone="solar"
            value={
              solarKwh != null ? (
                <>
                  <AnimatedCounter value={solarKwh} format={(v) => v.toFixed(1)} />
                  <span className="ml-1 text-sm font-medium text-muted-foreground">kWh</span>
                </>
              ) : (
                "—"
              )
            }
            subtitle="cumul 24 h · panneaux PV1"
            spark={solarSpark}
            delay={0.05}
          />
          <KpiCard
            title="Économies vérifiées"
            icon={PiggyBank}
            tone="eco"
            value={
              savings ? (
                <>
                  <AnimatedCounter value={savings.total_saved_dzd} format={(v) => formatCurrency(v)} />
                </>
              ) : (
                "—"
              )
            }
            subtitle={
              savings && savings.total_saved_kwh > 0
                ? `${savings.total_saved_kwh.toFixed(1)} kWh économisés`
                : "workflow d'action vérifié"
            }
            delay={0.1}
          />
          <KpiCard
            title="Anomalies actives"
            icon={Bell}
            tone="alert"
            value={
              <>
                <AnimatedCounter value={alerts.length} />
              </>
            }
            subtitle={
              anomalyCritical > 0
                ? `${anomalyCritical} sévérité haute ou critique`
                : "aucune anomalie critique"
            }
            delay={0.15}
          />
        </div>
      )}

      {/* --------------------------- 2 charts max --------------------------- */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Consommation vs Référence</CardTitle>
            <CardDescription>
              Salle 101 (SALLE1) · ligne de référence = moyenne 24 h
            </CardDescription>
          </CardHeader>
          <CardContent>
            {readingsLoading ? (
              <ChartSkeleton height={240} />
            ) : consumptionData.length === 0 ? (
              <EmptyState variant="data" compact title="Aucune mesure disponible" />
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={consumptionData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="timestamp"
                    tick={axisTick}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={40}
                    tickFormatter={(value: string) =>
                      new Date(value).toLocaleTimeString("fr-FR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    }
                  />
                  <YAxis
                    tick={axisTick}
                    tickLine={false}
                    axisLine={false}
                    width={44}
                    tickFormatter={(value: number) => formatPower(value)}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelStyle={tooltipLabelStyle}
                    itemStyle={tooltipItemStyle}
                    labelFormatter={(value: string) =>
                      new Date(value).toLocaleString("fr-FR", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    }
                    formatter={(value: number) => [formatPower(value), "Puissance"]}
                  />
                  {referencePower != null && (
                    <ReferenceLine
                      y={referencePower}
                      stroke={chartColors.forecast}
                      strokeDasharray="6 4"
                      label={{
                        value: "Référence",
                        position: "insideTopRight",
                        fill: axisTick.fill,
                        fontSize: 10,
                      }}
                    />
                  )}
                  <Line
                    type="monotone"
                    dataKey="power"
                    stroke={chartColors.consumption}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Répartition par zone</CardTitle>
            <CardDescription>Puissance actuelle par salle du bâtiment</CardDescription>
          </CardHeader>
          <CardContent>
            {zoneData.length === 0 ? (
              <EmptyState
                variant="data"
                compact
                title="Aucune zone mesurée"
                description="Les zones apparaîtront dès que les équipements transmettent des mesures."
              />
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={zoneData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={52}
                    outerRadius={82}
                    paddingAngle={3}
                    strokeWidth={0}
                  >
                    {zoneData.map((entry) => (
                      <Cell key={entry.name} fill={ZONE_COLORS[entry.status] ?? chartColors.neutral} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelStyle={tooltipLabelStyle}
                    itemStyle={tooltipItemStyle}
                    formatter={(value: number, name: string) => [
                      formatPower(value * 1000),
                      name,
                    ]}
                  />
                  <Legend
                    iconSize={8}
                    wrapperStyle={legendStyle}
                    formatter={(value: string) => (
                      <span className="text-[11px] text-muted-foreground">{value}</span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ------------------------- Action prioritaire ------------------------ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Bell className="h-4 w-4 text-destructive" aria-hidden="true" />
            Action Prioritaire
          </CardTitle>
          <CardDescription>
            L&apos;anomalie la plus critique à traiter dans le workflow
          </CardDescription>
        </CardHeader>
        <CardContent>
          {alertsLoading ? (
            <div className="h-16 animate-pulse rounded-xl bg-muted" />
          ) : !priorityAlert ? (
            <EmptyState
              variant="success"
              compact
              title="Aucune action prioritaire"
              description="Toutes les anomalies ont été traitées. Le bâtiment fonctionne de manière optimale."
            />
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22 }}
              className={cn(
                "flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center",
                priorityAlert.severity === "CRITICAL" || priorityAlert.severity === "HIGH"
                  ? "border-destructive/40 bg-destructive/6"
                  : "border-border bg-muted/20",
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge
                    variant={
                      priorityAlert.severity === "CRITICAL" || priorityAlert.severity === "HIGH"
                        ? "destructive"
                        : priorityAlert.severity === "MEDIUM"
                          ? "warning"
                          : "volt"
                    }
                  >
                    {priorityAlert.severity === "CRITICAL"
                      ? "Critique"
                      : priorityAlert.severity === "HIGH"
                        ? "Haute"
                        : priorityAlert.severity === "MEDIUM"
                          ? "Moyenne"
                          : "Faible"}
                  </Badge>
                  {priorityAlert.is_demo && <Badge variant="volt">Démo</Badge>}
                  <span className="text-[10px] text-muted-foreground">
                    {formatRelativeFr(priorityAlert.timestamp)}
                  </span>
                </div>
                <p className="mt-1.5 text-[13px] font-medium leading-snug text-foreground">
                  {priorityAlert.message}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {priorityAlert.type
                    ? ALERT_TYPE_LABELS[priorityAlert.type] ?? priorityAlert.type
                    : "—"}{" "}
                  · {priorityAlert.device_id}
                </p>
              </div>
              <Button
                size="sm"
                className="shrink-0 cursor-pointer gap-1.5"
                onClick={() => navigate("/actions")}
                aria-label="Voir dans le Centre d'Actions"
              >
                Voir dans le Centre d&apos;Actions
                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </motion.div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
