import * as React from "react";
import { cn } from "@/components/ui/Button";

/** Generic pulsing block used while data is loading. */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative overflow-hidden rounded-md bg-muted/70",
        "after:absolute after:inset-0 after:-translate-x-full after:animate-shimmer after:bg-gradient-to-r after:from-transparent after:via-foreground/[0.06] after:to-transparent",
        className,
      )}
      {...props}
    />
  );
}

/** Placeholder that mimics a card-style chart. */
export function ChartSkeleton({
  height = 300,
  className,
}: {
  height?: number;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-label="Chargement du graphique"
      className={cn(
        "relative w-full overflow-hidden rounded-xl border border-border bg-muted/20 p-4",
        className,
      )}
      style={{ height }}
    >
      <div className="flex h-full items-end gap-2">
        {Array.from({ length: 16 }).map((_, i) => (
          <div
            key={i}
            className="flex-1 animate-pulse rounded-t-md bg-gradient-to-t from-muted to-volt/15"
            style={{
              height: `${22 + ((i * 41) % 68)}%`,
              animationDelay: `${i * 45}ms`,
            }}
          />
        ))}
      </div>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background/70 via-transparent to-transparent" />
    </div>
  );
}

/** Grid of KPI card placeholders. */
export function KpiSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-3 rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <Skeleton className="h-9 w-9 rounded-xl" />
            <Skeleton className="h-3 w-12" />
          </div>
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-3 w-20" />
        </div>
      ))}
    </div>
  );
}

/** Table placeholder with rows and columns. */
export function TableSkeleton({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div role="status" aria-label="Chargement du tableau" className="w-full space-y-3">
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={`h-${i}`} className="h-3 w-20" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={`r-${r}`}
          className="grid items-center gap-3 border-t border-border pt-3"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={`c-${r}-${c}`} className="h-4 w-full" />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Full-page fallback used by React.lazy / Suspense. */
export function PageSkeleton() {
  return (
    <div className="page flex flex-col gap-6" role="status" aria-label="Chargement de la page">
      <div className="space-y-2">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <KpiSkeleton />
      <div className="rounded-2xl border border-border bg-card p-6">
        <Skeleton className="mb-4 h-5 w-48" />
        <ChartSkeleton />
      </div>
    </div>
  );
}
