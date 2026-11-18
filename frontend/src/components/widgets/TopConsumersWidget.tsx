"use client";

import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/components/ui/Button";
import { Flame, Zap } from "lucide-react";

interface TopConsumerItem {
  name: string;
  power_kw: number;
  pct: number;
}

interface TopConsumersWidgetProps {
  consumers: TopConsumerItem[];
}

export function TopConsumersWidget({ consumers }: TopConsumersWidgetProps) {
  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-copper/12 text-copper">
              <Flame className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            <CardTitle className="text-sm font-semibold">Top Consommateurs</CardTitle>
          </div>
          <Badge variant="outline" className="font-mono">
            TOP 5
          </Badge>
        </div>
        <CardDescription>Zones les plus énergivores du bâtiment.</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 space-y-2.5 pb-5">
        {consumers.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
            Aucun classement disponible pour le moment.
          </p>
        ) : (
          consumers.map((item, idx) => {
            const rank = idx + 1;
            const isWaster = rank === 1;
            return (
              <div
                key={item.name}
                className="group flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/40"
              >
                <span
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-md font-mono text-[10px] font-bold",
                    isWaster
                      ? "bg-destructive/12 text-destructive"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {String(rank).padStart(2, "0")}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-mono text-xs font-medium text-foreground">
                      {item.name}
                    </span>
                    <span className="metric shrink-0 text-xs font-semibold text-foreground">
                      {item.power_kw} kW
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(100, Math.max(3, item.pct))}%`,
                        background: isWaster
                          ? "linear-gradient(90deg, hsl(var(--destructive)), hsl(var(--copper)))"
                          : "linear-gradient(90deg, hsl(var(--volt)), hsl(var(--eco)))",
                      }}
                    />
                  </div>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
      {consumers.length > 0 && (
        <div className="mt-auto flex items-center gap-1.5 border-t border-border/70 bg-muted/20 px-5 py-2.5">
          <Zap className="h-3 w-3 text-copper" aria-hidden="true" />
          <span className="text-[11px] text-muted-foreground">
            <span className="font-mono font-semibold text-foreground">{consumers[0].name}</span>{" "}
            concentre le plus de gaspillage
          </span>
        </div>
      )}
    </Card>
  );
}

TopConsumersWidget.displayName = "TopConsumersWidget";
