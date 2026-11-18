import {
  demoAlerts,
  demoBenchmark,
  demoCarbonReport,
  demoChatReply,
  demoEcoMode,
  demoExplanation,
  demoForecast,
  demoInverterStatus,
  demoModels,
  demoPvDetailed,
  demoPvFaults,
  demoReadings,
  demoSavings,
  demoSavingsCreate,
  demoScore,
  demoSolarCurrent,
  demoSolarHistory,
  demoSolarOptimization,
  demoStats,
  demoTopConsumers,
  demoVacationMode,
  isDemoEcoEnabled,
  isDemoVacationEnabled,
  toggleDemoEco,
  toggleDemoVacationMode,
  demoBuildings,
  demoBuildingTree,
  demoSimulateEquipment,
  demoWorkflow,
  demoCreateAction,
  demoTransition,
  demoInvestigation,
  demoInsights,
  demoTriggerDemo,
  demoResetDemo,
  demoDemoStatus,
} from "@/lib/demoData";

interface ImportMetaEnv {
  VITE_API_URL?: string;
}

export const API_BASE = (import.meta as ImportMetaEnv).VITE_API_URL || "http://localhost:8000";

/**
 * Demo mode is a client-side fallback used during the pitch: every read API
 * returns a realistic in-memory dataset instead of hitting the backend.
 */
let demoMode = false;

export function setApiDemoMode(enabled: boolean) {
  demoMode = enabled;
}

export function isApiDemoMode() {
  return demoMode;
}

export type Reading = {
  id: number;
  device_id: string;
  timestamp: string;
  power: number | null;
  energy_kwh: number | null;
  fan_current: number | null;
  temperature: number | null;
  humidity: number | null;
  occupancy: number | null;
  lux: number | null;
  voltage: number | null;
  current: number | null;
  created_at: string;
};

export type Alert = {
  id: number;
  device_id: string;
  timestamp: string;
  type: string | null;
  severity: string | null;
  message: string | null;
  cause: string | null;
  confidence: number | null;
  resolved: boolean;
  created_at: string;
  // V3 action workflow
  stage?: string;
  is_demo?: boolean;
  equipment_id?: number | null;
  analysis?: string | null;
  proposed_action?: string | null;
  estimated_savings_kwh?: number | null;
  analyzed_at?: string | null;
  proposed_at?: string | null;
  approved_at?: string | null;
  executed_at?: string | null;
  verified_at?: string | null;
};

// ---------------------------------------------------------------------------
// V3 — Building hierarchy, workflow, Energy Brain, WATTY investigation, demo
// ---------------------------------------------------------------------------

export type Equipment = {
  id: number;
  zone_id: number;
  name: string;
  type: string;
  nominal_power_kw: number;
  current_power_kw: number;
  status: "online" | "warning" | "alert" | "offline";
  health_score: number;
  icon: string;
  created_at: string;
};

export type Zone = {
  id: number;
  floor_id: number;
  name: string;
  device_id: string | null;
  plan_x: number;
  plan_y: number;
  plan_w: number;
  plan_h: number;
  equipment: Equipment[];
};

export type Floor = {
  id: number;
  building_id: number;
  name: string;
  level: number;
  zones: Zone[];
};

export type Building = {
  id: number;
  name: string;
  address: string | null;
  city: string | null;
  country: string | null;
  description: string | null;
  created_at: string;
};

export type BuildingTree = Building & { floors: Floor[] };

export type EquipmentStatus =
  | "online"
  | "warning"
  | "alert"
  | "offline";

export type EquipmentSimulateResponse = {
  status: string;
  updated: number;
  equipment: Equipment[];
};

export type WorkflowStageCount = {
  stage: string;
  label: string;
  count: number;
};

export type WorkflowResponse = {
  stages: WorkflowStageCount[];
  total_active: number;
};

export type ActionTransitionResponse = {
  status: string;
  alert_id: number;
  stage: string;
  stage_label: string;
  message: string;
  saved_kwh: number | null;
  saved_dzd: number | null;
};

