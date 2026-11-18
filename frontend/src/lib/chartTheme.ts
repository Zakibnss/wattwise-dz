/**
 * Shared Recharts styling.
 *
 * Colours reference the CSS variables in index.css, so charts follow the
 * light/dark theme without re-rendering logic.
 */

export const chartColors = {
  consumption: "hsl(var(--chart-consumption))",
  solar: "hsl(var(--chart-solar))",
  forecast: "hsl(var(--chart-forecast))",
  grid: "hsl(var(--chart-grid))",
  neutral: "hsl(var(--chart-neutral))",
  danger: "hsl(var(--destructive))",
  success: "hsl(var(--eco))",
  warning: "hsl(var(--warning))",
} as const;

export const axisTick = {
  fill: "hsl(var(--muted-foreground))",
  fontSize: 11,
  fontFamily: "JetBrains Mono, ui-monospace, monospace",
} as const;

export const gridStroke = "hsl(var(--border))";

/** Inline styles for the Recharts tooltip container. */
import type { CSSProperties } from "react";

export const tooltipStyle: CSSProperties = {
  background: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "0.75rem",
  boxShadow: "0 18px 40px -24px hsl(220 45% 10% / 0.55)",
  fontSize: "0.75rem",
  padding: "0.5rem 0.75rem",
  color: "hsl(var(--popover-foreground))",
};

export const tooltipLabelStyle: CSSProperties = {
  color: "hsl(var(--muted-foreground))",
  fontSize: "0.7rem",
  marginBottom: "0.25rem",
};

export const tooltipItemStyle: CSSProperties = {
  color: "hsl(var(--popover-foreground))",
  fontFamily: "JetBrains Mono, ui-monospace, monospace",
};

export const legendStyle: CSSProperties = {
  fontSize: "0.72rem",
  color: "hsl(var(--muted-foreground))",
  paddingBottom: "0.5rem",
};
