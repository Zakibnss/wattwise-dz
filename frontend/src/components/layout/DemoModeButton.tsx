import { FlaskConical, Radio } from "lucide-react";
import { cn } from "@/components/ui/Button";
import { useDemoMode } from "@/hooks/useDemoMode";

/**
 * One-click fallback for the pitch: loads a realistic in-memory dataset when
 * the simulator / backend data pipeline is unavailable.
 */
export function DemoModeButton() {
  const { demoMode, toggleDemoMode } = useDemoMode();

  return (
    <button
      type="button"
      onClick={toggleDemoMode}
      aria-pressed={demoMode}
      aria-label={demoMode ? "Désactiver le mode démo" : "Activer le mode démo"}
      title="Mode Démo — données instantanées pour la présentation"
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        demoMode
          ? "border-warning/50 bg-warning/12 text-warning shadow-solar"
          : "border-border text-muted-foreground hover:border-warning/50 hover:text-foreground",
      )}
    >
      {demoMode ? (
        <Radio className="h-3.5 w-3.5 animate-pulse text-warning" aria-hidden="true" />
      ) : (
        <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      <span className="hidden md:inline">{demoMode ? "Démo active" : "Mode Démo"}</span>
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          demoMode ? "bg-warning" : "bg-muted-foreground/40",
        )}
        aria-hidden="true"
      />
    </button>
  );
}
