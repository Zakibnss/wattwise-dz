"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { SavingsChart } from "@/components/charts/SavingsChart";
import { AnimatedCounter } from "@/components/ui/AnimatedCounter";
import { KpiSkeleton, ChartSkeleton, TableSkeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatCurrency, formatEnergy, formatPercent, formatDateFr } from "@/lib/format";
import { DZD_PER_KWH } from "@/lib/constants";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { PiggyBank, Download, RefreshCw, Save } from "lucide-react";

type SavingsForm = {
  alert_id: string;
  device_id: string;
  action_applied: string;
  baseline_kwh: string;
  actual_kwh: string;
};

const EMPTY_FORM: SavingsForm = {
  alert_id: "",
  device_id: "SALLE1",
  action_applied: "",
  baseline_kwh: "",
  actual_kwh: "",
};

export function SavingsPage() {
  const [form, setForm] = useState<SavingsForm>(EMPTY_FORM);
  const queryClient = useQueryClient();

  const { data: summary, isLoading } = useQuery({
    queryKey: ["savings-summary", form.device_id],
    queryFn: () => api.getSavingsSummary({ device_id: form.device_id || undefined }),
  });

  const createMutation = useMutation({
    mutationFn: (data: {
      alert_id: number;
      device_id: string;
      action_applied: string;
      baseline_kwh: number;
      actual_kwh: number;
    }) => api.createSavings(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["savings-summary"] });
      toast.success("Économies enregistrées avec succès");
      setForm((prev) => ({ ...EMPTY_FORM, device_id: prev.device_id }));
    },
    onError: () => {
      toast.error("Échec de l'enregistrement des économies");
    },
  });

  const update = (key: keyof SavingsForm, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.action_applied.trim()) {
      toast.error("Veuillez décrire l'action appliquée.");
      return;
    }
    const baseline = Number.parseFloat(form.baseline_kwh);
    const actual = Number.parseFloat(form.actual_kwh);
    if (!Number.isFinite(baseline) || !Number.isFinite(actual)) {
      toast.error("Veuillez saisir des valeurs kWh valides.");
      return;
    }
    createMutation.mutate({
      alert_id: Number.parseInt(form.alert_id, 10) || 0,
      device_id: form.device_id || "SALLE1",
      action_applied: form.action_applied.trim(),
      baseline_kwh: baseline,
      actual_kwh: actual,
    });
  };

  const chartData =
    summary?.items
      .slice(0, 7)
      .reverse()
      .map((item, i) => ({
        name: `J${i + 1}`,
        saved_kwh: item.saved_kwh,
      })) ?? [];

  const exportCsv = () => {
    const items = summary?.items ?? [];
    if (items.length === 0) {
      toast.info("Aucune économie à exporter.");
      return;
    }
    const header = ["date", "alerte", "action", "baseline_kwh", "reel_kwh", "economise_kwh", "pourcent"];
    const rows = items.map((item) =>
      [
        item.timestamp,
        item.alert_id ?? "",
        `"${item.action_applied.replace(/"/g, '""')}"`,
        item.baseline_kwh,
        item.actual_kwh,
        item.saved_kwh,
        item.saved_percent,
      ].join(","),
    );
    const blob = new Blob([[header.join(","), ...rows].join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `wattwise-economies-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Export CSV téléchargé");
  };

  return (
    <div className="page flex flex-col gap-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="flex items-center gap-2 text-[26px] font-bold tracking-tight text-foreground">
            <PiggyBank className="h-6 w-6 text-eco" aria-hidden="true" />
            Économies d&apos;énergie
          </h1>
          <p className="text-sm text-muted-foreground">
            Suivez les économies réalisées après intervention sur les alertes.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv} aria-label="Exporter les économies en CSV">
            <Download className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Exporter
          </Button>
          <Button onClick={() => window.location.reload()} aria-label="Actualiser les économies">
            <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Actualiser
          </Button>
        </div>
      </div>

      {isLoading ? (
        <KpiSkeleton count={3} />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-muted-foreground">Total économisé</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-1">
                <span className="text-[26px] font-bold tracking-tight text-foreground">
                  <AnimatedCounter
                    value={summary?.total_saved_kwh ?? 0}
                    format={(v) => formatEnergy(v)}
                  />
                </span>
                <p className="text-xs text-muted-foreground">Total d&apos;énergie économisée</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-muted-foreground">Valeur (DA)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-1">
                <span className="text-2xl font-bold text-eco dark:text-eco">
                  <AnimatedCounter
                    value={summary?.total_saved_dzd ?? 0}
                    format={(v) => formatCurrency(v)}
                  />
                </span>
                <p className="text-xs text-muted-foreground">1 kWh = {DZD_PER_KWH} DA</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-muted-foreground">Nombre d&apos;actions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-1">
                <span className="text-[26px] font-bold tracking-tight text-foreground">
                  <AnimatedCounter value={summary?.count ?? 0} />
                </span>
                <p className="text-xs text-muted-foreground">Actions d&apos;économie enregistrées</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Enregistrer une économie</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label htmlFor="savings-alert-id" className="text-xs font-medium text-muted-foreground">
                    ID de l&apos;alerte
                  </label>
                  <Input
                    id="savings-alert-id"
                    value={form.alert_id}
                    onChange={(e) => update("alert_id", e.target.value)}
                    placeholder="Ex : 1"
                    inputMode="numeric"
                  />
                </div>
                <div className="col-span-2">
                  <label htmlFor="savings-device" className="text-xs font-medium text-muted-foreground">
                    Appareil
                  </label>
                  <Input
                    id="savings-device"
                    value={form.device_id}
                    onChange={(e) => update("device_id", e.target.value)}
                    placeholder="SALLE1"
                  />
                </div>
                <div className="col-span-2">
                  <label htmlFor="savings-action" className="text-xs font-medium text-muted-foreground">
                    Action appliquée
                  </label>
                  <Input
                    id="savings-action"
                    value={form.action_applied}
                    onChange={(e) => update("action_applied", e.target.value)}
                    placeholder="Ex : Ventilateur éteint"
                  />
                </div>
                <div>
                  <label htmlFor="savings-baseline" className="text-xs font-medium text-muted-foreground">
                    Baseline (kWh)
                  </label>
                  <Input
                    id="savings-baseline"
                    type="number"
                    step="0.1"
                    min="0"
                    value={form.baseline_kwh}
                    onChange={(e) => update("baseline_kwh", e.target.value)}
                    placeholder="10.0"
                  />
                </div>
                <div>
                  <label htmlFor="savings-actual" className="text-xs font-medium text-muted-foreground">
                    Réel (kWh)
                  </label>
                  <Input
                    id="savings-actual"
                    type="number"
                    step="0.1"
                    min="0"
                    value={form.actual_kwh}
                    onChange={(e) => update("actual_kwh", e.target.value)}
                    placeholder="4.0"
                  />
                </div>
              </div>
              <Button type="submit" disabled={createMutation.isPending} className="w-full">
                <Save className="mr-2 h-4 w-4" aria-hidden="true" />
                {createMutation.isPending ? "Enregistrement…" : "Enregistrer"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Économies par action</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <ChartSkeleton height={240} /> : <SavingsChart data={chartData} height={240} />}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Historique des économies</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <TableSkeleton rows={5} cols={7} />
          ) : (summary?.items?.length ?? 0) === 0 ? (
            <EmptyState
              variant="data"
              compact
              title="Aucune économie enregistrée"
              description="Résolvez une alerte puis enregistrez l'action appliquée pour mesurer les kWh économisés."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="pb-3 text-left text-xs font-medium text-muted-foreground">Date</th>
                    <th className="pb-3 text-left text-xs font-medium text-muted-foreground">Alerte</th>
                    <th className="pb-3 text-left text-xs font-medium text-muted-foreground">Action</th>
                    <th className="pb-3 text-right text-xs font-medium text-muted-foreground">Baseline</th>
                    <th className="pb-3 text-right text-xs font-medium text-muted-foreground">Réel</th>
                    <th className="pb-3 text-right text-xs font-medium text-muted-foreground">Économisé</th>
                    <th className="pb-3 text-right text-xs font-medium text-muted-foreground">%</th>
                  </tr>
                </thead>
                <tbody>
                  {summary?.items.map((item) => (
                    <tr key={item.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                      <td className="whitespace-nowrap py-2 text-sm text-foreground">
                        {formatDateFr(item.timestamp)}
                      </td>
                      <td className="py-2 text-sm text-foreground">{item.alert_id ?? "—"}</td>
                      <td className="py-2 text-sm text-foreground">{item.action_applied}</td>
                      <td className="py-2 text-right text-sm text-foreground">{formatEnergy(item.baseline_kwh)}</td>
                      <td className="py-2 text-right text-sm text-foreground">{formatEnergy(item.actual_kwh)}</td>
                      <td className="py-2 text-right text-sm font-medium text-eco dark:text-eco">
                        {formatEnergy(item.saved_kwh)}
                      </td>
                      <td className="py-2 text-right text-sm text-muted-foreground">
                        {formatPercent(item.saved_percent)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