export type InvestigationHypothesis = {
  cause: string;
  confidence: number;
  evidence: string[];
  missing_data: string[];
  recommended_action: string;
};

export type InvestigationResult = {
  status: string;
  alert_id: number;
  hypotheses: InvestigationHypothesis[];
  summary: string | null;
  source: "llm" | "rules";
  generated_at: string;
};

export type Insight = {
  rule_id: string;
  title: string;
  description: string;
  severity: "info" | "warning" | "critical";
  confidence: number;
  category: string;
  recommended_action: string | null;
  zone_id: number | null;
  equipment_id: number | null;
  data: Record<string, unknown>;
};

export type InsightsResponse = {
  status: string;
  generated_at: string;
  insights: Insight[];
  briefing: string | null;
  critical_count: number;
  warning_count: number;
};

export type DemoTriggerResponse = {
  status: string;
  message: string;
  alert_id: number | null;
  equipment: Equipment | null;
};

export type DemoResetResponse = {
  status: string;
  message: string;
  resolved_alerts: number;
  reset_equipment: number;
};

export type DemoStatusResponse = {
  active: boolean;
  alert_ids: number[];
  equipment_id: number | null;
};

export type StatsSummary = {
  device_id: string | null;
  period_hours: number;
  avg_power_w: number | null;
  max_power_w: number | null;
  total_energy_kwh: number;
  alert_count: number;
  occupancy_ratio: number | null;
};

export type ForecastPrediction = {
  hour_offset: number;
  predicted_power: number;
  predicted_energy_kwh: number;
  confidence_lower: number;
  confidence_upper: number;
};

export type ForecastResponse = {
  status: string;
  device_id: string;
  generated_at: string;
  predictions: ForecastPrediction[];
};

export type AlertExplanation = {
  reason: string;
  evidence: Record<string, unknown>;
  recommended_action: string;
  estimated_savings_kwh_per_day: number | null;
};

export type ModelStatus = {
  name: string;
  loaded: boolean;
  path: string;
  metrics: Record<string, unknown> | null;
};

export type ModelsResponse = {
  models: Record<string, ModelStatus>;
  last_training_run: {
    id: number;
    model_name: string;
    trained_at: string;
    mae: number | null;
    rmse: number | null;
    r2: number | null;
    n_samples: number | null;
    notes: string | null;
  } | null;
};

export type SavingsCreate = {
  alert_id: number;
  device_id: string;
  action_applied: string;
  baseline_kwh: number;
  actual_kwh: number;
};

export type SavingsItem = {
  id: number;
  alert_id: number | null;
  device_id: string;
  timestamp: string;
  action_applied: string;
  baseline_kwh: number;
  actual_kwh: number;
  saved_kwh: number;
  saved_percent: number;
  confidence: number | null;
};

export type SavingsSummary = {
  status: string;
  device_id: string | null;
  period_from: string;
  period_to: string;
  total_saved_kwh: number;
  total_saved_dzd: number;
  count: number;
  items: SavingsItem[];
};

export type SolarCurrentResponse = {
  timestamp: string;
  power_kw: number;
  power_w: number;
  peak_kw: number;
  is_generating: boolean;
};

export type SolarPoint = {
  timestamp: string;
  power_kw: number;
  power_w: number;
};

/** One advanced PV measurement (DC/AC, irradiance, temperatures, inverter). */
export type PvReadingPoint = {
  id: number;
  device_id: string;
  timestamp: string;
  dc_voltage: number | null;
  dc_current: number | null;
  dc_power: number | null;
  ac_power: number | null;
  irradiance: number | null;
  panel_temperature: number | null;
  ambient_temperature: number | null;
  expected_power: number | null;
  actual_power: number | null;
  panel_area: number | null;
  panel_efficiency: number | null;
  inverter_efficiency: number | null;
  inverter_temperature: number | null;
  inverter_status: string | null;
  inverter_dc_input_power: number | null;
  inverter_ac_output_power: number | null;
  data_source: string;
};

