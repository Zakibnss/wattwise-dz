"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/Badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/Dialog";
import { Button, cn } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDateFr } from "@/lib/format";
import { api, AlertExplanation } from "@/lib/api";
import { ALERT_TYPE_LABELS } from "@/lib/constants";
import {
  AlertTriangle,
  Wrench,
  Wind,
  Lightbulb,
  CheckCircle,
  HelpCircle,
  Zap,
  Thermometer,
  Clock,
  FileSearch,
} from "lucide-react";

type AlertRow = {
  id: number;
  device_id: string;
  timestamp: string;
  type: string | null;
  severity: string | null;
  message: string | null;
  cause: string | null;
  confidence: number | null;
  resolved: boolean;
};

type AlertTableProps = {
  alerts: AlertRow[];
  onResolve: (id: number) => void;
  onViewExplanation?: (alert: AlertRow) => void;
};

function getPhysicalCauseIcon(causeText: string) {
  if (causeText.includes("Climatisation")) {
    return <Wind className="h-4 w-4 text-volt shrink-0" />;
  }
  if (causeText.includes("Éclairage")) {
    return <Lightbulb className="h-4 w-4 text-solar shrink-0" />;
  }
  if (causeText.includes("défaillant") || causeText.includes("Équipement")) {
    return <Wrench className="h-4 w-4 text-destructive shrink-0" />;
  }
  return <AlertTriangle className="h-4 w-4 text-primary shrink-0" />;
}

function getCauseBadgeClass(causeText: string) {
  if (causeText.includes("Climatisation")) {
    return "border-volt/30 bg-volt/10 text-volt dark:text-volt";
  }
  if (causeText.includes("Éclairage")) {
    return "border-solar/30 bg-solar/10 text-solar dark:text-solar";
  }
  if (causeText.includes("défaillant") || causeText.includes("Équipement")) {
    return "border-destructive/30 bg-destructive/10 text-destructive dark:text-destructive";
  }
  if (causeText.includes("Analyse")) {
    return "border-border bg-muted text-muted-foreground";
  }
  return "border-eco/30 bg-eco/10 text-eco dark:text-eco";
}

