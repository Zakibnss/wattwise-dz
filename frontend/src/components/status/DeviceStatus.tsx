"use client";

import { cn } from "@/components/ui/Button";

type DeviceStatusProps = {
  lastReadingAt: string | null;
  deviceId: string;
};

export function DeviceStatus({ lastReadingAt, deviceId }: DeviceStatusProps) {
  const now = new Date();
  const last = lastReadingAt ? new Date(lastReadingAt) : null;
  const diffMin = last ? (now.getTime() - last.getTime()) / 1000 / 60 : null;
  const online = diffMin != null && diffMin < 60;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Identifiant capteur
          </p>
          <p className="mt-0.5 font-mono text-sm font-semibold text-foreground">{deviceId}</p>
        </div>
        <span
          className={cn(
            "chip",
            online
              ? "border-eco/35 bg-eco/12 text-eco"
              : "border-destructive/35 bg-destructive/12 text-destructive",
          )}
        >
          <span
            className={cn("live-dot", !online && "bg-destructive after:hidden")}
            aria-hidden="true"
          />
          {online ? "En ligne" : "Hors ligne"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-border bg-muted/25 px-3 py-2">
          <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            Dernière trame
          </p>
          <p className="mt-1 font-mono text-xs font-medium text-foreground">
            {diffMin != null ? `il y a ${Math.max(0, Math.round(diffMin))} min` : "—"}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-muted/25 px-3 py-2">
          <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            Cadence
          </p>
          <p className="mt-1 font-mono text-xs font-medium text-foreground">10 s</p>
        </div>
      </div>

      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span
          className={cn("h-1.5 w-1.5 rounded-full", online ? "bg-eco" : "bg-destructive")}
          aria-hidden="true"
        />
        {online
          ? "Capteur connecté et transmettant sur wattwise/SALLE1/data"
          : "Capteur déconnecté — vérifiez le broker MQTT"}
      </div>
    </div>
  );
}
