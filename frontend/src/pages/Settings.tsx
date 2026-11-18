"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button, cn } from "@/components/ui/Button";
import { ModelStatus } from "@/components/status/ModelStatus";
import { useTheme } from "@/hooks/useTheme";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Loader2, Monitor, Moon, Sun, PlugZap, Save } from "lucide-react";

type ModelState = {
  loaded: boolean;
  name: string;
  metrics: Record<string, unknown> | null;
} | null;

const THEMES = [
  { value: "light", label: "Clair", icon: Sun },
  { value: "dark", label: "Sombre", icon: Moon },
  { value: "system", label: "Système", icon: Monitor },
] as const;

export function SettingsPage() {
  const [apiUrl, setApiUrl] = useState(
    () => localStorage.getItem("wattwise_api_url") || "http://localhost:8000",
  );
  const [refreshInterval, setRefreshInterval] = useState(
    () => localStorage.getItem("wattwise_refresh_interval") || "30",
  );
  const [models, setModels] = useState<ModelState>(null);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const { theme, setTheme } = useTheme();

  const loadModels = async () => {
    setIsLoadingModels(true);
    try {
      const data = await api.getModels();
      const forecaster = data.models.forecaster;
      setModels({
        loaded: forecaster.loaded,
        name: forecaster.name,
        metrics: forecaster.metrics,
      });
    } catch {
      setModels({ loaded: false, name: "forecaster_v1", metrics: null });
    } finally {
      setIsLoadingModels(false);
    }
  };

  const handleSave = () => {
    localStorage.setItem("wattwise_api_url", apiUrl);
    localStorage.setItem("wattwise_refresh_interval", refreshInterval);
    toast.success("Paramètres enregistrés avec succès");
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    try {
      await api.getHealth();
      toast.success("Connexion réussie");
    } catch {
      toast.error("Échec de la connexion");
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="page flex flex-col gap-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-foreground">Paramètres</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configurez l&apos;application WATTWISE DZ.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Configuration API</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label htmlFor="settings-api-url" className="text-xs font-medium text-muted-foreground">
                URL de l&apos;API backend
              </label>
              <Input
                id="settings-api-url"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                placeholder="http://localhost:8000"
              />
            </div>
            <div>
              <label htmlFor="settings-refresh" className="text-xs font-medium text-muted-foreground">
                Intervalle de rafraîchissement (secondes)
              </label>
              <Input
                id="settings-refresh"
                type="number"
                min="5"
                value={refreshInterval}
                onChange={(e) => setRefreshInterval(e.target.value)}
                placeholder="30"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={handleTestConnection} disabled={isTesting}>
                {isTesting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <PlugZap className="mr-2 h-4 w-4" aria-hidden="true" />
                )}
                Tester la connexion
              </Button>
              <Button onClick={handleSave}>
                <Save className="mr-2 h-4 w-4" aria-hidden="true" />
                Enregistrer
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Les paramètres sont stockés dans le navigateur (localStorage).
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Statut des modèles ML</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button variant="outline" onClick={loadModels} disabled={isLoadingModels} className="w-full">
              {isLoadingModels && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              {models ? "Rafraîchir le statut" : "Charger le statut"}
            </Button>
            {models && <ModelStatus loaded={models.loaded} name={models.name} metrics={models.metrics} />}
            {models && !models.loaded && (
              <p className="text-sm text-muted-foreground">
                Le modèle n&apos;est pas encore entraîné. Exécutez :{" "}
                <code className="rounded bg-muted px-2 py-1 text-xs">python -m app.ai.train_forecaster</code>
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Apparence</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Thème
            </span>
            <p className="mt-1 text-xs text-muted-foreground">
              Le choix est enregistré dans ce navigateur et appliqué avant le premier rendu.
            </p>
            <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Choix du thème">
              {THEMES.map((option) => {
                const Icon = option.icon;
                const active = theme === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setTheme(option.value)}
                    aria-pressed={active}
                    className={cn(
                      "flex min-w-[104px] flex-1 flex-col items-start gap-2 rounded-xl border p-3 text-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      active
                        ? "border-primary/50 bg-primary/8 font-medium text-primary shadow-panel"
                        : "border-border text-muted-foreground hover:border-primary/30 hover:bg-muted/50 hover:text-foreground",
                    )}
                  >
                    <span className="flex w-full items-center justify-between">
                      <Icon className="h-4 w-4" aria-hidden="true" />
                      <span
                        aria-hidden="true"
                        className={cn(
                          "flex h-3 w-3 items-center justify-center rounded-full border",
                          active ? "border-primary" : "border-muted-foreground/40",
                        )}
                      >
                        {active && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                      </span>
                    </span>
                    <span className="text-xs">{option.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <span className="text-xs font-medium text-muted-foreground">Langue</span>
            <div className="mt-2 flex gap-2" role="group" aria-label="Choix de la langue">
              {["FR", "AR", "EN"].map((lang) => (
                <button
                  key={lang}
                  type="button"
                  disabled={lang !== "FR"}
                  title={lang === "FR" ? "Langue active" : "Bientôt disponible"}
                  className={cn(
                    "rounded-md px-3 py-2 text-sm transition-colors",
                    lang === "FR"
                      ? "bg-primary/10 font-medium text-primary"
                      : "cursor-not-allowed text-muted-foreground/60",
                  )}
                >
                  {lang}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="text-xs font-medium text-muted-foreground">Devise</span>
            <div className="mt-2 flex gap-2" role="group" aria-label="Choix de la devise">
              {["DZD", "EUR", "USD"].map((curr) => (
                <button
                  key={curr}
                  type="button"
                  disabled={curr !== "DZD"}
                  title={curr === "DZD" ? "Devise active" : "Bientôt disponible"}
                  className={cn(
                    "rounded-md px-3 py-2 text-sm transition-colors",
                    curr === "DZD"
                      ? "bg-primary/10 font-medium text-primary"
                      : "cursor-not-allowed text-muted-foreground/60",
                  )}
                >
                  {curr}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
