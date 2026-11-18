"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ForecastChart } from "@/components/charts/ForecastChart";
import { KpiSkeleton, ChartSkeleton, TableSkeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { AnimatedCounter } from "@/components/ui/AnimatedCounter";
import { formatPower, formatEnergy } from "@/lib/format";
import { api } from "@/lib/api";
import {
  TrendingUp,
  RefreshCw,
  Clock,
  Zap,
  BatteryCharging,
  Lightbulb,
  CalendarClock,
} from "lucide-react";

function offsetToClock(hourOffset: number): string {
  const date = new Date();
  date.setHours(date.getHours() + hourOffset);
  return date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

export function ForecastPage() {
  const { data: forecast, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["forecast-next24h"],
    queryFn: () => api.getForecastNext24h("SALLE1"),
    refetchInterval: 60000,
    retry: 0,
  });

  const status = (error as { status?: number } | null)?.status;
  const notTrained = status === 503 || status === 404;

  if (isLoading) {
    return (
      <div className="page flex flex-col gap-5">
        <div className="space-y-2">
          <h1 className="text-[26px] font-bold tracking-tight text-foreground">Prévisions 24 h</h1>
          <p className="text-sm text-muted-foreground">
            Prévisions de consommation générées par le modèle XGBoost.
          </p>
        </div>
        <KpiSkeleton count={3} />
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Card>
            <CardContent className="pt-5">
              <ChartSkeleton height={400} />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <TableSkeleton rows={8} cols={4} />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (notTrained) {
    return (
      <div className="page flex flex-col gap-5">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-foreground">Prévisions 24 h</h1>
          <p className="text-sm text-muted-foreground">
            Prévisions de consommation générées par le modèle XGBoost.
          </p>
        </div>
        <EmptyState
          variant="data"
          title="Modèle non entraîné"
          description="Le modèle de prévision n'est pas encore disponible. Lancez l'entraînement puis actualisez cette page."
          action={
            <div className="flex flex-col items-center gap-3">
              <pre className="rounded-lg border border-border bg-muted px-4 py-3 font-mono text-xs text-foreground">
                python -m app.ai.train_forecaster
              </pre>
              <Button onClick={() => void refetch()}>
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Réessayer
              </Button>
            </div>
          }
        />
      </div>
    );
  }

  const predictions = forecast?.predictions ?? [];
  const totalEnergy = predictions.reduce((sum, p) => sum + (p.predicted_energy_kwh ?? 0), 0);
  const peak = predictions.reduce(
    (max, p) => (p.predicted_power > (max?.predicted_power ?? -Infinity) ? p : max),
    predictions[0],
  );
  const avgPower =
    predictions.length > 0
      ? predictions.reduce((sum, p) => sum + p.predicted_power, 0) / predictions.length
      : 0;
  const bandWidth = peak
    ? peak.confidence_upper - peak.confidence_lower
    : 0;

  const kpis = [
    {
      title: "Énergie prévue (24 h)",
      icon: BatteryCharging,
      chip: "bg-eco/12 text-eco",
      value: totalEnergy,
      format: (v: number) => formatEnergy(v),
      subtitle: "Consommation totale prévue",
    },
    {
      title: "Puissance moyenne",
      icon: Zap,
      chip: "bg-volt/12 text-volt",
      value: avgPower,
      format: (v: number) => formatPower(v),
      subtitle: "Moyenne sur l'horizon",
    },
    {
      title: "Heure de pointe",
      icon: Clock,
      chip: "bg-solar/12 text-solar",
      value: peak?.predicted_power ?? 0,
      format: (v: number) => formatPower(v),
      subtitle: peak ? `Pic prévu vers ${offsetToClock(peak.hour_offset)}` : "—",
    },
  ];

  return (
    <div className="page flex flex-col gap-5">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="flex items-center gap-2 text-[26px] font-bold leading-tight tracking-tight text-foreground">
              <TrendingUp className="h-6 w-6 text-volt" aria-hidden="true" />
              Prévisions 24 h
            </h1>
            <Badge variant="outline" dot className="border-success/35 text-success">
              Modèle chargé
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Consommation horaire prévue par XGBoost, avec intervalle de confiance à ±1,5 × MAE.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant="secondary" className="font-mono">
            R² 93,7 %
          </Badge>
          <Button onClick={() => void refetch()} disabled={isFetching}>
            <RefreshCw
              className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            Recalculer
          </Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div
              key={kpi.title}
              className="relative overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-panel"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {kpi.title}
                  </p>
                  <p className="metric mt-2 text-[26px] font-bold leading-none text-foreground">
                    <AnimatedCounter value={kpi.value} format={kpi.format} />
                  </p>
                  <p className="mt-1.5 text-[11px] text-muted-foreground">{kpi.subtitle}</p>
                </div>
                <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${kpi.chip}`}>
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Actionable insight */}
      {peak && (
        <div className="flex flex-col gap-3 rounded-2xl border border-volt/25 bg-volt/8 p-4 sm:flex-row sm:items-center">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-volt/15 text-volt">
            <Lightbulb className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">
              Pointe attendue vers {offsetToClock(peak.hour_offset)} — {formatPower(peak.predicted_power)}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Intervalle de confiance{" "}
              <span className="font-mono">
                {formatPower(peak.confidence_lower)} – {formatPower(peak.confidence_upper)}
              </span>{" "}
              (±{formatPower(bandWidth / 2)}). Décalez les usages flexibles (climatisation, pompes)
              hors de cette fenêtre pour lisser la demande.
            </p>
          </div>
          <Badge variant="volt" className="shrink-0">
            Pic J+0
          </Badge>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Courbe de prévision</CardTitle>
            <CardDescription>
              Trait plein : puissance prévue · bande : intervalle de confiance.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ForecastChart height={400} predictions={predictions} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                  <CalendarClock className="h-4 w-4 text-volt" aria-hidden="true" />
                  Détail horaire
                </CardTitle>
                <CardDescription>24 échéances glissantes.</CardDescription>
              </div>
              <Badge variant="outline" className="font-mono">
                H+1 → H+24
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {predictions.length === 0 ? (
              <EmptyState
                variant="data"
                title="Aucune prévision"
                description="Le modèle n'a renvoyé aucune prédiction pour le moment."
                compact
              />
            ) : (
              <div className="max-h-[400px] overflow-auto rounded-lg border border-border">
                <table className="w-full border-collapse text-sm">
                  <thead className="sticky top-0 z-10 bg-card">
                    <tr className="border-b border-border">
                      {["Heure", "Puissance", "Énergie", "Intervalle"].map((label, index) => (
                        <th
                          key={label}
                          className={`px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground ${
                            index === 0 ? "text-left" : "text-right"
                          }`}
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {predictions.map((p) => (
                      <tr
                        key={p.hour_offset}
                        className="border-b border-border/60 last:border-0 hover:bg-muted/40"
                      >
                        <td className="px-3 py-2 font-mono text-xs text-foreground">
                          {offsetToClock(p.hour_offset)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs text-foreground">
                          {formatPower(p.predicted_power)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs text-foreground">
                          {formatEnergy(p.predicted_energy_kwh)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-[10px] text-muted-foreground">
                          {formatPower(p.confidence_lower)} – {formatPower(p.confidence_upper)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
