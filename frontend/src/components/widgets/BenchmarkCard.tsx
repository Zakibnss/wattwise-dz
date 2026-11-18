"use client";

import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/components/ui/Button";
import { Users, ArrowDownRight, ArrowUpRight } from "lucide-react";

interface BenchmarkCardProps {
  your_consumption: number;
  neighborhood_avg: number;
  percentage: number;
}

export function BenchmarkCard({
  your_consumption,
  neighborhood_avg,
  percentage,
}: BenchmarkCardProps) {
  const isBetter = percentage < 0;
  const Icon = isBetter ? ArrowDownRight : ArrowUpRight;
  const max = Math.max(your_consumption, neighborhood_avg, 1);
  const yourWidth = Math.max(4, (your_consumption / max) * 100);
  const averageWidth = Math.max(4, (neighborhood_avg / max) * 100);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-volt/12 text-volt">
              <Users className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            <CardTitle className="text-sm font-semibold">Benchmark Voisinage</CardTitle>
          </div>
          <Badge variant={isBetter ? "success" : "destructive"} dot>
            {isBetter ? "Sous la moyenne" : "Au-dessus"}
          </Badge>
        </div>
        <CardDescription>
          Votre consommation comparée à la moyenne du quartier.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-border bg-muted/25 px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              Votre bâtiment
            </p>
            <p className="metric mt-1 text-xl font-bold text-foreground">
              {your_consumption}
              <span className="ml-1 font-sans text-xs font-medium text-muted-foreground">kW</span>
            </p>
          </div>
          <div className="rounded-xl border border-border bg-muted/25 px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              Moyenne voisinage
            </p>
            <p className="metric mt-1 text-xl font-bold text-muted-foreground">
              {neighborhood_avg}
              <span className="ml-1 font-sans text-xs font-medium">kW</span>
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="w-16 shrink-0 font-mono text-[10px] uppercase text-muted-foreground">
              Vous
            </span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full transition-[width] duration-700"
                style={{
                  width: `${yourWidth}%`,
                  background: isBetter ? "hsl(var(--eco))" : "hsl(var(--copper))",
                }}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-16 shrink-0 font-mono text-[10px] uppercase text-muted-foreground">
              Quartier
            </span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-muted-foreground/45 transition-[width] duration-700"
                style={{ width: `${averageWidth}%` }}
              />
            </div>
          </div>
        </div>

        <div
          className={cn(
            "flex items-start gap-2 rounded-xl border px-3 py-2.5",
            isBetter
              ? "border-eco/30 bg-eco/8 text-eco"
              : "border-copper/30 bg-copper/8 text-copper",
          )}
        >
          <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold">
              {Math.abs(percentage)} % {isBetter ? "de moins" : "de plus"} que la moyenne
            </p>
            <p className="mt-0.5 text-[11px] opacity-85">
              {isBetter
                ? "Votre bâtiment est plus efficient que la plupart du voisinage."
                : "Votre bâtiment consomme plus que la moyenne — activez le Mode Éco."}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

BenchmarkCard.displayName = "BenchmarkCard";
