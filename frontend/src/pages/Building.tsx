"use client";

import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button, cn } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Building3D, zoneStatus3D, STATUS_COLORS } from "@/components/building/Building3D";
import { api } from "@/lib/api";
import type { Equipment, Zone } from "@/lib/api";
import { formatPower } from "@/lib/format";
import { EQUIPMENT_TYPE_LABELS, EQUIPMENT_STATUS_LABELS } from "@/lib/constants";
import {
  AirVent,
  Lightbulb,
  Monitor,
  Zap,
  DoorOpen,
  RefreshCw,
  Sparkles,
  Wrench,
  X,
  Box,
  Layers,
  MousePointerClick,
  RotateCw,
} from "lucide-react";

/** Lucide icon lookup for the equipment ``icon`` column. */
const EQUIPMENT_ICONS: Record<string, typeof Zap> = {
  AirVent,
  Lightbulb,
  Monitor,
  Laptop: Monitor,
  Zap,
  DoorOpen,
};

const STATUS_BADGE: Record<string, "success" | "warning" | "destructive" | "outline"> = {
  online: "success",
  warning: "warning",
  alert: "destructive",
  offline: "outline",
};

const STATUS_LEGEND = [
  { color: STATUS_COLORS.online, label: "OK" },
  { color: STATUS_COLORS.warning, label: "Warning" },
  { color: STATUS_COLORS.alert, label: "Alert" },
];