export type PvDetailedResponse = {
  device_id: string;
  data_available: boolean;
  latest: PvReadingPoint | null;
  history: PvReadingPoint[];
  expected_power_w: number | null;
  actual_power_w: number | null;
  deviation_w: number | null;
  deviation_percent: number | null;
  data_source: string | null;
  last_update: string | null;
  is_stale: boolean;
  resolution_minutes: number;
};

/** Persistent (rule-based, non-confirmed) PV diagnostic. */
export type PvFault = {
  id: number;
  device_id: string;
  fault_type: string;
  severity: string;
  status: string;
  message: string;
  explanation: string | null;
  recommended_action: string | null;
  confidence: number | null;
  is_confirmed: boolean;
  occurrences: number;
  first_detected_at: string;
  last_detected_at: string;
  resolved_at: string | null;
};

export type PvFaultsResponse = {
  device_id: string;
  data_available: boolean;
  health_score: number | null;
  health_status: string;
  health_label: string;
  active_faults: PvFault[];
  history: PvFault[];
  critical_count: number;
  warning_count: number;
  methodology: string;
  last_update: string | null;
  is_stale: boolean;
};

export type InverterEfficiencyPoint = {
  timestamp: string;
  efficiency_percent: number;
};

export type InverterStatusResponse = {
  device_id: string;
  data_available: boolean;
  operating_status: string | null;
  efficiency_percent: number | null;
  temperature_c: number | null;
  dc_input_power_w: number | null;
  ac_output_power_w: number | null;
  average_efficiency_percent: number | null;
  degraded: boolean;
  efficiency_history: InverterEfficiencyPoint[];
  warnings: PvFault[];
  recommendations: string[];
  last_update: string | null;
  data_availability_message: string;
};

export type SolarOptimizationResponse = {
  solar_used_kwh: number;
  battery_used_kwh: number;
  grid_used_kwh: number;
  unused_solar_kwh: number;
  battery_charge_kwh: number;
  exported_kwh: number;
  grid_charge_kwh: number;
  battery_level_percent: number;
  estimated_daily_savings_dzd: number;
  estimated_savings_percent: number;
  baseline_cost_dzd: number;
  optimized_cost_dzd: number;
  recommendation_text: string;
  optimization_status: string;
  strategy: string;
  forecast_used: boolean;
  battery_simulated: boolean;
  tariff_dzd_per_kwh: number;
  suggested_charge_hours: number[];
  suggested_discharge_hours: number[];
  assumptions: string[];
};

export type EcoModeResponse = {
  eco_mode: boolean;
  status?: string;
  message?: string;
  peak_hours: string;
};

export type CarbonReportResponse = {
  saved_kwh: number;
  co2_avoided_kg: number;
  trees_equivalent: number;
  period: string;
  grid_factor: number;
  formula: string;
};

export type WattwiseScore = {
  score: number;
  grade: string;
  trend: string;
};

export type TopConsumer = {
  name: string;
  power_kw: number;
  pct: number;
};

export type TopConsumersResponse = {
  consumers: TopConsumer[];
};

export type BenchmarkResponse = {
  your_consumption: number;
  neighborhood_avg: number;
  percentage: number;
};

export type VacationModeResponse = {
  vacation_mode: boolean;
  message: string;
};

