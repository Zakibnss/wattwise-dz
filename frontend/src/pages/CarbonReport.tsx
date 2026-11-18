"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { AnimatedCounter } from "@/components/ui/AnimatedCounter";
import { KpiSkeleton } from "@/components/ui/Skeleton";
import { api, CarbonReportResponse } from "@/lib/api";
import {
  Leaf,
  TreePine,
  Zap,
  Printer,
  CheckCircle,
  Globe,
  Target,
  ArrowUpRight,
} from "lucide-react";
import { CarbonReportDialog } from "@/components/reports/CarbonReportDialog";

const CO2_OBJECTIVE_KG = 100;

export function CarbonReportPage() {
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data, isLoading } = useQuery<CarbonReportResponse>({
    queryKey: ["carbon-report"],
    queryFn: () => api.getCarbonReport(),
  });

  const co2 = data?.co2_avoided_kg ?? 0;
  const progress = Math.min(100, Math.round((co2 / CO2_OBJECTIVE_KG) * 100));

  const kpis = [
    {
      title: "Énergie économisée",
      icon: Zap,
      iconClass: "bg-solar/10 text-solar dark:text-solar",
      value: data?.saved_kwh ?? 0,
      format: (v: number) => v.toFixed(1),
      unit: "kWh",
      subtitle: `Cumul vérifié sur la période (${data?.period ?? "mois en cours"})`,
      valueClass: "text-foreground",
    },
    {
      title: "CO₂ évité (net)",
      icon: Leaf,
      iconClass: "bg-eco/10 text-eco dark:text-eco",
      value: co2,
      format: (v: number) => v.toFixed(1),
      unit: "kg CO₂",
      subtitle: "Sur la base de 0,45 kg CO₂/kWh (Sonelgaz)",
      valueClass: "text-eco dark:text-eco",
    },
    {
      title: "Équivalent arbres plantés",
      icon: TreePine,
      iconClass: "bg-eco/10 text-eco dark:text-eco",
      value: data?.co2_avoided_kg ?? 0,
      format: (v: number) => (v / 20).toFixed(1),
      unit: "arbres",
      subtitle: "Capacité annuelle de séquestration moyenne",
      valueClass: "text-eco dark:text-eco",
      ariaLabel: `${((data?.co2_avoided_kg ?? 0) / 20).toFixed(1)} arbres (1 arbre ≈ 20 kg CO₂/an)`,
    },
  ];

  return (
    <div className="page flex flex-col gap-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="flex items-center gap-2 text-[26px] font-bold tracking-tight text-foreground">
            <Leaf className="h-6 w-6 text-eco" aria-hidden="true" />
            Bilan Carbone &amp; Éco-Responsabilité
          </h1>
          <p className="text-sm text-muted-foreground">
            Suivi des émissions de CO₂ évitées grâce aux optimisations énergétiques en Algérie.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)} className="gap-2">
            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            Aperçu modal
          </Button>
          <Button
            size="sm"
            onClick={() => window.print()}
            className="gap-2 bg-eco text-white hover:bg-eco"
            aria-label="Télécharger le bilan carbone au format PDF"
          >
            <Printer className="h-4 w-4" aria-hidden="true" />
            Télécharger PDF
          </Button>
        </div>
      </div>

      {isLoading ? (
        <KpiSkeleton count={3} />
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {kpis.map((kpi) => {
            const Icon = kpi.icon;
            return (
              <Card key={kpi.title} className="border-border transition-shadow hover:shadow-md">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-muted-foreground">{kpi.title}</span>
                    <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${kpi.iconClass}`}>
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </div>
                  </div>
                  <p
                    className={`mt-3 text-3xl font-extrabold ${kpi.valueClass}`}
                    title={kpi.ariaLabel}
                  >
                    <AnimatedCounter value={kpi.value} format={kpi.format} />{" "}
                    <span className="text-base font-medium text-muted-foreground">{kpi.unit}</span>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{kpi.subtitle}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Card className="border-eco/25 bg-eco/5">
        <CardContent className="pt-6">
          <div className="mb-2 flex flex-col justify-between gap-1 sm:flex-row sm:items-center">
            <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <Target className="h-4 w-4 text-eco" aria-hidden="true" />
              Objectif mensuel de CO₂ évité
            </span>
            <span className="text-sm font-bold text-eco dark:text-eco">
              {progress}% ({co2.toFixed(1)} / {CO2_OBJECTIVE_KG} kg)
            </span>
          </div>
          <div
            className="h-3.5 w-full overflow-hidden rounded-full bg-eco/15"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            aria-label={`Objectif CO2 évité : ${progress} pour cent`}
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-eco to-volt transition-[width] duration-700 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {progress >= 100
              ? "Objectif mensuel atteint. Excellent travail !"
              : `Encore ${(CO2_OBJECTIVE_KG - co2).toFixed(1)} kg de CO₂ à éviter pour atteindre l'objectif.`}
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Globe className="h-4 w-4 text-primary" aria-hidden="true" />
              Méthodologie de calcul &amp; facteur d&apos;émission
            </CardTitle>
            <CardDescription>
              Conformité avec les directives de transition énergétique en Algérie (APRUE / CREG).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>
              Le secteur du bâtiment représente plus de 40 % de la consommation d&apos;énergie finale en
              Algérie. Chaque kilowattheure économisé réduit directement la charge sur les centrales
              thermiques au gaz naturel.
            </p>
            <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-4">
              <div className="flex items-center justify-between text-xs font-medium text-foreground">
                <span>Facteur d&apos;émission réseau :</span>
                <Badge variant="secondary">0,45 kg CO₂e / kWh</Badge>
              </div>
              <div className="flex items-center justify-between text-xs font-medium text-foreground">
                <span>Taux de séquestration arbre :</span>
                <Badge variant="secondary">20,0 kg CO₂e / an</Badge>
              </div>
              <div className="flex items-center justify-between text-xs font-medium text-foreground">
                <span>Formule appliquée :</span>
                <span className="font-mono text-xs text-muted-foreground">CO₂ = kWh × 0,45</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <CheckCircle className="h-4 w-4 text-eco" aria-hidden="true" />
              Engagements RSE &amp; valorisation
            </CardTitle>
            <CardDescription>Mise en avant des performances environnementales pour les audits.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Ce rapport peut être directement utilisé pour vos déclarations RSE, vos bilans d&apos;audit
              énergétique obligatoires et pour postuler aux subventions d&apos;efficacité énergétique du
              FNME (Fonds National pour la Maîtrise de l&apos;Énergie).
            </p>
            <div className="pt-2">
              <Button
                onClick={() => window.print()}
                className="w-full gap-2 bg-primary text-primary-foreground sm:w-auto"
                aria-label="Générer l'attestation PDF"
              >
                <Printer className="h-4 w-4" aria-hidden="true" />
                Générer l&apos;attestation PDF
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <CarbonReportDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
