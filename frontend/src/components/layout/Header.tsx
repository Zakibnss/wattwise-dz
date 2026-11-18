"use client";

import React from "react";
import { useLocation, useNavigate } from "react-router";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Bell,
  TrendingUp,
  PiggyBank,
  Calculator,
  Leaf,
  Settings,
  Menu,
  Sun,
  Moon,
  Monitor,
  Search,
  X,
  Trees,
  CornerDownLeft,
  Zap,
  FlaskConical,
  Building2,
  Workflow,
} from "lucide-react";
import { cn } from "@/components/ui/Button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/Dialog";
import { CarbonReportDialog } from "@/components/reports/CarbonReportDialog";
import { DemoModeButton } from "@/components/layout/DemoModeButton";
import { NotificationsBell } from "@/components/layout/NotificationsBell";
import { useTheme } from "@/hooks/useTheme";
import { useMqttStatus } from "@/hooks/useMqttStatus";
import { useEcoMode } from "@/hooks/useEcoMode";
import { useDemoMode } from "@/hooks/useDemoMode";
import { api } from "@/lib/api";
import { toast } from "sonner";

const navItems = [
  { path: "/", label: "Tableau de bord", icon: LayoutDashboard },
  { path: "/building", label: "Mon Bâtiment", icon: Building2 },
  { path: "/actions", label: "Centre d'Actions", icon: Workflow },
  { path: "/alerts", label: "Alertes", icon: Bell },
  { path: "/forecast", label: "Prévisions", icon: TrendingUp },
  { path: "/savings", label: "Économies", icon: PiggyBank },
  { path: "/simulateur", label: "Simulateur", icon: Calculator },
  { path: "/solar", label: "Solaire", icon: Sun },
  { path: "/carbon", label: "Bilan Carbone", icon: Leaf },
  { path: "/settings", label: "Paramètres", icon: Settings },
] as const;

const THEME_OPTIONS = [
  { value: "light", label: "Clair", icon: Sun },
  { value: "dark", label: "Sombre", icon: Moon },
  { value: "system", label: "Système", icon: Monitor },
] as const;

/**
 * "Lancer Démo Jury" — injects the S102 anomaly on the backend, toasts and
 * redirects to the Action Center (V3 Étape 7).
 */
function JuryDemoButton() {
  const navigate = useNavigate();
  const queryClient = useQueryClientSafe();
  const mutation = useMutation({
    mutationFn: () => api.triggerDemo(),
    onSuccess: (res) => {
      toast.success("Démo lancée", {
        description: res.message,
      });
      queryClient?.invalidateQueries();
      navigate("/actions");
    },
    onError: (error: Error) => {
      toast.error("Impossible de lancer la démo", { description: error.message });
    },
  });
  return (
    <button
      type="button"
      onClick={() => mutation.mutate()}
      disabled={mutation.isPending}
      aria-label="Lancer la démonstration jury"
      title="Injecter une anomalie de démonstration (Climatiseur S102)"
      className="hidden cursor-pointer items-center gap-1.5 rounded-full border border-volt/40 bg-volt/10 px-2.5 py-1.5 text-[11px] font-semibold text-volt transition-all duration-200 hover:bg-volt/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:flex disabled:opacity-60"
    >
      <FlaskConical
        className={cn("h-3.5 w-3.5", mutation.isPending && "animate-pulse")}
        aria-hidden="true"
      />
      <span>{mutation.isPending ? "Injection…" : "Lancer Démo Jury"}</span>
    </button>
  );
}

/** Small helper: react-query client, optional so tests never crash. */
function useQueryClientSafe() {
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useQueryClient();
  } catch {
    return null;
  }
}

function MobileSidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = useLocation().pathname;
  const navigate = useNavigate();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center justify-between border-b border-sidebar-border px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-volt to-solar text-sidebar-primary-foreground">
            <Zap className="h-4 w-4" strokeWidth={2.6} aria-hidden="true" />
          </div>
          <span className="text-sm font-extrabold tracking-tight">
            WATTWISE <span className="text-sidebar-primary">DZ</span>
          </span>
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-2 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
          aria-label="Fermer le menu de navigation"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <nav
        aria-label="Navigation principale mobile"
        className="flex-1 space-y-1 overflow-y-auto px-3 py-4"
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.path;
          return (
            <button
              key={item.path}
              onClick={() => {
                navigate(item.path);
                onClose();
              }}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
              )}
            >
              <Icon
                className={cn("h-4 w-4", isActive ? "text-sidebar-primary" : "opacity-60")}
                aria-hidden="true"
              />
              {item.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

export function Header() {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const { status: mqttStatus } = useMqttStatus();
  const { ecoMode, toggleEcoMode, isToggling } = useEcoMode();
  const { demoMode, toggleDemoMode } = useDemoMode();
  const [mobileSidebarOpen, setMobileSidebarOpen] = React.useState(false);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [carbonModalOpen, setCarbonModalOpen] = React.useState(false);

  /* Global shortcut: Ctrl/⌘ + K opens the command palette from anywhere. */
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  React.useEffect(() => {
    if (!paletteOpen) {
      setQuery("");
      setActiveIndex(0);
    }
  }, [paletteOpen]);

  const commands = React.useMemo(
    () => [
      ...navItems.map((item) => ({
        id: item.path,
        label: item.label,
        hint: "Page",
        icon: item.icon,
        run: () => navigate(item.path),
      })),
      {
        id: "eco",
        label: ecoMode ? "Désactiver le Mode Éco" : "Activer le Mode Éco",
        hint: "Action",
        icon: Leaf,
        run: () => toggleEcoMode(),
      },
      {
        id: "demo",
        label: demoMode ? "Désactiver le Mode Démo" : "Activer le Mode Démo",
        hint: "Action",
        icon: FlaskConical,
        run: () => toggleDemoMode(),
      },
      ...THEME_OPTIONS.map((option) => ({
        id: `theme-${option.value}`,
        label: `Thème ${option.label.toLowerCase()}`,
        hint: "Apparence",
        icon: option.icon,
        run: () => setTheme(option.value),
      })),
    ],
    [ecoMode, demoMode, navigate, setTheme, toggleDemoMode, toggleEcoMode],
  );

  const filtered = React.useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return commands;
    return commands.filter(
      (command) =>
        command.label.toLowerCase().includes(term) || command.hint.toLowerCase().includes(term),
    );
  }, [commands, query]);

  const runCommand = (index: number) => {
    const command = filtered[index];
    if (!command) return;
    command.run();
    setPaletteOpen(false);
  };

  return (
    <>
      <div className="flex w-full flex-1 items-center justify-between gap-2">
        {/* Mobile menu + brand */}
        <div className="flex min-w-0 items-center gap-1.5">
          <button
            className="flex items-center gap-2 rounded-lg p-2 text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
            onClick={() => setMobileSidebarOpen(true)}
            aria-label="Ouvrir le menu de navigation"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="hidden items-center gap-2 sm:flex md:hidden">
            <img src="/logo_long.png" alt="WATTWISE DZ" className="h-7 w-auto object-contain" />
          </div>

          {/* Live telemetry chip */}
          <div
            className="hidden items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1.5 sm:flex"
            title="État du broker MQTT"
          >
            <span
              className={cn(
                "relative flex h-1.5 w-1.5",
                mqttStatus === "ok" ? "text-eco" : "text-destructive",
              )}
              aria-hidden="true"
            >
              <span
                className={cn(
                  "absolute inline-flex h-full w-full rounded-full opacity-60",
                  mqttStatus === "ok" ? "animate-ping bg-eco" : "bg-destructive",
                )}
              />
              <span
                className={cn(
                  "relative inline-flex h-1.5 w-1.5 rounded-full",
                  mqttStatus === "ok" ? "bg-eco" : "bg-destructive",
                )}
              />
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              {mqttStatus === "ok" ? "MQTT OK" : "Hors ligne"}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          {/* Command palette trigger */}
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="group flex h-9 items-center gap-2 rounded-lg border border-border bg-card/70 px-2.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:w-56 lg:justify-between"
            aria-label="Ouvrir la recherche rapide"
          >
            <span className="flex items-center gap-2">
              <Search className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden lg:inline">Rechercher…</span>
            </span>
            <kbd className="hidden rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground lg:inline">
              ⌘K
            </kbd>
          </button>

          {/* Eco mode */}
          <button
            type="button"
            onClick={() => toggleEcoMode()}
            disabled={isToggling}
            aria-label={ecoMode ? "Désactiver le Mode Éco" : "Activer le Mode Éco"}
            aria-pressed={ecoMode}
            className={cn(
              "flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              ecoMode
                ? "border-eco/50 bg-eco/15 text-eco"
                : "border-border text-muted-foreground hover:border-eco/40 hover:text-foreground",
            )}
            title="Basculer le Mode Éco (Demand Response)"
          >
            <Leaf
              className={cn("h-3.5 w-3.5", ecoMode ? "text-eco" : "text-muted-foreground")}
              aria-hidden="true"
            />
            <span className="hidden sm:inline">Éco</span>
            <span
              className={cn(
                "inline-block h-1.5 w-1.5 rounded-full transition-colors",
                ecoMode ? "animate-pulse bg-eco" : "bg-muted-foreground/40",
              )}
              aria-hidden="true"
            />
          </button>

          {/* Carbon */}
          <button
            type="button"
            onClick={() => setCarbonModalOpen(true)}
            className="hidden cursor-pointer items-center gap-1.5 rounded-full border border-border px-2.5 py-1.5 text-[11px] font-semibold text-muted-foreground transition-all duration-200 hover:border-eco/40 hover:text-eco focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex"
            title="Afficher le Bilan Carbone"
            aria-label="Afficher le Bilan Carbone"
          >
            <Trees className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden md:inline">Carbone</span>
          </button>

          <JuryDemoButton />

          <DemoModeButton />

          {/* Theme segmented control */}
          <div
            className="hidden items-center gap-0.5 rounded-lg border border-border bg-card/70 p-0.5 sm:flex"
            role="group"
            aria-label="Choisir le thème d'affichage"
          >
            {THEME_OPTIONS.map((option) => {
              const Icon = option.icon;
              const active = theme === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setTheme(option.value)}
                  aria-pressed={active}
                  aria-label={`Thème ${option.label}`}
                  title={`Thème ${option.label}`}
                  className={cn(
                    "rounded-md p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active
                      ? "bg-accent text-accent-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              );
            })}
          </div>

          <NotificationsBell />

          <div className="hidden items-center gap-2 border-l border-border pl-2 sm:flex">
            <div className="flex h-7 w-7 items-center justify-center rounded-full border border-primary/25 bg-primary/10 font-mono text-[10px] font-bold text-primary">
              DZ
            </div>
            <span className="hidden text-xs font-medium lg:inline">Admin</span>
          </div>
        </div>
      </div>

      <MobileSidebar open={mobileSidebarOpen} onClose={() => setMobileSidebarOpen(false)} />

      {/* Command palette */}
      <Dialog open={paletteOpen} onOpenChange={setPaletteOpen}>
        <DialogContent className="w-full max-w-[520px] gap-0 overflow-hidden p-0">
          <div className="border-b border-border px-4 py-3">
            <DialogTitle className="sr-only">Recherche rapide</DialogTitle>
            <DialogDescription className="sr-only">
              Naviguez dans les modules et actions de WATTWISE DZ.
            </DialogDescription>
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <input
                autoFocus
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActiveIndex(0);
                }}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setActiveIndex((index) => Math.min(index + 1, filtered.length - 1));
                  } else if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setActiveIndex((index) => Math.max(index - 1, 0));
                  } else if (event.key === "Enter") {
                    event.preventDefault();
                    runCommand(activeIndex);
                  }
                }}
                placeholder="Aller à une page, activer le mode éco…"
                aria-label="Rechercher une page ou une action"
                className="h-8 w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
            </div>
          </div>
          <div className="max-h-[340px] overflow-y-auto p-2">
            {filtered.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                Aucun résultat pour « {query} ».
              </p>
            ) : (
              filtered.map((command, index) => {
                const Icon = command.icon;
                return (
                  <button
                    key={command.id}
                    type="button"
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => runCommand(index)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                      index === activeIndex
                        ? "bg-accent text-accent-foreground"
                        : "text-foreground hover:bg-muted",
                    )}
                  >
                    <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    <span className="flex-1">{command.label}</span>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      {command.hint}
                    </span>
                    {index === activeIndex && (
                      <CornerDownLeft className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                    )}
                  </button>
                );
              })
            )}
          </div>
          <div className="flex items-center justify-between border-t border-border px-4 py-2 text-[10px] text-muted-foreground">
            <span>↑ ↓ naviguer · ↵ ouvrir</span>
            <span className="font-mono">WATTWISE DZ</span>
          </div>
        </DialogContent>
      </Dialog>

      <CarbonReportDialog open={carbonModalOpen} onOpenChange={setCarbonModalOpen} />
    </>
  );
}
