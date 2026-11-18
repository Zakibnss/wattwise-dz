"use client";

import * as React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/components/ui/Button";
import { formatPower, formatTimeFr } from "@/lib/format";
import { Activity, ArrowDown, ArrowUp, Waves } from "lucide-react";
import type { Reading } from "@/lib/api";

interface LoadAnalysisProps {
  readings: Reading[];
  isLoading?: boolean;
}

/**
 * Load profile of the current measurement window.
 *
 * Everything here is derived from the readings already loaded by the page:
 * peak demand, base load (10th percentile), average and the load factor,
 * plus the hour of the peak. No value is invented when there is no data.
 */
export function LoadAnalysis({ readings, isLoading = false }: LoadAnalysisProps) {
  const analysis = React.useMemo(() => {
    const powers = readings
      .map((reading) => reading.power ?? 0)
      .filter((power) => power <= 10000); // drop simulator fault spikes
    if (powers.length < 3) return null;

    const sorted = [...powers].sort((a, b) => a - b);
    const avg = powers.reduce((sum, value) => sum + value, 0) / powers.length;
    const peak = Math.max(...powers);
    const baseIndex = Math.floor(sorted.length * 0.1);
    const base = sorted[baseIndex] ?? sorted[0];
    const peakReading = readings.find((reading) => (reading.power ?? 0) === peak);
    const variance =
      powers.reduce((sum, value) => sum + (value - avg) ** 2, 0) / powers.length;
    const stdDev = Math.sqrt(variance);
    const loadFactor = peak > 0 ? (avg / peak) * 100 : 0;

    return { avg, peak, base, stdDev, loadFactor, peakAt: peakReading?.timestamp ?? null };
  }, [readings]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Profil de charge</CardTitle>
          <CardDescription>Calcul en cours…</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-28 animate-pulse rounded-lg bg-muted/60" />
        </CardContent>
      </Card>
    );
  }

  if (!analysis) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Waves className="h-4 w-4 text-volt" aria-hidden="true" />
            <CardTitle className="text-sm font-semibold">Profil de charge</CardTitle>
          </div>
          <CardDescription>
            Le profil apparaîtra dès que trois mesures consécutives seront disponibles.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
            Données insuffisantes — aucune valeur n&apos;est estimée.
          </p>
        </CardContent>
      </Card>
    );
  }

  const loadFactorTone =
    analysis.loadFactor >= 70 ? "eco" : analysis.loadFactor >= 40 ? "volt" : "copper";

  const stats = [
    {
      label: "Pic",
      value: formatPower(analysis.peak),
      hint: analysis.peakAt ? `à ${formatTimeFr(analysis.peakAt)}` : "—",
      icon: ArrowUp,
    },
    {
      label: "Base",
      value: formatPower(analysis.base),
      hint: "10ᵉ centile",
      icon: ArrowDown,
    },
    {
      label: "Moyenne",
      value: formatPower(analysis.avg),
      hint: `σ ${formatPower(analysis.stdDev)}`,
      icon: Activity,
    },
  ];

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <Waves className="h-4 w-4 text-volt" aria-hidden="true" />
              <CardTitle className="text-sm font-semibold">Profil de charge</CardTitle>
            </div>
            <CardDescription>
              Analyse de la fenêtre de mesures courante.
            </CardDescription>
          </div>
          <Badge variant="outline" dot className="font-mono">
            {readings.length} trames
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <div
                key={stat.label}
                className="rounded-xl border border-border bg-muted/25 px-2.5 py-2"
              >
                <p className="flex items-center gap-1 text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
                  <Icon className="h-2.5 w-2.5" aria-hidden="true" />
                  {stat.label}
                </p>
                <p className="metric mt-1 text-sm font-bold text-foreground">{stat.value}</p>
                <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{stat.hint}</p>
              </div>
            );
          })}
        </div>

        <div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">Facteur de charge</span>
            <span className="metric font-semibold text-foreground">
              {analysis.loadFactor.toFixed(0)} %
            </span>
          </div>
          <div
            className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(analysis.loadFactor)}
            aria-label="Facteur de charge"
          >
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-700 ease-out",
                loadFactorTone === "eco"
                  ? "bg-eco"
                  : loadFactorTone === "volt"
                    ? "bg-volt"
                    : "bg-copper",
              )}
              style={{ width: `${Math.min(100, analysis.loadFactor)}%` }}
            />
          </div>
          <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
            {analysis.loadFactor >= 70
              ? "Charge régulière : le bâtiment tourne près de son régime nominal."
              : analysis.loadFactor >= 40
                ? "Charge modérée : des pointes ponctuelles réduisent l'efficacité."
                : "Charge en dents de scie : les pointes dominent, un lissage (Mode Éco) est rentable."}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
