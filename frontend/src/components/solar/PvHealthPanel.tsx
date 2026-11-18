"use client";

import React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  Info,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Wrench,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/components/ui/Button";
import { formatDateFr } from "@/lib/format";
import type { PvFault, PvFaultsResponse } from "@/lib/api";

const FAULT_LABELS: Record<string, string> = {
  PV_UNDERPERFORMANCE: "Sous-performance",
  PV_PANEL_OVERHEAT: "Surchauffe panneau",
  INVERTER_DEGRADATION: "Dégradation onduleur",
  INVERTER_OVERHEAT: "Surchauffe onduleur",
  PV_PRODUCTION_DROP: "Chute de production",
  PV_SENSOR_INCONSISTENCY: "Incohérence capteurs",
  PV_DATA_STALE: "Données obsolètes",
};

const STATUS_STYLES: Record<
  string,
  { ring: string; text: string; badge: "success" | "warning" | "destructive" | "outline"; icon: typeof ShieldCheck }
> = {
  normal: {
    ring: "#10b981",
    text: "text-eco dark:text-eco",
    badge: "success",
    icon: ShieldCheck,
  },
  warning: {
    ring: "#f59e0b",
    text: "text-solar dark:text-solar",
    badge: "warning",
    icon: ShieldAlert,
  },
  critical: {
    ring: "hsl(var(--destructive))",
    text: "text-destructive",
    badge: "destructive",
    icon: ShieldX,
  },
  unknown: {
    ring: "hsl(var(--muted-foreground))",
    text: "text-muted-foreground",
    badge: "outline",
    icon: CircleHelp,
  },
};

function severityVariant(severity: string): "destructive" | "warning" | "secondary" {
  if (severity === "CRITICAL") return "destructive";
  if (severity === "WARNING") return "warning";
  return "secondary";
}

function FaultRow({ fault }: { fault: PvFault }) {
  return (
    <li className="rounded-lg border border-border bg-muted/20 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={severityVariant(fault.severity)} className="text-[10px]">
          {fault.severity === "CRITICAL" ? "Critique" : "Avertissement"}
        </Badge>
        <span className="text-sm font-semibold text-foreground">
          {FAULT_LABELS[fault.fault_type] ?? fault.fault_type}
        </span>
        <Badge variant="outline" className="text-[10px] font-medium">
          {fault.is_confirmed ? "Confirmé" : "Non confirmé"}
        </Badge>
        <span className="ml-auto text-[11px] text-muted-foreground">
          {fault.occurrences} détection{fault.occurrences > 1 ? "s" : ""}
        </span>
      </div>
      <p className="mt-2 text-sm text-foreground">{fault.message}</p>
      {fault.explanation && (
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {fault.explanation}
        </p>
      )}
      {fault.recommended_action && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-foreground">
          <Wrench className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
          <span>{fault.recommended_action}</span>
        </p>
      )}
      <p className="mt-2 text-[11px] text-muted-foreground">
        Première détection : {formatDateFr(fault.first_detected_at)} · Dernière :{" "}
        {formatDateFr(fault.last_detected_at)}
      </p>
    </li>
  );
}

interface PvHealthPanelProps {
  data?: PvFaultsResponse;
  isLoading?: boolean;
}

/**
 * PV health score and persistent rule-based diagnostics.
 *
 * The panel deliberately separates "anomaly detected by rules" from
 * "confirmed physical fault" (the backend never sets `is_confirmed`).
 */
export function PvHealthPanel({ data, isLoading = false }: PvHealthPanelProps) {
  const status = data?.health_status ?? "unknown";
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.unknown;
  const Icon = style.icon;
  const score = data?.health_score ?? null;
  const percentage = score == null ? 0 : Math.max(0, Math.min(100, score));
  const circumference = 2 * Math.PI * 42;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3 w-64" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-24 w-24 rounded-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  const hasData = data?.data_available ?? false;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Icon className={cn("h-5 w-5", style.text)} aria-hidden="true" />
              Santé du champ photovoltaïque
            </CardTitle>
            <CardDescription>
              Diagnostics par règles : anomalies à vérifier, jamais des défauts physiques
              confirmés.
            </CardDescription>
          </div>
          <Badge variant={style.badge} className="text-xs">
            {data?.health_label ?? "État inconnu"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="relative flex h-28 w-28 shrink-0 items-center justify-center">
            <svg viewBox="0 0 100 100" className="h-28 w-28 -rotate-90" aria-hidden="true">
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                stroke="hsl(var(--muted))"
                strokeWidth="8"
              />
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                stroke={style.ring}
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - percentage / 100)}
                className="transition-[stroke-dashoffset] duration-700 ease-out"
              />
            </svg>
            <div className="absolute flex flex-col items-center">
              <span className={cn("text-2xl font-bold tabular-nums", style.text)}>
                {score == null ? "—" : score}
              </span>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                / 100
              </span>
            </div>
          </div>

          <div className="grid flex-1 grid-cols-2 gap-2 text-sm">
            <div className="rounded-lg bg-muted/40 px-3 py-2">
              <p className="text-xs text-muted-foreground">Anomalies actives</p>
              <p className="text-lg font-semibold text-foreground">
                {data?.active_faults.length ?? 0}
              </p>
            </div>
            <div className="rounded-lg bg-muted/40 px-3 py-2">
              <p className="text-xs text-muted-foreground">Dont critiques</p>
              <p className="text-lg font-semibold text-foreground">
                {data?.critical_count ?? 0}
              </p>
            </div>
            <div className="rounded-lg bg-muted/40 px-3 py-2">
              <p className="text-xs text-muted-foreground">Dernière analyse</p>
              <p className="text-xs font-medium text-foreground">
                {data?.last_update ? formatDateFr(data.last_update) : "—"}
              </p>
            </div>
            <div className="rounded-lg bg-muted/40 px-3 py-2">
              <p className="text-xs text-muted-foreground">Fraîcheur</p>
              <p className="text-xs font-medium text-foreground">
                {data?.is_stale ? "Mesures obsolètes" : "À jour"}
              </p>
            </div>
          </div>
        </div>

        {!hasData || !data ? (
          <EmptyState
            variant="data"
            compact
            title="Aucune donnée photovoltaïque"
            description="Le diagnostic ne peut pas être calculé sans mesures DC/AC et d'irradiance. Lancez le simulateur ou connectez la passerelle."
          />
        ) : data.active_faults.length === 0 ? (
          <div className="flex items-center gap-2 rounded-lg border border-eco/30 bg-eco/10 px-3 py-2 text-sm text-eco dark:text-eco">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            Aucune anomalie active détectée sur la fenêtre analysée.
          </div>
        ) : (
          <ul className="space-y-2">
            {data.active_faults.map((fault) => (
              <FaultRow key={fault.id} fault={fault} />
            ))}
          </ul>
        )}

        {data?.methodology && (
          <details className="group rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            <summary className="flex cursor-pointer items-center gap-1.5 font-medium text-foreground">
              <Info className="h-3.5 w-3.5" aria-hidden="true" />
              Méthodologie du score
            </summary>
            <p className="mt-2 leading-relaxed">{data.methodology}</p>
            <p className="mt-2 flex items-start gap-1.5 text-solar dark:text-solar">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Aucune anomalie n&apos;est marquée « confirmée » automatiquement : une inspection
              visuelle ou thermique reste nécessaire.
            </p>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
