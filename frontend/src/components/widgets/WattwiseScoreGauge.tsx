"use client";

import React from "react";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/components/ui/Button";
import { ArrowDownRight, ArrowUpRight, Gauge, Minus } from "lucide-react";

interface WattwiseScoreGaugeProps {
  score: number;
  grade: string;
  trend: string;
}

function tone(score: number) {
  if (score >= 80)
    return {
      text: "text-eco",
      ring: "hsl(var(--eco))",
      label: "Excellent",
      chip: "border-eco/35 bg-eco/12 text-eco",
    };
  if (score >= 60)
    return {
      text: "text-volt",
      ring: "hsl(var(--volt))",
      label: "Correct",
      chip: "border-volt/35 bg-volt/12 text-volt",
    };
  if (score >= 40)
    return {
      text: "text-warning",
      ring: "hsl(var(--warning))",
      label: "À surveiller",
      chip: "border-warning/40 bg-warning/12 text-warning",
    };
  return {
    text: "text-destructive",
    ring: "hsl(var(--destructive))",
    label: "Critique",
    chip: "border-destructive/35 bg-destructive/12 text-destructive",
  };
}

export function WattwiseScoreGauge({ score, grade, trend }: WattwiseScoreGaugeProps) {
  const palette = tone(score);
  const safeScore = Math.max(0, Math.min(100, score));
  const circumference = 2 * Math.PI * 34;
  const isUp = trend.startsWith("+");
  const isFlat = trend === "—" || trend === "0" || trend === "";
  const TrendIcon = isFlat ? Minus : isUp ? ArrowUpRight : ArrowDownRight;

  return (
    <section
      aria-label="Wattwise Score"
      className="sheen relative overflow-hidden rounded-2xl border border-border bg-panel-fade p-5 shadow-panel"
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        {/* Ring */}
        <div className="relative flex h-[104px] w-[104px] shrink-0 items-center justify-center">
          <svg viewBox="0 0 80 80" className="h-[104px] w-[104px] -rotate-90" aria-hidden="true">
            <circle
              cx="40"
              cy="40"
              r="34"
              fill="none"
              stroke="hsl(var(--muted))"
              strokeWidth="6"
            />
            <circle
              cx="40"
              cy="40"
              r="34"
              fill="none"
              stroke={palette.ring}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - safeScore / 100)}
              className="transition-[stroke-dashoffset] duration-700 ease-out"
              style={{ filter: "drop-shadow(0 0 6px hsl(var(--volt) / 0.35))" }}
            />
          </svg>
          <div className="absolute flex flex-col items-center">
            <span className={cn("metric text-3xl font-bold leading-none", palette.text)}>
              {score}
            </span>
            <span className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
              / 100
            </span>
          </div>
        </div>

        {/* Text block */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Gauge className="h-4 w-4 text-volt" aria-hidden="true" />
            <h2 className="text-sm font-semibold tracking-tight">Wattwise Score</h2>
            <Badge variant="outline" className={cn("border", palette.chip)} dot>
              {palette.label}
            </Badge>
            <Badge variant="outline" className="font-mono">
              Grade {grade}
            </Badge>
          </div>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Indice de performance énergétique du bâtiment, calculé sur les alertes actives et le
            Mode Éco.
          </p>

          {/* Scale */}
          <div className="mt-3">
            <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full transition-[width] duration-700 ease-out"
                style={{
                  width: `${safeScore}%`,
                  background:
                    "linear-gradient(90deg, hsl(var(--destructive)), hsl(var(--warning)) 42%, hsl(var(--volt)) 68%, hsl(var(--eco)))",
                }}
              />
            </div>
            <div className="mt-1 flex justify-between font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground/70">
              <span>0</span>
              <span>50</span>
              <span>100</span>
            </div>
          </div>
        </div>

        {/* Trend */}
        <div className="flex shrink-0 items-center gap-2 rounded-xl border border-border bg-card/60 px-3 py-2">
          <TrendIcon
            className={cn(
              "h-4 w-4",
              isFlat ? "text-muted-foreground" : isUp ? "text-eco" : "text-destructive",
            )}
            aria-hidden="true"
          />
          <div>
            <p
              className={cn(
                "metric text-sm font-semibold",
                isFlat ? "text-foreground" : isUp ? "text-eco" : "text-destructive",
              )}
            >
              {trend}
            </p>
            <p className="text-[10px] text-muted-foreground">vs semaine dernière</p>
          </div>
        </div>
      </div>
    </section>
  );
}

WattwiseScoreGauge.displayName = "WattwiseScoreGauge";
