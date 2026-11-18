import * as React from "react";
import { cn } from "@/components/ui/Button";

type EmptyStateVariant = "alerts" | "success" | "data" | "search";

interface EmptyStateProps {
  title: string;
  description?: string;
  variant?: EmptyStateVariant;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}

function Illustration({ variant }: { variant: EmptyStateVariant }) {
  const stroke = "hsl(var(--primary))";
  const soft = "hsl(var(--primary) / 0.12)";
  const muted = "hsl(var(--muted-foreground) / 0.35)";

  return (
    <svg
      viewBox="0 0 200 140"
      role="img"
      aria-hidden="true"
      className="h-32 w-auto"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <ellipse cx="100" cy="122" rx="72" ry="10" fill={soft} />
      {variant === "alerts" && (
        <>
          <rect x="44" y="34" width="112" height="74" rx="14" fill={soft} />
          <path d="M74 58h52M74 72h38M74 86h26" stroke={muted} strokeWidth="5" strokeLinecap="round" />
          <circle cx="140" cy="40" r="17" fill="hsl(var(--card))" stroke={stroke} strokeWidth="3" />
          <path d="M140 31v11l7 4" stroke={stroke} strokeWidth="3" strokeLinecap="round" />
        </>
      )}
      {variant === "success" && (
        <>
          <circle cx="100" cy="68" r="40" fill={soft} />
          <circle cx="100" cy="68" r="29" stroke={stroke} strokeWidth="3" />
          <path d="m86 68 10 10 19-21" stroke={stroke} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M62 108h76" stroke={muted} strokeWidth="4" strokeLinecap="round" />
        </>
      )}
      {variant === "search" && (
        <>
          <circle cx="92" cy="62" r="30" fill={soft} stroke={stroke} strokeWidth="3" />
          <path d="m114 84 20 20" stroke={stroke} strokeWidth="5" strokeLinecap="round" />
          <path d="M80 62h24M92 50v24" stroke={muted} strokeWidth="4" strokeLinecap="round" />
        </>
      )}
      {variant === "data" && (
        <>
          <rect x="46" y="30" width="108" height="78" rx="14" fill={soft} />
          <path d="M64 92V70M86 92V56M108 92V64M130 92V46" stroke={muted} strokeWidth="8" strokeLinecap="round" />
          <path d="m60 54 22-14 20 8 26-18" stroke={stroke} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="128" cy="30" r="4" fill={stroke} />
        </>
      )}
    </svg>
  );
}

/**
 * Friendly, illustrated empty state used by tables, charts and lists.
 */
export function EmptyState({
  title,
  description,
  variant = "data",
  action,
  className,
  compact = false,
}: EmptyStateProps) {
  return (
    <div
      role="status"
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "py-6 px-4" : "py-12 px-6",
        className,
      )}
    >
      <Illustration variant={variant} />
      <h3 className={cn("mt-3 font-semibold text-foreground", compact ? "text-sm" : "text-base")}>
        {title}
      </h3>
      {description && (
        <p className="mt-1 max-w-sm text-xs sm:text-sm text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
