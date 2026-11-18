"use client";

import React, { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { Button, cn } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { PageSkeleton } from "@/components/ui/Skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { api } from "@/lib/api";
import type { Alert, Equipment, InvestigationResult } from "@/lib/api";
import {
  WORKFLOW_STAGES,
  WORKFLOW_STAGE_LABELS,
  ALERT_TYPE_LABELS,
} from "@/lib/constants";
import { formatRelativeFr } from "@/lib/format";
import {
  Radar,
  BrainCircuit,
  Lightbulb,
  ThumbsUp,
  Zap,
  BadgeCheck,
  RefreshCw,
  Sparkles,
  Clock,
  ChevronRight,
  FlaskConical,
} from "lucide-react";

const STAGE_ICONS: Record<string, typeof Radar> = {
  DETECTED: Radar,
  ANALYSED: BrainCircuit,
  PROPOSED: Lightbulb,
  APPROVED: ThumbsUp,
  EXECUTED: Zap,
  VERIFIED: BadgeCheck,
};

const STAGE_COLORS: Record<string, string> = {
  DETECTED: "text-destructive bg-destructive/12 border-destructive/30",
  ANALYSED: "text-volt bg-volt/12 border-volt/30",
  PROPOSED: "text-warning bg-warning/12 border-warning/30",
  APPROVED: "text-primary bg-primary/12 border-primary/30",
  EXECUTED: "text-solar bg-solar/12 border-solar/30",
  VERIFIED: "text-eco bg-eco/12 border-eco/30",
};

const SEVERITY_BADGE: Record<string, "destructive" | "warning" | "volt" | "outline"> = {
  CRITICAL: "destructive",
  HIGH: "destructive",
  MEDIUM: "warning",
  LOW: "volt",
};

/** Next transition for the current stage, or null when the flow is done. */
function nextTransition(stage: string): {
  key: string;
  label: string;
} | null {
  switch (stage) {
    case "DETECTED":
      return { key: "analyze", label: "Analyser avec WATTY" };
    case "ANALYSED":
      return { key: "propose", label: "Proposer l'action" };
    case "PROPOSED":
      return { key: "approve", label: "Approuver" };
    case "APPROVED":
      return { key: "execute", label: "Exécuter" };
    case "EXECUTED":
      return { key: "verify", label: "Vérifier les économies" };
    default:
      return null;
  }
}

function parseAnalysis(analysis: string | null | undefined) {
  if (!analysis) return null;
  try {
    const parsed = JSON.parse(analysis);
    return parsed as {
      hypotheses?: { cause: string; confidence: number; recommended_action: string }[];
      summary?: string;
      source?: string;
    };
  } catch {
    return null;
  }
}

export function ActionCenter() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Alert | null>(null);
  const [proposedText, setProposedText] = useState("");
  const [estimatedKwh, setEstimatedKwh] = useState("");

  const { data: alerts = [], isLoading } = useQuery({
    queryKey: ["alerts", false],
    queryFn: () => api.getAlerts({ resolved: false, limit: 200 }),
    refetchInterval: 30000,
  });

  const { data: tree } = useQuery({
    queryKey: ["building-tree"],
    queryFn: () => api.getBuildingTree(1),
    staleTime: 5 * 60 * 1000,
  });

  const equipmentMap = useMemo(() => {
    const map = new Map<number, { name: string; zone: string }>();
    for (const floor of tree?.floors ?? []) {
      for (const zone of floor.zones) {
        for (const eq of zone.equipment) {
          map.set(eq.id, { name: eq.name, zone: zone.name });
        }
      }
    }
    return map;
  }, [tree]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["alerts"] });
    queryClient.invalidateQueries({ queryKey: ["alerts-active"] });
    queryClient.invalidateQueries({ queryKey: ["workflow"] });
    queryClient.invalidateQueries({ queryKey: ["building-tree"] });
    queryClient.invalidateQueries({ queryKey: ["insights"] });
  };

  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const stage of WORKFLOW_STAGES) counts[stage] = 0;
    for (const alert of alerts) counts[alert.stage ?? "DETECTED"] = (counts[alert.stage ?? "DETECTED"] ?? 0) + 1;
    return counts;
  }, [alerts]);

  const transitionMutation = useMutation({
    mutationFn: async ({ alert, key, payload }: { alert: Alert; key: string; payload?: { proposed_action: string; estimated_savings_kwh?: number } }) => {
      switch (key) {
        case "analyze":
          return api.analyzeAlert(alert.id);
        case "propose":
          return api.proposeAlert(alert.id, payload ?? { proposed_action: "Appliquer l'action recommandée." });
        case "approve":
          return api.approveAlert(alert.id);
        case "execute":
          return api.executeAlert(alert.id);
        case "verify":
          return api.verifyAlert(alert.id);
        default:
          throw new Error("Transition inconnue");
      }
    },
    onSuccess: (res, variables) => {
      invalidate();
      toast.success(`Étape « ${res.stage_label} » validée`, {
        description: res.message,
      });
      const tsField = ({
        analyze: "analyzed_at",
        propose: "proposed_at",
        approve: "approved_at",
        execute: "executed_at",
        verify: "verified_at",
      } as Record<string, string>)[variables.key];
      setSelected((prev) =>
        prev
          ? {
              ...prev,
              stage: res.stage,
              ...(tsField ? { [tsField]: new Date().toISOString() } : {}),
            }
          : prev,
      );
    },
    onError: (error: Error) => {
      toast.error("Transition impossible", { description: error.message });
    },
  });

  const openDetail = (alert: Alert) => {
    setSelected(alert);
    const analysis = parseAnalysis(alert.analysis);
    const recommended = analysis?.hypotheses?.[0]?.recommended_action;
    const cause = (() => {
      try {
        return alert.cause ? (JSON.parse(alert.cause) as { recommended_action?: string; estimated_savings_kwh_per_day?: number }) : null;
      } catch {
        return null;
      }
    })();
    setProposedText(alert.proposed_action ?? recommended ?? cause?.recommended_action ?? "");
    setEstimatedKwh(
      alert.estimated_savings_kwh != null
        ? String(Math.round(alert.estimated_savings_kwh))
        : cause?.estimated_savings_kwh_per_day != null
          ? String(Math.round(cause.estimated_savings_kwh_per_day))
          : "",
    );
  };

  const startWattyInvestigation = () => {
    if (!selected) return;
    window.dispatchEvent(
      new CustomEvent("watty:investigate", { detail: { alertId: selected.id } }),
    );
    toast.info("WATTY ouvre une enquête…", {
      description: "La fenêtre de discussion contient les hypothèses détaillées.",
    });
  };

  const runTransition = (alert: Alert, key: string) => {
    if (key === "propose") {
      if (!proposedText.trim()) {
        toast.error("Saisissez l'action proposée avant de continuer.");
        return;
      }
      transitionMutation.mutate({
        alert,
        key,
        payload: {
          proposed_action: proposedText.trim(),
          estimated_savings_kwh: estimatedKwh.trim() ? Number(estimatedKwh) : undefined,
        },
      });
    } else {
      transitionMutation.mutate({ alert, key });
    }
  };

  if (isLoading) {
    return (
      <div className="page">
        <PageSkeleton />
      </div>
    );
  }

  const selectedAnalysis = selected ? parseAnalysis(selected.analysis) : null;
  const selectedNext = selected ? nextTransition(selected.stage ?? "DETECTED") : null;

  return (
    <div className="page flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[26px] font-bold leading-tight tracking-tight text-foreground">
              Centre d&apos;Actions
            </h1>
            <Badge variant="destructive" dot>
              {alerts.length} actives
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Du gaspillage détecté à l&apos;économie vérifiée : un workflow complet en six étapes.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => invalidate()}
          aria-label="Actualiser le centre d'actions"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          Actualiser
        </Button>
      </div>

      {/* 6-stage strip */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex flex-wrap items-stretch gap-1.5" role="list" aria-label="Étapes du workflow">
            {WORKFLOW_STAGES.map((stage, idx) => {
              const Icon = STAGE_ICONS[stage];
              const count = stageCounts[stage] ?? 0;
              return (
                <React.Fragment key={stage}>
                  <motion.div
                    role="listitem"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05, duration: 0.25 }}
                    className={cn(
                      "flex min-w-[96px] flex-1 items-center gap-2 rounded-xl border px-3 py-2.5",
                      STAGE_COLORS[stage],
                      count > 0 && "shadow-panel",
                    )}
                    aria-label={`${WORKFLOW_STAGE_LABELS[stage]} : ${count} action(s)`}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] opacity-80">
                        {WORKFLOW_STAGE_LABELS[stage]}
                      </p>
                      <p className="metric text-lg font-bold leading-none">
                        {count}
                      </p>
                    </div>
                  </motion.div>
                  {idx < WORKFLOW_STAGES.length - 1 && (
                    <ChevronRight
                      className="my-auto hidden h-4 w-4 shrink-0 text-muted-foreground/50 sm:block"
                      aria-hidden="true"
                    />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Kanban columns (one per stage) */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {WORKFLOW_STAGES.map((stage) => {
          const stageAlerts = alerts.filter((a) => (a.stage ?? "DETECTED") === stage);
          if (stageAlerts.length === 0) return null;
          return (
            <div key={stage} className="flex flex-col gap-2">
              <div className="flex items-center gap-2 px-1">
                <span className={cn("h-2 w-2 rounded-full", STAGE_COLORS[stage].split(" ")[1]?.replace(/bg-.*\//, "bg-") ?? "")} aria-hidden="true" />
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  {WORKFLOW_STAGE_LABELS[stage]}
                </p>
                <span className="metric ml-auto text-[11px] text-muted-foreground">
                  {stageAlerts.length}
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {stageAlerts.map((alert, idx) => {
                  const equipment = alert.equipment_id != null ? equipmentMap.get(alert.equipment_id) : undefined;
                  return (
                    <motion.button
                      key={alert.id}
                      type="button"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(idx * 0.03, 0.2), duration: 0.22 }}
                      onClick={() => openDetail(alert)}
                      aria-label={`Ouvrir l'action : ${alert.message}`}
                      className={cn(
                        "group cursor-pointer rounded-xl border bg-card p-3 text-left transition-all hover:border-primary/40 hover:shadow-panel-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        alert.severity === "CRITICAL" && "border-destructive/40",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="line-clamp-2 text-[13px] font-medium leading-snug text-foreground">
                          {alert.message}
                        </p>
                        {alert.is_demo && (
                          <Badge variant="volt" className="shrink-0 gap-1">
                            <FlaskConical className="h-2.5 w-2.5" aria-hidden="true" />
                            Démo
                          </Badge>
                        )}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {equipment && (
                          <Badge variant="secondary" className="max-w-[140px] truncate">
                            {equipment.name}
                          </Badge>
                        )}
                        <Badge variant={SEVERITY_BADGE[alert.severity ?? ""] ?? "outline"}>
                          {alert.severity === "CRITICAL" ? "Critique" : alert.severity === "HIGH" ? "Haute" : alert.severity === "MEDIUM" ? "Moyenne" : "Faible"}
                        </Badge>
                        <span className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Clock className="h-2.5 w-2.5" aria-hidden="true" />
                          {formatRelativeFr(alert.timestamp)}
                        </span>
                      </div>
                      <p className="mt-1.5 truncate text-[10px] text-muted-foreground">
                        {alert.type ? (ALERT_TYPE_LABELS[alert.type] ?? alert.type) : "—"}
                      </p>
                    </motion.button>
                  );
                })}
              </div>
            </div>
          );
        })}
        {alerts.length === 0 && (
          <Card className="md:col-span-2 xl:col-span-3">
            <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
              <BadgeCheck className="h-10 w-10 text-eco" aria-hidden="true" />
              <p className="text-sm font-semibold text-foreground">Aucune action en cours</p>
              <p className="max-w-md text-xs text-muted-foreground">
                Tout est calme. Les anomalies détectées par le cerveau énergétique apparaîtront
                ici comme actions à traiter.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Detail dialog */}
      <Dialog open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-h-[85vh] w-full max-w-[560px] overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-base">
                  Action #{selected.id}
                  {selected.is_demo && (
                    <Badge variant="volt" className="gap-1">
                      <FlaskConical className="h-2.5 w-2.5" aria-hidden="true" />
                      Démo
                    </Badge>
                  )}
                </DialogTitle>
                <DialogDescription className="text-left">
                  {selected.message}
                </DialogDescription>
              </DialogHeader>

              {/* Stage timeline with timestamps */}
              <div className="rounded-xl border border-border bg-background/40 p-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Historique du workflow
                </p>
                <div className="space-y-1.5">
                  {[
                    { label: "Détecté", at: selected.created_at },
                    { label: "Analysé", at: selected.analyzed_at },
                    { label: "Proposé", at: selected.proposed_at },
                    { label: "Approuvé", at: selected.approved_at },
                    { label: "Exécuté", at: selected.executed_at },
                    { label: "Vérifié", at: selected.verified_at },
                  ].map((step) => {
                    const Icon = STAGE_ICONS[WORKFLOW_STAGES.find((s) => WORKFLOW_STAGE_LABELS[s] === step.label) ?? "DETECTED"];
                    const reached = step.at != null;
                    const current = (selected.stage ?? "DETECTED") === WORKFLOW_STAGES.find((s) => WORKFLOW_STAGE_LABELS[s] === step.label);
                    return (
                      <div key={step.label} className="flex items-center gap-2.5">
                        <span
                          className={cn(
                            "flex h-5 w-5 items-center justify-center rounded-full border",
                            reached
                              ? "border-transparent bg-eco/15 text-eco"
                              : "border-border bg-muted text-muted-foreground/40",
                            current && "ring-2 ring-primary/30",
                          )}
                        >
                          <Icon className="h-2.5 w-2.5" aria-hidden="true" />
                        </span>
                        <span
                          className={cn(
                            "text-[12px]",
                            reached ? "font-medium text-foreground" : "text-muted-foreground/60",
                          )}
                        >
                          {step.label}
                        </span>
                        <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                          {reached ? formatRelativeFr(step.at!) : "—"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* WATTY analysis (when available) */}
              {selectedAnalysis && (
                <div className="rounded-xl border border-volt/30 bg-volt/6 p-3">
                  <div className="flex items-center gap-2">
                    <BrainCircuit className="h-4 w-4 text-volt" aria-hidden="true" />
                    <p className="text-xs font-bold text-foreground">
                      Analyse WATTY{" "}
                      <span className="font-normal text-muted-foreground">
                        ({selectedAnalysis.source === "llm" ? "IA" : "règles"})
                      </span>
                    </p>
                  </div>
                  {(selectedAnalysis.hypotheses ?? []).slice(0, 3).map((hyp, idx) => (
                    <p key={idx} className="mt-1.5 text-[11px] leading-relaxed text-foreground/85">
                      <span className="font-mono font-semibold text-volt">H{idx + 1} {hyp.confidence}%</span>{" "}
                      — {hyp.cause}
                    </p>
                  ))}
                  {selectedAnalysis.summary && (
                    <p className="mt-2 border-t border-volt/20 pt-2 text-[11px] italic text-muted-foreground">
                      {selectedAnalysis.summary}
                    </p>
                  )}
                </div>
              )}

              {/* Proposed action editor (at ANALYSED stage) */}
              {selected.stage === "ANALYSED" && (
                <div className="space-y-2 rounded-xl border border-border p-3">
                  <label htmlFor="proposed-action" className="text-[11px] font-semibold text-foreground">
                    Action proposée
                  </label>
                  <Input
                    id="proposed-action"
                    value={proposedText}
                    onChange={(e) => setProposedText(e.target.value)}
                    placeholder="Ex. : Réparer le compresseur et vérifier les niveaux"
                    className="h-9 text-xs"
                  />
                  <label htmlFor="estimated-kwh" className="text-[11px] font-semibold text-foreground">
                    Économie estimée (kWh/jour)
                  </label>
                  <Input
                    id="estimated-kwh"
                    type="number"
                    min="0"
                    value={estimatedKwh}
                    onChange={(e) => setEstimatedKwh(e.target.value)}
                    placeholder="60"
                    className="h-9 text-xs"
                  />
                </div>
              )}

              {selected.proposed_action && selected.stage !== "ANALYSED" && (
                <div className="rounded-xl border border-border bg-muted/30 p-3 text-[12px] text-foreground/90">
                  <span className="font-semibold">Action proposée : </span>
                  {selected.proposed_action}
                  {selected.estimated_savings_kwh != null && (
                    <span className="ml-1 font-mono text-[11px] text-eco">
                      (~{Math.round(selected.estimated_savings_kwh)} kWh/jour)
                    </span>
                  )}
                </div>
              )}

              {/* Transition controls */}
              <div className="flex flex-wrap gap-2">
                {selected.stage === "DETECTED" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="cursor-pointer gap-1.5"
                    onClick={startWattyInvestigation}
                    aria-label="Enquêter avec WATTY"
                  >
                    <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                    Enquêter avec WATTY
                  </Button>
                )}
                {selectedNext && (
                  <Button
                    size="sm"
                    className="cursor-pointer gap-1.5"
                    disabled={transitionMutation.isPending}
                    onClick={() => runTransition(selected, selectedNext.key)}
                    aria-label={selectedNext.label}
                  >
                    {selectedNext.key === "verify" ? (
                      <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    {transitionMutation.isPending ? "Traitement…" : selectedNext.label}
                  </Button>
                )}
                {selectedNext == null && (
                  <div className="flex items-center gap-1.5 rounded-lg bg-eco/12 px-3 py-2 text-[11px] font-semibold text-eco">
                    <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
                    Workflow terminé — économies vérifiées
                  </div>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto cursor-pointer"
                  onClick={() => {
                    api.resolveAlert(selected.id).then(() => {
                      invalidate();
                      setSelected(null);
                      toast.success("Action clôturée");
                    });
                  }}
                  aria-label="Clôturer sans suivre le workflow"
                >
                  Clôturer
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Equipment lookup helper reused by other pages. */
export function useEquipmentLookup(tree: { floors: { zones: { name: string; equipment: Equipment[] }[] }[] } | undefined) {
  return useMemo(() => {
    const map = new Map<number, { name: string; zone: string }>();
    for (const floor of tree?.floors ?? []) {
      for (const zone of floor.zones) {
        for (const eq of zone.equipment) {
          map.set(eq.id, { name: eq.name, zone: zone.name });
        }
      }
    }
    return map;
  }, [tree]);
}

export type { InvestigationResult };
