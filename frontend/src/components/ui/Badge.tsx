import * as React from "react";
import clsx from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...classes: (string | undefined | null | false)[]) {
  return twMerge(clsx(...classes));
}

type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  variant?: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "volt";
  dot?: boolean;
};

const variants = {
  default: "border-primary/30 bg-primary/15 text-primary dark:text-primary",
  secondary: "border-border bg-secondary text-secondary-foreground",
  destructive: "border-destructive/35 bg-destructive/12 text-destructive",
  outline: "border-border bg-transparent text-muted-foreground",
  success: "border-success/35 bg-success/12 text-success",
  warning: "border-warning/40 bg-warning/12 text-warning",
  volt: "border-volt/40 bg-volt/12 text-volt",
};

const dotColors: Record<string, string> = {
  default: "bg-primary",
  secondary: "bg-muted-foreground",
  destructive: "bg-destructive",
  outline: "bg-muted-foreground",
  success: "bg-success",
  warning: "bg-warning",
  volt: "bg-volt",
};

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = "default", dot = false, children, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        variants[variant],
        className,
      )}
      {...props}
    >
      {dot && (
        <span
          className={cn("h-1.5 w-1.5 rounded-full", dotColors[variant])}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  ),
);
Badge.displayName = "Badge";

export { Badge };
