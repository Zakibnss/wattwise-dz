import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { Bell, BellOff, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import { formatRelativeFr } from "@/lib/format";
import { cn } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

const severityClass: Record<string, string> = {
  HIGH: "bg-destructive",
  CRITICAL: "bg-destructive",
  MEDIUM: "bg-warning",
  LOW: "bg-volt",
};

/** Header bell with a dropdown listing the 5 latest active alerts. */
export function NotificationsBell() {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const { data: alerts = [] } = useQuery({
    queryKey: ["alerts-active"],
    queryFn: () => api.getAlertsActive({ device_id: "SALLE1", limit: 5 }),
    refetchInterval: 30000,
  });

  const active = alerts.filter((alert) => !alert.resolved).slice(0, 5);
  const count = active.length;

  React.useEffect(() => {
    if (!open) return;
    const handleClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="relative rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Notifications : ${count} alerte${count > 1 ? "s" : ""} active${count > 1 ? "s" : ""}`}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls="notifications-panel"
      >
        <Bell className="h-4 w-4" />
        {count > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold leading-none text-white">
            {count}
          </span>
        )}
      </button>

      {open && (
        <div
          id="notifications-panel"
          role="menu"
          aria-label="Dernières alertes"
          className="absolute right-0 z-[80] mt-2 w-[340px] overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-[0_30px_60px_-30px_hsl(220_45%_10%/0.55)] animate-in fade-in slide-in-from-top-2 duration-150"
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="text-sm font-semibold">Dernières alertes</span>
            <Badge variant={count > 0 ? "destructive" : "secondary"} className="text-[10px]">
              {count} active{count > 1 ? "s" : ""}
            </Badge>
          </div>

          {active.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
              <BellOff className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
              <p className="text-xs text-muted-foreground">Aucune alerte active. Bon travail !</p>
            </div>
          ) : (
            <ul className="max-h-72 overflow-y-auto">
              {active.map((alert) => (
                <li key={alert.id} className="border-b border-border/70 last:border-0">
                  <Link
                    to="/alerts"
                    onClick={() => setOpen(false)}
                    role="menuitem"
                    className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    <span
                      className={cn(
                        "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                        severityClass[alert.severity ?? ""] ?? "bg-muted-foreground",
                      )}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium text-foreground">
                        {alert.message || alert.type}
                      </span>
                      <span className="mt-0.5 block text-[10px] text-muted-foreground">
                        {formatRelativeFr(alert.timestamp)} • {alert.severity}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <Link
            to="/alerts"
            onClick={() => setOpen(false)}
            className="flex items-center justify-center gap-1 border-t border-border px-4 py-2.5 text-xs font-medium text-primary transition-colors hover:bg-accent"
          >
            Voir toutes les alertes
            <ChevronRight className="h-3 w-3" aria-hidden="true" />
          </Link>
        </div>
      )}
    </div>
  );
}