export function AlertTable({ alerts, onResolve }: AlertTableProps) {
  const [selectedAlert, setSelectedAlert] = useState<AlertRow | null>(null);

  // Fetch explanation when modal is opened for an alert
  const { data: explanation, isLoading } = useQuery<AlertExplanation>({
    queryKey: ["alert-explanation", selectedAlert?.id],
    queryFn: () => api.getAlertExplanation(selectedAlert!.id),
    enabled: selectedAlert !== null,
  });

  // Extract physical cause from evidence or fallback to parsed cause
  const physicalCause = React.useMemo(() => {
    if (explanation?.evidence && typeof explanation.evidence === "object") {
      const ev = explanation.evidence as Record<string, any>;
      if (ev.physical_cause) return String(ev.physical_cause);
      if (ev.cause && typeof ev.cause === "string" && !ev.cause.startsWith("{")) {
        return ev.cause;
      }
    }
    if (selectedAlert?.cause) {
      try {
        const parsed = JSON.parse(selectedAlert.cause);
        if (parsed.evidence?.physical_cause) return String(parsed.evidence.physical_cause);
      } catch {
        if (!selectedAlert.cause.startsWith("{")) return selectedAlert.cause;
      }
    }
    return "Analyse en cours...";
  }, [explanation, selectedAlert]);

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-border text-muted-foreground text-xs uppercase tracking-wider">
              <th className="whitespace-nowrap pb-3 text-left font-semibold">Date &amp; heure</th>
              <th className="text-left pb-3 font-semibold">Type d'anomalie</th>
              <th className="text-left pb-3 font-semibold">Cause physique (FDD)</th>
              <th className="text-left pb-3 font-semibold">Gravité</th>
              <th className="text-right pb-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {alerts.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <EmptyState
                    variant="success"
                    compact
                    title="Aucune alerte pour le moment. Bon travail !"
                    description="Vos équipements fonctionnent normalement. Les nouvelles anomalies apparaîtront ici dès leur détection."
                  />
                </td>
              </tr>
            ) : (
              alerts.map((alert) => {
                // Quick parse cause for table preview
                let quickCause = "Anomalie détectée";
                if (alert.cause) {
                  try {
                    const parsed = JSON.parse(alert.cause);
                    quickCause =
                      parsed.evidence?.physical_cause ||
                      parsed.reason ||
                      alert.message ||
                      "Anomalie";
                  } catch {
                    quickCause = alert.cause;
                  }
                }

                return (
                  <tr key={alert.id} className="transition-colors hover:bg-muted/40">
                    <td className="whitespace-nowrap py-3 font-mono text-[11px] text-muted-foreground">
                      {formatDateFr(alert.timestamp)}
                    </td>
                    <td className="py-3 text-xs sm:text-sm">
                      <span className="font-medium text-foreground">
                        {ALERT_TYPE_LABELS[alert.type || ""] || alert.type || "Inconnu"}
                      </span>
                    </td>
                    <td className="py-3 text-xs sm:text-sm">
                      <div className="flex items-center gap-1.5 font-medium text-foreground">
                        {getPhysicalCauseIcon(quickCause)}
                        <span>{quickCause}</span>
                      </div>
                    </td>
                    <td className="py-3">
                      <Badge
                        dot
                        variant={
                          alert.severity === "CRITICAL" || alert.severity === "HIGH"
                            ? "destructive"
                            : alert.severity === "MEDIUM"
                              ? "warning"
                              : "outline"
                        }
                        className="whitespace-nowrap font-mono text-[10px]"
                      >
                        {alert.severity}
                      </Badge>
                    </td>
                    <td className="py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedAlert(alert)}
                          className="h-8 gap-1 whitespace-nowrap text-xs"
                          aria-label={`Ouvrir le diagnostic FDD de l'alerte ${alert.id}`}
                        >
                          <FileSearch className="h-3.5 w-3.5" aria-hidden="true" />
                          Diagnostic FDD
                        </Button>
                        {!alert.resolved && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onResolve(alert.id)}
                            className="h-8 whitespace-nowrap text-xs"
                            aria-label={`Marquer l'alerte ${alert.id} comme résolue`}
                          >
                            Résoudre
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* FDD Diagnostic Explanation Dialog */}
      <Dialog open={selectedAlert !== null} onOpenChange={() => setSelectedAlert(null)}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold">
                  Diagnostic FDD — Alerte #{selectedAlert?.id}
                </DialogTitle>
                <DialogDescription className="text-xs">
                  {selectedAlert?.device_id} • {formatDateFr(selectedAlert?.timestamp ?? null)}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {selectedAlert && (
            <div className="space-y-4 py-2 text-sm">
              {/* Diagnostic section */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Diagnostic
                  </h4>
                  <Badge className={cn("border text-[11px]", getCauseBadgeClass(physicalCause))}>
                    Cause probable : {physicalCause}
                  </Badge>
                </div>
                <div className="rounded-xl border border-solar/30 bg-solar/10 p-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">{getPhysicalCauseIcon(physicalCause)}</div>
                    <div className="flex-1">
                      <p className="text-xs font-semibold uppercase tracking-wider text-solar dark:text-solar">
                        Cause Physique Identifiée (FDD)
                      </p>
                      <p className="mt-0.5 text-base font-bold text-foreground">{physicalCause}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {explanation?.reason || selectedAlert.message}
                      </p>
                      {!explanation?.evidence ||
                        (Object.keys(explanation.evidence).length === 0 && (
                          <p className="mt-1 text-xs italic text-muted-foreground">Analyse en cours...</p>
                        ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Sensor Evidence Grid */}
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Preuves & Métriques Capteurs (Evidence)
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  <div className="rounded-lg border border-border bg-card p-2.5">
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <Zap className="h-3 w-3 text-primary" /> Puissance
                    </span>
                    <p className="font-semibold text-foreground text-sm mt-0.5">
                      {String(
                        (explanation?.evidence as any)?.power_w ??
                          (explanation?.evidence as any)?.power ??
                          "—"
                      )}{" "}
                      W
                    </p>
                  </div>

                  <div className="rounded-lg border border-border bg-card p-2.5">
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <Thermometer className="h-3 w-3 text-volt" /> Température
                    </span>
                    <p className="font-semibold text-foreground text-sm mt-0.5">
                      {String((explanation?.evidence as any)?.temperature ?? "—")} °C
                    </p>
                  </div>

                  <div className="rounded-lg border border-border bg-card p-2.5">
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3 text-solar" /> Horodatage
                    </span>
                    <p className="font-semibold text-foreground text-sm mt-0.5 truncate">
                      {selectedAlert.timestamp
                        ? new Date(selectedAlert.timestamp).toLocaleTimeString("fr-FR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </p>
                  </div>

                  <div className="rounded-lg border border-border bg-card p-2.5">
                    <span className="text-[11px] text-muted-foreground">Type d'alerte</span>
                    <p className="font-semibold text-foreground text-xs mt-0.5 truncate">
                      {selectedAlert.type}
                    </p>
                  </div>

                  <div className="rounded-lg border border-border bg-card p-2.5">
                    <span className="text-[11px] text-muted-foreground">Gravité</span>
                    <p className="font-semibold text-foreground text-sm mt-0.5">
                      {selectedAlert.severity}
                    </p>
                  </div>

                  <div className="rounded-lg border border-border bg-card p-2.5">
                    <span className="text-[11px] text-muted-foreground">Confiance IA</span>
                    <p className="font-semibold text-foreground text-sm mt-0.5">
                      {selectedAlert.confidence
                        ? `${Math.round(selectedAlert.confidence * 100)}%`
                        : "90%"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Action Recommandée */}
              <div className="rounded-lg bg-muted/50 p-3 text-xs space-y-1">
                <div className="flex items-center gap-1 font-semibold text-foreground">
                  <CheckCircle className="h-3.5 w-3.5 text-eco" />
                  <span>Action Corrective Recommandée</span>
                </div>
                <p className="text-muted-foreground">
                  {explanation?.recommended_action || "Vérifier l'état physique de l'équipement dans la salle."}
                </p>
                {explanation?.estimated_savings_kwh_per_day && (
                  <p className="text-eco dark:text-eco font-medium pt-1">
                    Économie estimée : {explanation.estimated_savings_kwh_per_day} kWh / jour
                  </p>
                )}
              </div>

              {/* Dialog Footer Actions */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedAlert(null)}
                  aria-label="Fermer le diagnostic"
                >
                  Fermer
                </Button>
                {!selectedAlert.resolved && (
                  <Button
                    size="sm"
                    onClick={() => {
                      onResolve(selectedAlert.id);
                      setSelectedAlert(null);
                    }}
                    className="bg-primary text-primary-foreground"
                    aria-label={`Marquer l'alerte ${selectedAlert.id} comme résolue`}
                  >
                    Marquer comme résolue
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
