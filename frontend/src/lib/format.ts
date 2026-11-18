import { format, formatDistanceToNow, parseISO } from "date-fns";
import { fr } from "date-fns/locale";

export const DZD_PER_KWH = 5.5;

export function formatPower(w: number | null | undefined): string {
  if (w == null) return "—";
  if (w >= 1000) return `${(w / 1000).toFixed(1)} kW`;
  return `${Math.round(w)} W`;
}

export function formatEnergy(kwh: number | null | undefined): string {
  if (kwh == null) return "—";
  if (kwh >= 1000) return `${(kwh / 1000).toFixed(2)} MWh`;
  return `${kwh.toFixed(2)} kWh`;
}

/**
 * Energy with an automatic unit: sub-kWh values are shown in Wh so a small
 * 24 h window does not read as "0.00 kWh".
 */
export function formatEnergyAuto(kwh: number | null | undefined): string {
  if (kwh == null) return "—";
  if (kwh > 0 && kwh < 0.1) return `${Math.round(kwh * 1000)} Wh`;
  if (kwh > 0 && kwh < 1) return `${(kwh * 1000).toFixed(0)} Wh`;
  return formatEnergy(kwh);
}

export function formatCurrency(dzd: number | null | undefined): string {
  if (dzd == null) return "—";
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "DZD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(dzd);
}

export function formatDateFr(iso: string | null): string {
  if (!iso) return "—";
  return format(parseISO(iso), "dd MMM yyyy, HH:mm", { locale: fr });
}

export function formatTimeFr(iso: string | null): string {
  if (!iso) return "—";
  try {
    return format(parseISO(iso), "HH:mm", { locale: fr });
  } catch {
    return "—";
  }
}

export function formatRelativeFr(iso: string | null): string {
  if (!iso) return "—";
  try {
    return formatDistanceToNow(parseISO(iso), { addSuffix: true, locale: fr });
  } catch {
    return "—";
  }
}

export function formatPercent(pct: number | null | undefined): string {
  if (pct == null) return "—";
  return new Intl.NumberFormat("fr-FR", {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(pct / 100);
}

export function formatNumber(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("fr-FR").format(n);
}