function EquipmentCard({
  equipment,
  onOpen,
}: {
  equipment: Equipment;
  onOpen: (eq: Equipment) => void;
}) {
  const Icon = EQUIPMENT_ICONS[equipment.icon] ?? Zap;
  const isAlert = equipment.status === "alert";

  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      onClick={() => onOpen(equipment)}
      aria-label={`Détails de ${equipment.name}`}
      className={cn(
        "w-full cursor-pointer rounded-xl border bg-card p-3 text-left transition-all hover:shadow-panel-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isAlert
          ? "animate-pulse border-destructive/60"
          : "border-border hover:border-primary/40",
      )}
    >
      <div className="flex items-center gap-2.5">
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
            isAlert ? "bg-destructive/12 text-destructive" : "bg-volt/12 text-volt",
          )}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-foreground">{equipment.name}</p>
          <p className="text-[10px] text-muted-foreground">
            {EQUIPMENT_TYPE_LABELS[equipment.type] ?? equipment.type} ·{" "}
            <span className={cn("font-semibold", isAlert && "text-destructive")}>
              {EQUIPMENT_STATUS_LABELS[equipment.status] ?? equipment.status}
            </span>
          </p>
        </div>
        <span className="metric shrink-0 text-sm font-bold text-foreground">
          {formatPower(equipment.current_power_kw * 1000)}
        </span>
      </div>
      <div className="mt-2.5 space-y-1">
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>Santé</span>
          <span className="metric font-semibold">{equipment.health_score}/100</span>
        </div>
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={equipment.health_score}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Santé de ${equipment.name} : ${equipment.health_score} %`}
        >
          <div
            className={cn(
              "h-full rounded-full",
              equipment.health_score > 70
                ? "bg-eco"
                : equipment.health_score >= 40
                  ? "bg-warning"
                  : "bg-destructive",
            )}
            style={{ width: `${equipment.health_score}%` }}
          />
        </div>
      </div>
    </motion.button>
  );
}

export function Building() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedZoneId, setSelectedZoneId] = useState<number | null>(null);
  const [dialogEquipment, setDialogEquipment] = useState<Equipment | null>(null);

  const { data: tree, isLoading } = useQuery({
    queryKey: ["building-tree"],
    queryFn: () => api.getBuildingTree(1),
    refetchInterval: 15000,
  });

  const simulateMutation = useMutation({
    mutationFn: () => api.simulateEquipment(),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["building-tree"] });
      toast.success(`${res.updated} équipements simulés`, {
        description: "Puissances, santé et statuts mis à jour aléatoirement.",
      });
    },
    onError: (error: Error) =>
      toast.error("Simulation impossible", { description: error.message }),
  });

  const createActionMutation = useMutation({
    mutationFn: (equipment: Equipment) =>
      api.createAction({
        equipment_id: equipment.id,
        message: `${equipment.name} : intervention requise (santé ${equipment.health_score}/100).`,
        severity: equipment.status === "alert" ? "CRITICAL" : "HIGH",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
      queryClient.invalidateQueries({ queryKey: ["workflow"] });
      toast.success("Action créée", { description: "Retrouvez-la dans le Centre d'Actions." });
      setDialogEquipment(null);
      navigate("/actions");
    },
    onError: (error: Error) =>
      toast.error("Création impossible", { description: error.message }),
  });

  const zones = useMemo(() => (tree?.floors ?? []).flatMap((floor) => floor.zones), [tree]);
  const selectedZone = zones.find((zone) => zone.id === selectedZoneId) ?? null;

  const startWattyInvestigation = (equipment: Equipment) => {
    api
      .getAlerts({ resolved: false, limit: 200 })
      .then((alerts) => {
        const existing = alerts.find((a) => a.equipment_id === equipment.id);
        if (existing) {
          window.dispatchEvent(
            new CustomEvent("watty:investigate", { detail: { alertId: existing.id } }),
          );
          setDialogEquipment(null);
          return;
        }
        return api
          .createAction({
            equipment_id: equipment.id,
            message: `${equipment.name} : enquête demandée depuis la vue 3D.`,
            severity: equipment.status === "alert" ? "CRITICAL" : "HIGH",
          })
          .then((alert) => {
            queryClient.invalidateQueries({ queryKey: ["alerts"] });
            window.dispatchEvent(
              new CustomEvent("watty:investigate", { detail: { alertId: alert.id } }),
            );
            setDialogEquipment(null);
          });
      })
      .catch(() => toast.error("WATTY n'a pas pu démarrer l'enquête"));
  };

  if (isLoading || !tree) {
    return (
      <div className="page">
        <PageSkeleton />
      </div>
    );
  }

  return (
    <div className="page flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[26px] font-bold leading-tight tracking-tight text-foreground">
              Mon Bâtiment
            </h1>
            <Badge variant="volt">{tree.name}</Badge>
            {tree.city && <Badge variant="outline">{tree.city}</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {tree.floors.length} étages · {zones.length} zones ·{" "}
            {zones.reduce((acc, z) => acc + z.equipment.length, 0)} équipements · jumeau numérique 3D
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => simulateMutation.mutate()}
          disabled={simulateMutation.isPending}
          aria-label="Simuler une variation des équipements"
        >
          <RefreshCw
            className={cn("h-3.5 w-3.5", simulateMutation.isPending && "animate-spin")}
            aria-hidden="true"
          />
          {simulateMutation.isPending ? "Simulation…" : "Simuler"}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
        {/* Left panel: zone list (synced with the 3D selection) */}
        <Card className="h-fit">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Layers className="h-4 w-4 text-volt" aria-hidden="true" />
              Zones
            </CardTitle>
            <CardDescription>Sélectionnez une pièce</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {tree.floors.map((floor) => (
              <div key={floor.id} className="mb-2">
                <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  {floor.name}
                </p>
                <div className="space-y-1">
                  {floor.zones.map((zone) => {
                    const status = zoneStatus3D(zone);
                    return (
                      <button
                        key={zone.id}
                        type="button"
                        onClick={() => setSelectedZoneId(zone.id)}
                        aria-pressed={selectedZoneId === zone.id}
                        aria-label={`Zone ${zone.name} : ${status}`}
                        className={cn(
                          "flex w-full cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-[13px] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          selectedZoneId === zone.id
                            ? "border-primary/40 bg-primary/8 font-medium text-foreground"
                            : "border-transparent text-muted-foreground hover:border-border hover:bg-muted/40 hover:text-foreground",
                        )}
                      >
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: STATUS_COLORS[status] }}
                          aria-hidden="true"
                        />
                        <span className="truncate">{zone.name}</span>
                        <span className="metric ml-auto text-[10px] opacity-70">
                          {zone.equipment.length}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Center: interactive 3D canvas + overlays */}
        <Card className="relative overflow-hidden p-0">
          <div className="relative h-[clamp(520px,72vh,860px)] w-full">
            <Building3D
              floors={tree.floors}
              selectedZoneId={selectedZoneId}
              onSelectZone={setSelectedZoneId}
              onSelectEquipment={(id) => {
                const eq = zones.flatMap((z) => z.equipment).find((e) => e.id === id);
                if (eq) setDialogEquipment(eq);
              }}
              className="absolute inset-0"
            />

            {/* ---- UI overlay ---- */}
            {/* Top-left: title */}
            <div className="pointer-events-none absolute left-4 top-4 z-10">
              <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#0F172A]/80 px-3.5 py-2 shadow-lg backdrop-blur-md">
                <Box className="h-4 w-4 text-volt" aria-hidden="true" />
                <div>
                  <p className="text-[13px] font-bold text-white">Vue 3D — {tree.name}</p>
                  <p className="text-[10px] text-slate-400">
                    Jumeau numérique · {tree.floors.length} niveaux
                  </p>
                </div>
                <span className="ml-2 flex items-center gap-1 rounded-full bg-volt/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-volt">
                  <RotateCw className="h-2.5 w-2.5 animate-[spin_6s_linear_infinite]" aria-hidden="true" />
                  360°
                </span>
              </div>
            </div>

            {/* Top-right: legend */}
            <div className="pointer-events-none absolute right-4 top-4 z-10">
              <div className="rounded-xl border border-white/10 bg-[#0F172A]/80 px-3 py-2 shadow-lg backdrop-blur-md">
                <p className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400">
                  Légende
                </p>
                <div className="space-y-1">
                  {STATUS_LEGEND.map((item) => (
                    <div key={item.label} className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-sm"
                        style={{ backgroundColor: item.color, boxShadow: `0 0 8px ${item.color}` }}
                        aria-hidden="true"
                      />
                      <span className="text-[11px] text-slate-300">{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Bottom-left: instructions */}
            <div className="pointer-events-none absolute bottom-4 left-4 z-10">
              <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#0F172A]/80 px-3 py-2 text-[11px] text-slate-400 shadow-lg backdrop-blur-md">
                <MousePointerClick className="h-3.5 w-3.5 text-solar" aria-hidden="true" />
                Utilisez la souris pour tourner. Cliquez sur une salle.
              </div>
            </div>

            {/* ---- Side panel: slides in from the right ---- */}
            <AnimatePresence>
              {selectedZone && (
                <motion.aside
                  key={selectedZone.id}
                  initial={{ x: "110%", opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: "110%", opacity: 0 }}
                  transition={{ type: "spring", damping: 26, stiffness: 260 }}
                  className="absolute bottom-3 right-3 top-3 z-20 flex w-[300px] flex-col rounded-2xl border border-border bg-background/95 shadow-panel backdrop-blur-xl"
                  aria-label={`Équipements de ${selectedZone.name}`}
                >
                  <div className="flex items-start justify-between gap-2 border-b border-border/70 p-4">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-sm font-bold text-foreground">
                        <DoorOpen className="h-4 w-4 text-volt" aria-hidden="true" />
                        {selectedZone.name}
                      </p>
                      <div className="mt-1 flex items-center gap-1.5">
                        <Badge
                          variant={STATUS_BADGE[zoneStatus3D(selectedZone)]}
                          dot
                        >
                          {selectedZone.equipment.length} équipement(s)
                        </Badge>
                        {selectedZone.device_id && (
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {selectedZone.device_id}
                          </span>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 cursor-pointer"
                      onClick={() => setSelectedZoneId(null)}
                      aria-label="Fermer le panneau des équipements"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  </div>
                  <div className="mb-3 rounded-xl border border-border/70 bg-muted/30 p-3">
                     <div className="grid grid-cols-2 gap-2 text-[11px]">
                       <div>
                         <p className="text-muted-foreground">Équipements</p>
                         <p className="metric font-bold text-foreground">{selectedZone.equipment.length}</p>
                       </div>
                       <div>
                         <p className="text-muted-foreground">Anomalies actives</p>
                         <p className="metric font-bold text-foreground">
                           {selectedZone.equipment.filter((e) => e.status === "alert" || e.status === "warning").length}
                         </p>
                       </div>
                       <div>
                         <p className="text-muted-foreground">Puissance actuelle</p>
                         <p className="metric font-bold text-foreground">
                           {formatPower(selectedZone.equipment.reduce((a, e) => a + (e.current_power_kw || 0), 0) * 1000)}
                           <span className="ml-1 text-[9px] font-normal text-muted-foreground">(mesuré)</span>
                         </p>
                       </div>
                       <div>
                         <p className="text-muted-foreground">Consommation/jour</p>
                         <p className="metric font-bold text-foreground">
                           —
                           <span className="ml-1 text-[9px] font-normal text-muted-foreground">(non disponible)</span>
                         </p>
                       </div>
                     </div>
                     <p className="mt-2 text-[9px] text-muted-foreground">
                       Données temps réel · dernière mise à jour : {new Date().toLocaleTimeString("fr-FR")}
                     </p>
                   </div>
                   <div className="flex-1 space-y-2 overflow-y-auto p-3">
                    {selectedZone.equipment.map((equipment) => (
                      <EquipmentCard
                        key={equipment.id}
                        equipment={equipment}
                        onOpen={setDialogEquipment}
                      />
                    ))}
                    {selectedZone.equipment.length === 0 && (
                      <EmptyState
                        variant="data"
                        compact
                        title="Aucun équipement"
                        description="Cette zone n'a pas encore d'équipement enregistré."
                      />
                    )}
                  </div>
                </motion.aside>
              )}
            </AnimatePresence>
          </div>
        </Card>
      </div>

      {/* Equipment detail dialog */}
      <Dialog
        open={dialogEquipment !== null}
        onOpenChange={(open) => !open && setDialogEquipment(null)}
      >
        <DialogContent className="w-full max-w-[420px]">
          {dialogEquipment && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-base">
                  {React.createElement(
                    EQUIPMENT_ICONS[dialogEquipment.icon] ?? Zap,
                    { className: "h-4 w-4 text-volt", "aria-hidden": "true" },
                  )}
                  {dialogEquipment.name}
                </DialogTitle>
                <DialogDescription className="text-left">
                  {EQUIPMENT_TYPE_LABELS[dialogEquipment.type] ?? dialogEquipment.type} ·{" "}
                  {EQUIPMENT_STATUS_LABELS[dialogEquipment.status] ?? dialogEquipment.status} ·
                  zone {zones.find((z) => z.id === dialogEquipment.zone_id)?.name}
                </DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-border bg-muted/30 p-2.5">
                  <p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                    Puissance actuelle
                  </p>
                  <p className="metric mt-0.5 text-lg font-bold text-foreground">
                    {formatPower(dialogEquipment.current_power_kw * 1000)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    nominale : {formatPower(dialogEquipment.nominal_power_kw * 1000)}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-muted/30 p-2.5">
                  <p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                    Santé
                  </p>
                  <p
                    className={cn(
                      "metric mt-0.5 text-lg font-bold",
                      dialogEquipment.health_score > 70
                        ? "text-eco"
                        : dialogEquipment.health_score >= 40
                          ? "text-warning"
                          : "text-destructive",
                    )}
                  >
                    {dialogEquipment.health_score}/100
                  </p>
                  <p className="text-[10px] text-muted-foreground">score de l&apos;équipement</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="cursor-pointer gap-1.5"
                  onClick={() => startWattyInvestigation(dialogEquipment)}
                  aria-label="Enquêter avec WATTY"
                >
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  Enquêter avec WATTY
                </Button>
                <Button
                  size="sm"
                  className="cursor-pointer gap-1.5"
                  disabled={createActionMutation.isPending}
                  onClick={() => createActionMutation.mutate(dialogEquipment)}
                  aria-label="Créer une action"
                >
                  <Wrench className="h-3.5 w-3.5" aria-hidden="true" />
                  {createActionMutation.isPending ? "Création…" : "Créer une action"}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
