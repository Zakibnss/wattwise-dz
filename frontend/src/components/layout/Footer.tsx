import * as React from "react";
import { NavLink } from "react-router";
import { Zap } from "lucide-react";

/**
 * Discreet application footer, visible on every page.
 */
export function Footer() {
  return (
    <footer className="mt-10 border-t border-border/70 px-2 py-4">
      <div className="flex flex-col items-center justify-between gap-2 text-[11px] text-muted-foreground sm:flex-row">
        <p className="flex items-center gap-1.5">
          <Zap className="h-3 w-3 text-volt" aria-hidden="true" />
          <span>WATTWISE DZ © 2026 — SEM&apos;INNOV Challenge</span>
        </p>
        <nav aria-label="Liens de pied de page" className="flex items-center gap-3">
          <NavLink to="/carbon" className="rounded transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Bilan Carbone
          </NavLink>
          <span aria-hidden="true">•</span>
          <NavLink to="/simulateur" className="rounded transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Simulateur ROI
          </NavLink>
          <span aria-hidden="true">•</span>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em]">
            5.5 DZD / kWh
          </span>
        </nav>
      </div>
    </footer>
  );
}
