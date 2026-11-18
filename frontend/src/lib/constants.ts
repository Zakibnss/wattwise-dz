export const DZD_PER_KWH = 5.5;

export const SONELGAZ_TIERS = [
  { label: "0 - 100 kWh", rate: 4.5, limit: 100 },
  { label: "101 - 200 kWh", rate: 6.2, limit: 200 },
  { label: "201 - 300 kWh", rate: 8.7, limit: 300 },
  { label: "301+ kWh", rate: 12.3, limit: Infinity },
];

export const API_BASE = (import.meta as any).env.VITE_API_URL || "http://localhost:8000";

export const NAV_ITEMS = [
  { path: "/", label: "Tableau de bord", icon: "LayoutDashboard" },
  { path: "/alerts", label: "Alertes", icon: "Bell" },
  { path: "/forecast", label: "Prévisions", icon: "TrendingUp" },
  { path: "/savings", label: "Économies", icon: "PiggyBank" },
  { path: "/simulateur", label: "Simulateur", icon: "Calculator" },
  { path: "/carbon", label: "Bilan Carbone", icon: "Leaf" },
  { path: "/settings", label: "Paramètres", icon: "Settings" },
] as const;

export const ALERT_TYPE_LABELS: Record<string, string> = {
  FAN_NO_OCCUPANCY: "Ventilateur sans occupation",
  HIGH_POWER_NO_OCCUPANCY: "Puissance élevée sans occupation",
  LIGHTING_CANDIDATE: "Éclairage inutile",
  LIGHTING_WASTE: "Gaspi éclairage",
  ISOLATION_FOREST_ANOMALY: "Anomalie (Forêt d'isolation)",
  OVERCONSUMPTION_VS_FORECAST: "Surconsommation vs prévision",
  PEAK_ALERT: "Pic de consommation",
  VACATION_INTRUSION: "Intrusion / retour anticipé",
  EQUIPMENT_MALFUNCTION: "Équipement défaillant",
};

export const ALERT_TYPE_COLORS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  FAN_NO_OCCUPANCY: "destructive",
  HIGH_POWER_NO_OCCUPANCY: "destructive",
  LIGHTING_CANDIDATE: "secondary",
  LIGHTING_WASTE: "secondary",
  ISOLATION_FOREST_ANOMALY: "secondary",
  OVERCONSUMPTION_VS_FORECAST: "destructive",
  PEAK_ALERT: "destructive",
  VACATION_INTRUSION: "destructive",
  EQUIPMENT_MALFUNCTION: "destructive",
};

// ---------------------------------------------------------------------------
// V3 — Six-stage action workflow + equipment hierarchy
// ---------------------------------------------------------------------------

export const WORKFLOW_STAGES = [
  "DETECTED",
  "ANALYSED",
  "PROPOSED",
  "APPROVED",
  "EXECUTED",
  "VERIFIED",
] as const;

export const WORKFLOW_STAGE_LABELS: Record<string, string> = {
  DETECTED: "Détecté",
  ANALYSED: "Analysé",
  PROPOSED: "Proposé",
  APPROVED: "Approuvé",
  EXECUTED: "Exécuté",
  VERIFIED: "Vérifié",
};

export const EQUIPMENT_TYPE_LABELS: Record<string, string> = {
  AC: "Climatisation",
  Light: "Éclairage",
  Computer: "Informatique",
  Other: "Autre",
};

export const EQUIPMENT_STATUS_LABELS: Record<string, string> = {
  online: "En ligne",
  warning: "À surveiller",
  alert: "Alerte",
  offline: "Hors ligne",
};

/** Building system status derived from the worst active anomaly. */
export type SystemStatus = "ok" | "warning" | "critical";

export function systemStatusFromCounts(criticalCount: number, warningCount: number): {
  key: SystemStatus;
  label: string;
} {
  if (criticalCount > 0) return { key: "critical", label: "Critique" };
  if (warningCount > 0) return { key: "warning", label: "À Surveiller" };
  return { key: "ok", label: "Système Opérationnel" };
}