type HealthResponse = {
  status: string;
  database: string;
  mqtt: string;
};

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status} ${body}`);
  }
  return res.json();
}

export const api = {
  getHealth: () => {
    if (demoMode) return Promise.resolve({ status: "ok", database: "demo", mqtt: "ok" });
    return request<HealthResponse>("/api/health");
  },
  getReadingsLatest: (params?: {
    limit?: number;
    offset?: number;
    device_id?: string;
  }) => {
    if (demoMode) {
      const limit = params?.limit ?? 100;
      const offset = params?.offset ?? 0;
      return Promise.resolve(demoReadings.slice(offset, offset + limit).reverse() as Reading[]);
    }
    const qs = new URLSearchParams();
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.offset) qs.set("offset", String(params.offset));
    if (params?.device_id) qs.set("device_id", params.device_id);
    return request<Reading[]>(`/api/readings/latest?${qs}`);
  },
  getReadingsRange: (params?: {
    from?: string;
    to?: string;
    device_id?: string;
    limit?: number;
    offset?: number;
  }) => {
    if (demoMode) return Promise.resolve(demoReadings as Reading[]);
    const qs = new URLSearchParams();
    if (params?.from) qs.set("from", params.from);
    if (params?.to) qs.set("to", params.to);
    if (params?.device_id) qs.set("device_id", params.device_id);
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.offset) qs.set("offset", String(params.offset));
    return request<Reading[]>(`/api/readings/range?${qs}`);
  },
  getAlertsActive: (params?: {
    device_id?: string;
    limit?: number;
    offset?: number;
  }) => {
    if (demoMode) {
      const filtered = demoAlerts.filter(
        (alert) => !params?.device_id || alert.device_id === params.device_id,
      );
      return Promise.resolve(filtered as Alert[]);
    }
    const qs = new URLSearchParams();
    if (params?.device_id) qs.set("device_id", params.device_id);
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.offset) qs.set("offset", String(params.offset));
    return request<Alert[]>(`/api/alerts/active?${qs}`);
  },
  getAlerts: (params?: {
    device_id?: string;
    resolved?: boolean;
    limit?: number;
    offset?: number;
  }) => {
    if (demoMode) {
      const filtered = demoAlerts.filter(
        (alert) =>
          (!params?.device_id || alert.device_id === params.device_id) &&
          (params?.resolved === undefined || alert.resolved === params.resolved),
      );
      return Promise.resolve(filtered as Alert[]);
    }
    const qs = new URLSearchParams();
    if (params?.device_id) qs.set("device_id", params.device_id);
    if (params?.resolved !== undefined) qs.set("resolved", String(params.resolved));
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.offset) qs.set("offset", String(params.offset));
    return request<Alert[]>(`/api/alerts?${qs}`);
  },
  resolveAlert: (alertId: number) => {
    if (demoMode) {
      const alert = demoAlerts.find((item) => item.id === alertId) ?? demoAlerts[0];
      return Promise.resolve({ ...alert, resolved: true } as Alert);
    }
    return request<Alert>(`/api/alerts/${alertId}/resolve`, {
      method: "POST",
    });
  },
  getStatsSummary: (params?: {
    device_id?: string;
    hours?: number;
  }) => {
    if (demoMode) return Promise.resolve(demoStats as StatsSummary);
    const qs = new URLSearchParams();
    if (params?.device_id) qs.set("device_id", params.device_id);
    if (params?.hours) qs.set("hours", String(params.hours));
    return request<StatsSummary>(`/api/stats/summary?${qs}`);
  },
  getForecastNext24h: (deviceId = "SALLE1") => {
    if (demoMode) return Promise.resolve(demoForecast as ForecastResponse);
    return request<ForecastResponse>(`/api/forecast/next24h?device_id=${deviceId}`);
  },
  getAlertExplanation: (alertId: number) => {
    if (demoMode) return Promise.resolve(demoExplanation(alertId) as AlertExplanation);
    return request<AlertExplanation>(`/api/alerts/${alertId}/explanation`);
  },
  getModels: () => {
    if (demoMode) return Promise.resolve(demoModels as unknown as ModelsResponse);
    return request<ModelsResponse>("/api/models");
  },
  createSavings: (data: SavingsCreate) => {
    if (demoMode) return Promise.resolve(demoSavingsCreate(data) as SavingsItem);
    return request<SavingsItem>("/api/savings", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  getSavingsSummary: (params?: {
    device_id?: string;
    from?: string;
    to?: string;
  }) => {
    if (demoMode) return Promise.resolve(demoSavings as SavingsSummary);
    const qs = new URLSearchParams();
    if (params?.device_id) qs.set("device_id", params.device_id);
    if (params?.from) qs.set("from", params.from);
    if (params?.to) qs.set("to", params.to);
    return request<SavingsSummary>(`/api/savings/summary?${qs}`);
  },
  sendChatMessage: (message: string, deviceId: string) => {
    if (demoMode) return Promise.resolve(demoChatReply(message));
    return request<{ reply: string; action: any | null }>(
      "/api/chat",
      {
        method: "POST",
        body: JSON.stringify({ message, device_id: deviceId }),
      },
    );
  },
  resolveAllAlerts: (device_id: string = "SALLE1") => {
    if (demoMode) {
      return Promise.resolve({
        resolved: demoAlerts.filter((alert) => !alert.resolved).length,
        message: "Toutes les alertes de démonstration ont été résolues.",
      });
    }
    return request<{ resolved: number; message: string }>(
      "/api/alerts/resolve-all",
      { method: "POST", body: JSON.stringify({ device_id }) }
    );
  },
  getSolarCurrent: () => {
    if (demoMode) return Promise.resolve(demoSolarCurrent as SolarCurrentResponse);
    return request<SolarCurrentResponse>("/api/solar/current");
  },
  getSolarHistory: (hours: number = 24) => {
    if (demoMode) {
      const points = demoSolarHistory.slice(-(hours * 2 + 1));
      return Promise.resolve(points as SolarPoint[]);
    }
    return request<SolarPoint[]>(`/api/solar/history?hours=${hours}`);
  },
  getPvDetailed: (params?: {
    device_id?: string;
    hours?: number;
    resolution_minutes?: number;
  }) => {
    if (demoMode) return Promise.resolve(demoPvDetailed as PvDetailedResponse);
    const qs = new URLSearchParams();
    if (params?.device_id) qs.set("device_id", params.device_id);
    if (params?.hours) qs.set("hours", String(params.hours));
    if (params?.resolution_minutes) {
      qs.set("resolution_minutes", String(params.resolution_minutes));
    }
    return request<PvDetailedResponse>(`/api/solar/detailed?${qs}`);
  },
  getPvFaults: (params?: { device_id?: string; history_limit?: number }) => {
    if (demoMode) return Promise.resolve(demoPvFaults as PvFaultsResponse);
    const qs = new URLSearchParams();
    if (params?.device_id) qs.set("device_id", params.device_id);
    if (params?.history_limit) qs.set("history_limit", String(params.history_limit));
    return request<PvFaultsResponse>(`/api/solar/faults?${qs}`);
  },
  getInverterStatus: (params?: { device_id?: string; hours?: number }) => {
    if (demoMode) return Promise.resolve(demoInverterStatus as InverterStatusResponse);
    const qs = new URLSearchParams();
    if (params?.device_id) qs.set("device_id", params.device_id);
    if (params?.hours) qs.set("hours", String(params.hours));
    return request<InverterStatusResponse>(`/api/solar/inverter-status?${qs}`);
  },
  getSolarOptimization: (params?: {
    device_id?: string;
    consumption_device_id?: string;
    battery_soc_percent?: number;
    consumption_kwh?: number;
    solar_kwh?: number;
    hours?: number;
  }) => {
    if (demoMode) {
      return Promise.resolve(demoSolarOptimization as SolarOptimizationResponse);
    }
    const qs = new URLSearchParams();
    if (params?.device_id) qs.set("device_id", params.device_id);
    if (params?.consumption_device_id) {
      qs.set("consumption_device_id", params.consumption_device_id);
    }
    if (params?.battery_soc_percent !== undefined) {
      qs.set("battery_soc_percent", String(params.battery_soc_percent));
    }
    if (params?.consumption_kwh !== undefined) {
      qs.set("consumption_kwh", String(params.consumption_kwh));
    }
    if (params?.solar_kwh !== undefined) {
      qs.set("solar_kwh", String(params.solar_kwh));
    }
    if (params?.hours) qs.set("hours", String(params.hours));
    return request<SolarOptimizationResponse>(`/api/solar/optimization?${qs}`);
  },
  getEcoMode: () => {
    if (demoMode) return Promise.resolve({ ...demoEcoMode, eco_mode: isDemoEcoEnabled() });
    return request<EcoModeResponse>("/api/system/eco-mode");
  },
  toggleEcoMode: (enabled?: boolean) => {
    if (demoMode) return Promise.resolve(toggleDemoEco(enabled));
    return request<EcoModeResponse>("/api/system/eco-mode", {
      method: "POST",
      body: JSON.stringify(enabled !== undefined ? { enabled } : {}),
    });
  },
  getCarbonReport: () => {
    if (demoMode) return Promise.resolve(demoCarbonReport as CarbonReportResponse);
    return request<CarbonReportResponse>("/api/reports/carbon");
  },
  getWattwiseScore: (params?: { device_id?: string }) => {
    if (demoMode) return Promise.resolve(demoScore as WattwiseScore);
    const qs = new URLSearchParams();
    if (params?.device_id) qs.set("device_id", params.device_id);
    return request<WattwiseScore>(`/api/stats/score?${qs}`);
  },
  getTopConsumers: (params?: { device_id?: string }) => {
    if (demoMode) return Promise.resolve(demoTopConsumers as TopConsumersResponse);
    const qs = new URLSearchParams();
    if (params?.device_id) qs.set("device_id", params.device_id);
    return request<TopConsumersResponse>(`/api/stats/top-consumers?${qs}`);
  },
  getBenchmark: (params?: { device_id?: string }) => {
    if (demoMode) return Promise.resolve(demoBenchmark as BenchmarkResponse);
    const qs = new URLSearchParams();
    if (params?.device_id) qs.set("device_id", params.device_id);
    return request<BenchmarkResponse>(`/api/stats/benchmark?${qs}`);
  },
  getVacationMode: () => {
    if (demoMode) return Promise.resolve(demoVacationMode as VacationModeResponse);
    return request<VacationModeResponse>("/api/system/vacation-mode");
  },
  toggleVacationMode: (enabled?: boolean) => {
    if (demoMode) return Promise.resolve(toggleDemoVacationMode(enabled));
    return request<VacationModeResponse>("/api/system/vacation-mode", {
      method: "POST",
      body: JSON.stringify(enabled !== undefined ? { enabled } : {}),
    });
  },

  // -----------------------------------------------------------------------
  // V3 — Building hierarchy (Étape 1)
  // -----------------------------------------------------------------------
  getBuildings: () => {
    if (demoMode) return Promise.resolve(demoBuildings as unknown as { status: string; buildings: Building[] });
    return request<{ status: string; buildings: Building[] }>("/api/buildings");
  },
  getBuildingTree: (buildingId = 1) => {
    if (demoMode) return Promise.resolve(demoBuildingTree as unknown as BuildingTree);
    return request<BuildingTree>(`/api/buildings/${buildingId}/tree`);
  },
  simulateEquipment: () => {
    if (demoMode) return Promise.resolve(demoSimulateEquipment() as unknown as EquipmentSimulateResponse);
    return request<EquipmentSimulateResponse>("/api/equipment/simulate", { method: "POST" });
  },
  getEquipment: (params?: { zone_id?: number; status?: string }) => {
    if (demoMode) return Promise.resolve(demoBuildingTree.floors.flatMap((f) => f.zones).flatMap((z) => z.equipment) as unknown as Equipment[]);
    const qs = new URLSearchParams();
    if (params?.zone_id) qs.set("zone_id", String(params.zone_id));
    if (params?.status) qs.set("status", params.status);
    return request<Equipment[]>(`/api/equipment?${qs}`);
  },

  // -----------------------------------------------------------------------
  // V3 — Six-stage action workflow (Étape 4)
  // -----------------------------------------------------------------------
  getWorkflow: () => {
    if (demoMode) return Promise.resolve(demoWorkflow as unknown as WorkflowResponse);
    return request<WorkflowResponse>("/api/actions/workflow");
  },
  createAction: (data: {
    equipment_id: number;
    message?: string;
    severity?: string;
    type?: string;
  }) => {
    if (demoMode) return Promise.resolve(demoCreateAction(data) as unknown as Alert);
    return request<Alert>("/api/actions", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  analyzeAlert: (alertId: number) => {
    if (demoMode) return Promise.resolve(demoTransition(alertId, "ANALYSED") as unknown as ActionTransitionResponse);
    return request<ActionTransitionResponse>(`/api/alerts/${alertId}/analyze`, { method: "POST" });
  },
  proposeAlert: (alertId: number, data: { proposed_action: string; estimated_savings_kwh?: number }) => {
    if (demoMode) return Promise.resolve(demoTransition(alertId, "PROPOSED") as unknown as ActionTransitionResponse);
    return request<ActionTransitionResponse>(`/api/alerts/${alertId}/propose`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  approveAlert: (alertId: number) => {
    if (demoMode) return Promise.resolve(demoTransition(alertId, "APPROVED") as unknown as ActionTransitionResponse);
    return request<ActionTransitionResponse>(`/api/alerts/${alertId}/approve`, { method: "POST" });
  },
  executeAlert: (alertId: number) => {
    if (demoMode) return Promise.resolve(demoTransition(alertId, "EXECUTED") as unknown as ActionTransitionResponse);
    return request<ActionTransitionResponse>(`/api/alerts/${alertId}/execute`, { method: "POST" });
  },
  verifyAlert: (alertId: number) => {
    if (demoMode) return Promise.resolve(demoTransition(alertId, "VERIFIED") as unknown as ActionTransitionResponse);
    return request<ActionTransitionResponse>(`/api/alerts/${alertId}/verify`, { method: "POST" });
  },

  // -----------------------------------------------------------------------
  // V3 — WATTY investigation (Étape 5)
  // -----------------------------------------------------------------------
  investigate: (alertId: number) => {
    if (demoMode) return Promise.resolve(demoInvestigation(alertId) as unknown as InvestigationResult);
    return request<InvestigationResult>("/api/watty/investigate", {
      method: "POST",
      body: JSON.stringify({ alert_id: alertId }),
    });
  },

  // -----------------------------------------------------------------------
  // V3 — Energy Brain (Étape 6)
  // -----------------------------------------------------------------------
  getInsights: () => {
    if (demoMode) return Promise.resolve(demoInsights as unknown as InsightsResponse);
    return request<InsightsResponse>("/api/intelligence/insights");
  },

  // -----------------------------------------------------------------------
  // V3 — Jury demo mode (Étape 7)
  // -----------------------------------------------------------------------
  triggerDemo: () => {
    if (demoMode) return Promise.resolve(demoTriggerDemo() as unknown as DemoTriggerResponse);
    return request<DemoTriggerResponse>("/api/demo/trigger", { method: "POST" });
  },
  resetDemo: () => {
    if (demoMode) return Promise.resolve(demoResetDemo() as unknown as DemoResetResponse);
    return request<DemoResetResponse>("/api/demo/reset", { method: "POST" });
  },
  getDemoStatus: () => {
    if (demoMode) return Promise.resolve(demoDemoStatus() as unknown as DemoStatusResponse);
    return request<DemoStatusResponse>("/api/demo/status");
  },
};

export const formatDateFr = (iso: string | null, opts?: Intl.DateTimeFormatOptions) => {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    ...opts,
  }).format(new Date(iso));
};

export const formatRelativeFr = (iso: string | null) => {
  if (!iso) return "—";
  const now = new Date();
  const d = new Date(iso);
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "à l'instant";
  if (diffMin < 60) return `il y a ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `il y a ${diffH} h`;
  return formatDateFr(iso);
};
