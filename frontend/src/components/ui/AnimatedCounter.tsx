import * as React from "react";
import { cn } from "@/components/ui/Button";

interface AnimatedCounterProps {
  value: number;
  /** Formatter applied to the interpolated value. */
  format?: (value: number) => string;
  duration?: number;
  className?: string;
  ariaLabel?: string;
}

const defaultFormat = (value: number) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value);

/**
 * Counts up from 0 to `value` on mount (and when `value` changes).
 * Respects the user's reduced-motion preference.
 */
export function AnimatedCounter({
  value,
  format = defaultFormat,
  duration = 900,
  className,
  ariaLabel,
}: AnimatedCounterProps) {
  const safeValue = Number.isFinite(value) ? value : 0;
  const [display, setDisplay] = React.useState(0);
  const previous = React.useRef(0);

  React.useEffect(() => {
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    if (reduceMotion || duration <= 0) {
      setDisplay(safeValue);
      previous.current = safeValue;
      return;
    }

    const from = previous.current;
    const delta = safeValue - from;
    if (delta === 0) {
      setDisplay(safeValue);
      return;
    }

    let frame = 0;
    const start = performance.now();

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      // easeOutCubic for a premium feel
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = from + delta * eased;
      setDisplay(next);
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        previous.current = safeValue;
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [safeValue, duration]);

  return (
    <span className={cn("tabular-nums", className)} aria-label={ariaLabel ?? format(safeValue)}>
      <span aria-hidden="true">{format(display)}</span>
    </span>
  );
}
