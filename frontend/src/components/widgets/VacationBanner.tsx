"use client";

import React from "react";
import { Sun, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api";

interface VacationBannerProps {
  vacationMode: boolean;
  onToggle: () => void;
}

export function VacationBanner({
  vacationMode,
  onToggle,
}: VacationBannerProps) {
  if (!vacationMode) return null;

  return (
    <div
      role="status"
      className="flex items-center justify-between gap-2 bg-volt px-4 py-2 text-center text-xs font-semibold text-primary-foreground shadow-sm animate-in slide-in-from-top duration-300 sm:text-sm"
      aria-live="polite"
    >
      <div className="flex items-center gap-2">
        <ShieldAlert className="h-4 w-4 fill-white" aria-hidden="true" />
        <span>Mode Vacances Actif</span>
      </div>
      <Button
        variant="default"
        size="sm"
        onClick={onToggle}
        className="text-xs px-3 py-1.5 bg-white/20 hover:bg-white/30 border border-white/30"
        aria-label="Désactiver le Mode Vacances"
      >
        <Sun className="h-3 w-3 fill-white" aria-hidden="true" />
        Désactiver
      </Button>
    </div>
  );
}

VacationBanner.displayName = "VacationBanner";
