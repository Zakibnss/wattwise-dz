"use client";

import * as React from "react";

interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  stroke?: string;
  fill?: string;
  strokeWidth?: number;
  className?: string;
  ariaLabel?: string;
}

/**
 * Dependency-free sparkline: a smooth polyline plus a soft area fill.
 * Used where a full chart would be too heavy (KPI cards, telemetry rows).
 */
export function Sparkline({
  values,
  width = 120,
  height = 36,
  stroke = "hsl(var(--volt))",
  fill = "hsl(var(--volt) / 0.18)",
  strokeWidth = 1.75,
  className,
  ariaLabel,
}: SparklineProps) {
  const points = React.useMemo(() => {
    const clean = values.filter((value) => Number.isFinite(value));
    if (clean.length === 0) return null;
    if (clean.length === 1) {
      return { line: `0,${height / 2} ${width},${height / 2}`, area: "" };
    }
    const min = Math.min(...clean);
    const max = Math.max(...clean);
    const span = max - min || 1;
    const step = width / (clean.length - 1);
    const coords = clean.map((value, index) => {
      const x = index * step;
      // leave a 3px breathing margin top and bottom
      const y = height - 3 - ((value - min) / span) * (height - 6);
      return { x, y };
    });

    // Catmull-Rom-ish smoothing via quadratic midpoints keeps it cheap.
    let line = `M ${coords[0].x.toFixed(2)},${coords[0].y.toFixed(2)}`;
    for (let i = 1; i < coords.length; i += 1) {
      const prev = coords[i - 1];
      const curr = coords[i];
      const midX = (prev.x + curr.x) / 2;
      line += ` Q ${midX.toFixed(2)},${prev.y.toFixed(2)} ${curr.x.toFixed(2)},${curr.y.toFixed(2)}`;
    }
    const area = `${line} L ${width},${height} L 0,${height} Z`;
    return { line, area };
  }, [values, width, height]);

  if (!points) {
    return <div className={className} style={{ width, height }} aria-hidden="true" />;
  }

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      role="img"
      aria-label={ariaLabel ?? "Tendance des dernières mesures"}
      preserveAspectRatio="none"
    >
      {points.area && <path d={points.area} fill={fill} stroke="none" />}
      <path
        d={points.line}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
