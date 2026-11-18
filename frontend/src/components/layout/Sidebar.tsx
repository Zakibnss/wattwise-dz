"use client";

import React from "react";
import { NavLink } from "react-router";
import {
  LayoutDashboard,
  Bell,
  TrendingUp,
  PiggyBank,
  Calculator,
  Leaf,
  Sun,
  Settings,
  Zap,
  Building2,
  Workflow,
} from "lucide-react";
import { cn } from "@/components/ui/Button";
import { useMqttStatus } from "@/hooks/useMqttStatus";

type NavItem = {
  to: string;
  icon: typeof LayoutDashboard;
  label: string;
  hint?: string;
};

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Supervision",
    items: [
      { to: "/", icon: LayoutDashboard, label: "Tableau de bord" },
      { to: "/building", icon: Building2, label: "Mon Bâtiment" },
      { to: "/actions", icon: Workflow, label: "Centre d'Actions" },
    ],
  },
  {
    title: "Analyse",
    items: [
      { to: "/forecast", icon: TrendingUp, label: "Prévisions" },
      { to: "/solar", icon: Sun, label: "Solaire" },
      { to: "/carbon", icon: Leaf, label: "Bilan Carbone" },
    ],
  },
  {
    title: "Actions",
    items: [
      { to: "/savings", icon: PiggyBank, label: "Économies" },
      { to: "/simulateur", icon: Calculator, label: "Simulateur" },
    ],
  },
  {
    title: "Système",
    items: [{ to: "/settings", icon: Settings, label: "Paramètres" }],
  },
];

export function Sidebar() {
  const { status: mqttStatus } = useMqttStatus();
  const online = mqttStatus === "ok";

  return (
    <div className="flex min-h-full flex-col">
      {/* Brand */}
      <div className="relative border-b border-sidebar-border px-5 py-5">
        <div className="flex items-center gap-3">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-volt to-solar text-sidebar-primary-foreground shadow-volt">
            <Zap className="h-5 w-5" strokeWidth={2.6} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-extrabold tracking-[0.02em] text-sidebar-foreground">
              WATTWISE <span className="text-sidebar-primary">DZ</span>
            </p>
            <p className="truncate text-[10px] uppercase tracking-[0.18em] text-sidebar-foreground/50">
              Energy Intelligence
            </p>
          </div>
        </div>
        <div className="hairline mt-4 opacity-60" />
      </div>

      {/* Navigation */}
      <nav aria-label="Navigation principale" className="flex-1 space-y-5 px-3 py-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.title}>
            <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-sidebar-foreground/40">
              {group.title}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === "/"}
                    aria-label={item.label}
                    className={({ isActive }) =>
                      cn(
                        "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium outline-none transition-all duration-150 focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                        isActive
                          ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-[inset_0_1px_0_hsl(0_0%_100%/0.06)]"
                          : "text-sidebar-foreground/65 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <span
                          aria-hidden="true"
                          className={cn(
                            "absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full transition-all duration-200",
                            isActive
                              ? "bg-gradient-to-b from-volt to-solar opacity-100"
                              : "opacity-0",
                          )}
                        />
                        <Icon
                          className={cn(
                            "h-[18px] w-[18px] shrink-0 transition-colors",
                            isActive
                              ? "text-sidebar-primary"
                              : "text-sidebar-foreground/50 group-hover:text-sidebar-foreground/80",
                          )}
                          aria-hidden="true"
                        />
                        <span className="truncate">{item.label}</span>
                      </>
                    )}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* System status */}
      <div className="mx-3 mb-3 rounded-xl border border-sidebar-border bg-sidebar-accent/40 p-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/45">
            Passerelle MQTT
          </span>
          <span className="flex items-center gap-1.5 text-[10px] font-semibold text-sidebar-foreground/80">
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                online ? "animate-pulse bg-eco" : "bg-destructive",
              )}
              aria-hidden="true"
            />
            {online ? "EN LIGNE" : "HORS LIGNE"}
          </span>
        </div>
        <p className="mt-1.5 font-mono text-[11px] text-sidebar-foreground/45">
          SALLE1 · PV1
        </p>
      </div>

      <div className="border-t border-sidebar-border px-5 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/40">
          SEM&apos;INNOV Challenge
        </p>
        <p className="mt-0.5 text-[11px] text-sidebar-foreground/55">
          Efficacité énergétique · Algérie
        </p>
      </div>
    </div>
  );
}
