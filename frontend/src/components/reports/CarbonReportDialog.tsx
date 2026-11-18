"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { AnimatedCounter } from "@/components/ui/AnimatedCounter";
import { api, CarbonReportResponse } from "@/lib/api";
import { Leaf, TreePine, Zap, Printer, CheckCircle, Target } from "lucide-react";

interface CarbonReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Monthly CO₂ objective used by the progress bar (kg CO₂e). */
const CO2_OBJECTIVE_KG = 100;

export function CarbonReportDialog({ open, onOpenChange }: CarbonReportDialogProps) {
  const { data, isLoading } = useQuery<CarbonReportResponse>({
    queryKey: ["carbon-report"],
    queryFn: () => api.getCarbonReport(),
    enabled: open,
  });

  const co2 = data?.co2_avoided_kg ?? 0;
  const progress = Math.min(100, Math.round((co2 / CO2_OBJECTIVE_KG) * 100));

  const handlePrint = () => {
    window.print();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] print:border-none print:shadow-none">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-eco to-volt text-white shadow-sm">
              <Leaf className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold">Bilan Carbone &amp; Impact Écologique</DialogTitle>
              <DialogDescription>
                Rapport mensuel des émissions de gaz à effet de serre évitées.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-4 py-2" role="status" aria-label="Calcul du bilan carbone">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="space-y-2 rounded-xl border border-border p-4">
                  <Skeleton className="h-8 w-8 rounded-lg" />
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-6 w-16" />
                </div>
              ))}
            </div>
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-20 w-full rounded-lg" />
          </div>
        ) : (
          <div className="space-y-5 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2 px-1">
              <span className="text-xs font-medium text-muted-foreground">
                Période : {data?.period || "Mois en cours"}
              </span>
              <Badge
                variant="secondary"
                className="border-eco/30 bg-eco/10 text-xs text-eco dark:text-eco"
              >
                Grille algérienne : 0.45 kg CO₂/kWh
              </Badge>
            </div>

            {/* 3 Metric Cards */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="flex flex-col justify-between rounded-xl border border-border bg-card p-4">
                <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-solar/10 text-solar">
                  <Zap className="h-4 w-4" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Économies réalisées</p>
                  <p className="mt-0.5 text-xl font-bold text-foreground">
                    <AnimatedCounter value={data?.saved_kwh ?? 0} format={(v) => v.toFixed(1)} />{" "}
                    <span className="text-xs font-normal text-muted-foreground">kWh</span>
                  </p>
                </div>
              </div>

              <div className="flex flex-col justify-between rounded-xl border border-border bg-card p-4">
                <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-eco/10 text-eco">
                  <Leaf className="h-4 w-4" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">CO₂ évité</p>
                  <p className="mt-0.5 text-xl font-bold text-eco dark:text-eco">
                    <AnimatedCounter value={co2} format={(v) => v.toFixed(1)} />{" "}
                    <span className="text-xs font-normal text-muted-foreground">kg</span>
                  </p>
                </div>
              </div>

              <div className="flex flex-col justify-between rounded-xl border border-border bg-card p-4">
                <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-eco/10 text-eco dark:text-eco">
                  <TreePine className="h-4 w-4" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Arbres équivalents</p>
                  <p className="mt-0.5 text-xl font-bold text-eco dark:text-eco">
                    <AnimatedCounter value={data?.trees_equivalent ?? 0} />{" "}
                    <span className="text-xs font-normal text-muted-foreground">arbres</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Objective progress bar */}
            <div className="rounded-xl border border-eco/25 bg-eco/5 p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <Target className="h-3.5 w-3.5 text-eco" aria-hidden="true" />
                  Objectif CO₂ évité
                </span>
                <span className="text-xs font-bold text-eco dark:text-eco">
                  {progress}% ({co2.toFixed(1)} / {CO2_OBJECTIVE_KG} kg)
                </span>
              </div>
              <div
                className="h-3 w-full overflow-hidden rounded-full bg-eco/15"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
                aria-label={`Objectif CO2 évité : ${progress} pour cent`}
              >
                <div
                  className="h-full rounded-full bg-gradient-to-r from-eco via-eco to-eco transition-[width] duration-700 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                {progress >= 100
                  ? "Objectif mensuel atteint. Excellent travail !"
                  : `Encore ${(CO2_OBJECTIVE_KG - co2).toFixed(1)} kg de CO₂ à éviter pour atteindre l'objectif.`}
              </p>
            </div>

            {/* Detail section */}
            <div className="space-y-1.5 rounded-lg bg-muted/50 p-3.5 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5 font-medium text-foreground">
                <CheckCircle className="h-3.5 w-3.5 text-eco" aria-hidden="true" />
                <span>Méthodologie certifiée WATTWISE DZ</span>
              </div>
              <p>
                Le calcul applique le facteur moyen du mix électrique algérien (Sonelgaz/CREG) de{" "}
                <strong>0.45 kg CO₂ par kWh</strong>. L&apos;équivalence arborée correspond à la captation
                moyenne d&apos;un arbre adulte (~20 kg CO₂/an).
              </p>
            </div>

            {/* Action buttons */}
            <div className="flex items-center justify-end gap-2 border-t border-border pt-2 print:hidden">
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                Fermer
              </Button>
              <Button
                size="sm"
                onClick={handlePrint}
                aria-label="Télécharger le bilan carbone au format PDF"
                className="gap-2 bg-eco text-white hover:bg-eco"
              >
                <Printer className="h-4 w-4" aria-hidden="true" />
                Télécharger PDF
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
