import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import clsx from "clsx";
import { twMerge } from "tailwind-merge";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "success" | "solar";
  size?: "default" | "sm" | "lg" | "icon";
  asChild?: boolean;
};

export function cn(...classes: (string | undefined | null | false)[]) {
  return twMerge(clsx(...classes));
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    const variants: Record<string, string> = {
      default:
        "bg-primary text-primary-foreground shadow-[0_1px_0_hsl(0_0%_100%/0.18)_inset,0_10px_24px_-16px_hsl(var(--primary)/0.9)] hover:bg-primary/90 active:translate-y-px",
      destructive:
        "bg-destructive text-destructive-foreground hover:bg-destructive/90 active:translate-y-px",
      outline:
        "border border-input bg-card/70 text-foreground backdrop-blur hover:border-primary/50 hover:bg-accent hover:text-accent-foreground",
      secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
      success: "bg-success text-success-foreground hover:bg-success/90",
      solar:
        "bg-solar text-warning-foreground shadow-[0_10px_24px_-16px_hsl(var(--solar)/0.9)] hover:bg-solar/90",
      ghost: "text-foreground hover:bg-accent hover:text-accent-foreground",
    };
    const sizes: Record<string, string> = {
      default: "h-10 px-4 py-2",
      sm: "h-9 px-3",
      lg: "h-11 px-7",
      icon: "h-10 w-10",
    };
    const variantClass = variants[variant ?? "default"];
    const sizeClass = sizes[size ?? "default"];
    return (
      <Comp
        className={cn(
          "inline-flex items-center justify-center gap-1.5 rounded-lg text-sm font-semibold ring-offset-background transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50",
          variantClass,
          sizeClass,
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button };
