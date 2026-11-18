/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        /*
         * Every token keeps the `/<alpha-value>` placeholder so Tailwind can
         * generate opacity modifiers (bg-primary/10, border-eco/35, …).
         * Without it those classes silently render as transparent.
         */
        border: "hsl(var(--border) / <alpha-value>)",
        input: "hsl(var(--input) / <alpha-value>)",
        ring: "hsl(var(--ring) / <alpha-value>)",
        background: "hsl(var(--background) / <alpha-value>)",
        foreground: "hsl(var(--foreground) / <alpha-value>)",
        primary: {
          DEFAULT: "hsl(var(--primary) / <alpha-value>)",
          foreground: "hsl(var(--primary-foreground) / <alpha-value>)",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary) / <alpha-value>)",
          foreground: "hsl(var(--secondary-foreground) / <alpha-value>)",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive) / <alpha-value>)",
          foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
        },
        success: {
          DEFAULT: "hsl(var(--success) / <alpha-value>)",
          foreground: "hsl(var(--success-foreground) / <alpha-value>)",
        },
        warning: {
          DEFAULT: "hsl(var(--warning) / <alpha-value>)",
          foreground: "hsl(var(--warning-foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "hsl(var(--muted) / <alpha-value>)",
          foreground: "hsl(var(--muted-foreground) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "hsl(var(--accent) / <alpha-value>)",
          foreground: "hsl(var(--accent-foreground) / <alpha-value>)",
        },
        popover: {
          DEFAULT: "hsl(var(--popover) / <alpha-value>)",
          foreground: "hsl(var(--popover-foreground) / <alpha-value>)",
        },
        card: {
          DEFAULT: "hsl(var(--card) / <alpha-value>)",
          foreground: "hsl(var(--card-foreground) / <alpha-value>)",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background) / <alpha-value>)",
          foreground: "hsl(var(--sidebar-foreground) / <alpha-value>)",
          primary: "hsl(var(--sidebar-primary) / <alpha-value>)",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground) / <alpha-value>)",
          accent: "hsl(var(--sidebar-accent) / <alpha-value>)",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground) / <alpha-value>)",
          border: "hsl(var(--sidebar-border) / <alpha-value>)",
          ring: "hsl(var(--sidebar-ring) / <alpha-value>)",
        },
        /* Energy accents */
        volt: {
          DEFAULT: "hsl(var(--volt) / <alpha-value>)",
          bright: "hsl(var(--volt-bright) / <alpha-value>)",
        },
        solar: {
          DEFAULT: "hsl(var(--solar) / <alpha-value>)",
          bright: "hsl(var(--solar-bright) / <alpha-value>)",
        },
        eco: "hsl(var(--eco) / <alpha-value>)",
        copper: "hsl(var(--copper) / <alpha-value>)",
        chart: {
          consumption: "hsl(var(--chart-consumption))",
          solar: "hsl(var(--chart-solar))",
          forecast: "hsl(var(--chart-forecast))",
          grid: "hsl(var(--chart-grid))",
          neutral: "hsl(var(--chart-neutral))",
        },
        dz: {
          50: "#f0fdf7",
          100: "#d9fbe9",
          500: "#12b981",
          600: "#059669",
          900: "#053f31",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 3px)",
        sm: "calc(var(--radius) - 6px)",
        "2xl": "1.1rem",
      },
      boxShadow: {
        panel: "0 1px 2px hsl(220 45% 10% / 0.04), 0 10px 30px -22px hsl(220 45% 10% / 0.45)",
        "panel-hover": "0 1px 2px hsl(220 45% 10% / 0.05), 0 18px 40px -24px hsl(220 45% 10% / 0.5)",
        volt: "0 0 0 1px hsl(var(--volt) / 0.3), 0 0 28px -10px hsl(var(--volt) / 0.55)",
        solar: "0 0 0 1px hsl(var(--solar) / 0.3), 0 0 28px -10px hsl(var(--solar) / 0.55)",
      },
      backgroundImage: {
        "volt-solar": "linear-gradient(115deg, hsl(var(--volt)), hsl(var(--solar)))",
        "panel-fade":
          "linear-gradient(180deg, hsl(var(--card)), hsl(var(--card)) 60%, hsl(var(--muted) / 0.35))",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        shimmer: "shimmer 1.8s linear infinite",
        "flow-dash": "flow-dash 1.4s linear infinite",
        "spin-slow": "spin 22s linear infinite",
        "rise-in": "rise-in 0.4s cubic-bezier(0.22, 1, 0.36, 1) both",
      },
      keyframes: {
        shimmer: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
        "flow-dash": {
          to: { strokeDashoffset: "-24" },
        },
        "rise-in": {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};
