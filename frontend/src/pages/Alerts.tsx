"use client";

import React, { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button, cn } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { AlertTable } from "@/components/alerts/AlertTable";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  AlertTriangle,
  AlertCircle,
  Info,
  Download,
  RefreshCw,
  CheckCheck,
  Search,
  X,
  ArrowDownWideNarrow,
} from "lucide-react";

const SEVERITY_META = {
  HIGH: {
    label: "Critique",
    icon: AlertTriangle,
    iconClass: "bg-destructive/12 text-destructive",
    barClass: "bg-destructive",
  },
  MEDIUM: {
    label: "Moyenne",
    icon: AlertCircle,
    iconClass: "bg-warning/12 text-warning",
    barClass: "bg-warning",
  },
  LOW: {
    label: "Faible",
    icon: Info,
    iconClass: "bg-volt/12 text-volt",
    barClass: "bg-volt",
  },
} as const;

type SeverityFilter = "ALL" | "HIGH" | "MEDIUM" | "LOW";
type SortMode = "recent" | "oldest" | "severity";

const SEVERITY_ORDER: Record<string, number> = { CRITICAL: 3, HIGH: 2, MEDIUM: 1, LOW: 0 };

export function AlertsPage() {
  const [showResolved, setShowResolved] = useState(false);
  const [search, setSearch] = useState("");
  const [severity, setSeverity] = useState<SeverityFilter>("ALL");
  const [sort, setSort] = useState<SortMode>("recent");
  const queryClient = useQueryClient();

  const { data: alerts = [], isLoading } = useQuery({
    queryKey: ["alerts", showResolved],
    queryFn: () =>
      api.getAlerts({
        resolved: showResolved,
        limit: 200,
        offset: 0,
      }),
    refetchInterval: 30000,
  });

  const invalidateAlerts = () => {
    queryClient.invalidateQueries({ queryKey: ["alerts"] });
    queryClient.invalidateQueries({ queryKey: ["alerts-active"] });
  };

  const resolveMutation = useMutation({
    mutationFn: (id: number) => api.resolveAlert(id),
    onSuccess: () => {
      invalidateAlerts();
      toast.success("Alerte marquée comme résolue");
    },
    onError: () => {
      toast.error("Échec de la résolution de l'alerte");
    },
  });

  const resolveAllMutation = useMutation({
    mutationFn: () => api.resolveAllAlerts("SALLE1"),
    onSuccess: (res) => {
      invalidateAlerts();
      toast.success(res.message || "Toutes les alertes ont été résolues");
    },
    onError: () => {
      toast.error("Échec de la résolution des alertes");
    },
  });

  const handleResolve = (id: number) => {
    resolveMutation.mutate(id);
  };

  const severityCount = useMemo(
    () => ({
      HIGH: alerts.filter((a) => a.severity === "HIGH" || a.severity === "CRITICAL").length,
      MEDIUM: alerts.filter((a) => a.severity === "MEDIUM").length,
      LOW: alerts.filter((a) => a.severity === "LOW").length,
    }),
    [alerts],
  );

  /** Client-side search: the API only filters by device/resolved. */
  const visibleAlerts = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = alerts.filter((alert) => {
      const matchesSeverity =
        severity === "ALL"
          ? true
          : severity === "HIGH"
            ? alert.severity === "HIGH" || alert.severity === "CRITICAL"
            : alert.severity === severity;
      if (!matchesSeverity) return false;
      if (!term) return true;
      return [alert.message, alert.type, alert.cause, alert.device_id]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });

    return [...filtered].sort((a, b) => {
      if (sort === "severity") {
        return (SEVERITY_ORDER[b.severity ?? ""] ?? 0) - (SEVERITY_ORDER[a.severity ?? ""] ?? 0);
      }
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      return sort === "recent" ? timeB - timeA : timeA - timeB;
    });
  }, [alerts, search, severity, sort]);

  const filtersActive = search.trim() !== "" || severity !== "ALL";

  const exportCsv = () => {
    if (visibleAlerts.length === 0) {
      toast.info("Aucune alerte à exporter.");
      return;
    }
    const header = [
      "id",
      "device_id",
      "timestamp",
      "type",
      "severity",
      "message",
      "cause",
      "resolved",
    ];
    const rows = visibleAlerts.map((a) =>
      [
        a.id,
        a.device_id,
        a.timestamp,
        a.type ?? "",
        a.severity ?? "",
        `"${(a.message ?? "").replace(/"/g, '""')}"`,
        `"${(a.cause ?? "").replace(/"/g, '""')}"`,
        a.resolved,
      ].join(","),
    );
    const blob = new Blob([[header.join(","), ...rows].join("\n")], {
      type: "text/csv;charset=utf-8,",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `wattwise-alertes-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(`Export CSV — ${visibleAlerts.length} alerte(s)`);
  };

  return (
    <div className="page flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[26px] font-bold leading-tight tracking-tight text-foreground">
              {showResolved ? "Historique des alertes" : "Alertes actives"}
            </h1>
            <Badge variant={showResolved ? "outline" : "destructive"} dot>
              {alerts.length}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Gaspillage détecté par le moteur de règles, l&apos;Isolation Forest et le résidu de
            prévision.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 whitespace-nowrap">
          {!showResolved && alerts.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => resolveAllMutation.mutate()}
              disabled={resolveAllMutation.isPending}
              aria-label="Marquer toutes les alertes comme résolues"
            >
              <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
              Tout résoudre
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={exportCsv} aria-label="Exporter les alertes en CSV">
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Exporter CSV
          </Button>
          <Button
            size="sm"
            onClick={() => {
              void queryClient.invalidateQueries({ queryKey: ["alerts"] });
            }}
            aria-label="Actualiser les alertes"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Actualiser
          </Button>
        </div>
      </div>

      {/* Severity summary — doubles as filter */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {Object.entries(SEVERITY_META).map(([key, meta], idx) => {
          const Icon = meta.icon;
          const active = severity === key;
          return (
            <motion.button
              key={key}
              type="button"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.04, duration: 0.2 }}
              onClick={() => setSeverity(active ? "ALL" : (key as SeverityFilter))}
              aria-pressed={active}
              className={cn(
                "group relative overflow-hidden rounded-xl border bg-card p-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "border-primary/50 shadow-panel"
                  : "border-border hover:border-primary/30",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "absolute inset-y-0 left-0 w-[3px] transition-opacity",
                  meta.barClass,
                  active ? "opacity-100" : "opacity-40",
                )}
              />
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-lg",
                    meta.iconClass,
                  )}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
                <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  {meta.label}
                </span>
                <span className="metric ml-auto text-xl font-bold text-foreground">
                  {severityCount[key as keyof typeof severityCount]}
                </span>
              </div>
              <p className="mt-2 text-[10px] text-muted-foreground">
                {active ? "Filtre actif — cliquer pour retirer" : "Cliquer pour filtrer"}
              </p>
            </motion.button>
          );
        })}
      </div>

      {/* Filter bar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            placeholder="Rechercher une anomalie, un appareil, une cause…"
            aria-label="Rechercher dans les alertes"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-9"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Effacer la recherche"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div
            className="flex items-center gap-1 rounded-lg border border-border bg-card/70 p-1"
            role="group"
            aria-label="Filtrer par état de résolution"
          >
            <button
              type="button"
              onClick={() => setShowResolved(false)}
              aria-pressed={!showResolved}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                !showResolved
                  ? "bg-accent text-accent-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Actives
            </button>
            <button
              type="button"
              onClick={() => setShowResolved(true)}
              aria-pressed={showResolved}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                showResolved
                  ? "bg-accent text-accent-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Résolues
            </button>
          </div>

          <div className="relative">
            <ArrowDownWideNarrow
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as SortMode)}
              aria-label="Trier les alertes"
              className="h-9 rounded-lg border border-border bg-card/70 pl-8 pr-2 text-xs font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="recent">Plus récentes</option>
              <option value="oldest">Plus anciennes</option>
              <option value="severity">Gravité</option>
            </select>
          </div>
        </div>
      </div>

      {filtersActive && (
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <span>
            {visibleAlerts.length} résultat{visibleAlerts.length > 1 ? "s" : ""} sur {alerts.length}
          </span>
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setSeverity("ALL");
            }}
            className="rounded-full border border-border px-2 py-0.5 font-medium transition-colors hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Réinitialiser les filtres
          </button>
        </div>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            {visibleAlerts.length} alerte{visibleAlerts.length > 1 ? "s" : ""}
            <Badge variant="outline" className="font-mono">
              {showResolved ? "RÉSOLUES" : "ACTIVES"}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <TableSkeleton rows={6} cols={5} />
          ) : (
            <AlertTable alerts={visibleAlerts} onResolve={handleResolve} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
