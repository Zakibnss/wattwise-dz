"use client";

import { cn } from "@/components/ui/Button";
import { Cpu } from "lucide-react";

type ModelStatusProps = {
  loaded: boolean;
  name: string;
  metrics: Record<string, unknown> | null;
};

const METRIC_LABELS: Record<string, string> = {
  mae: "MAE",
  rmse: "RMSE",
  r2: "R²",
  n_samples: "Échantillons",
  trained_at: "Entraîné le",
  model_name: "Modèle",
  n_train: "Train",
  n_test: "Test",
};

function formatMetric(key: string, value: unknown): string {
  if (typeof value !== "number") return String(value);
  if (key === "r2") return value.toFixed(3);
  if (key === "n_samples" || key === "n_train" || key === "n_test") {
    return new Intl.NumberFormat("fr-FR").format(value);
  }
  if (key === "mae" || key === "rmse") return `${Math.round(value)} W`;
  return value.toFixed(2);
}

export function ModelStatus({ loaded, name, metrics }: ModelStatusProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-volt/12 text-volt">
            <Cpu className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          <p className="font-mono text-xs font-semibold text-foreground">{name}</p>
        </div>
        <span
          className={cn(
            "chip",
            loaded
              ? "border-eco/35 bg-eco/12 text-eco"
              : "border-warning/40 bg-warning/12 text-warning",
          )}
        >
          <span
            className={cn("h-1.5 w-1.5 rounded-full", loaded ? "bg-eco" : "bg-warning")}
            aria-hidden="true"
          />
          {loaded ? "Chargé" : "Non chargé"}
        </span>
      </div>

      {metrics ? (
        <dl className="grid grid-cols-2 gap-2">
          {Object.entries(metrics)
            .filter(([key]) => ["mae", "rmse", "r2", "n_samples"].includes(key))
            .map(([key, value]) => (
              <div key={key} className="rounded-lg border border-border bg-muted/25 px-2.5 py-1.5">
                <dt className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                  {METRIC_LABELS[key] ?? key}
                </dt>
                <dd className="metric mt-0.5 truncate text-[11px] font-semibold text-foreground">
                  {formatMetric(key, value)}
                </dd>
              </div>
            ))}
        </dl>
      ) : (
        <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
          Aucune métrique disponible
        </p>
      )}
    </div>
  );
}
