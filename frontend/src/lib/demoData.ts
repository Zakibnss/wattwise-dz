/**
 * Self-contained demo dataset used by "Mode Démo".
 *
 * It lets the jury (or a fallback during the pitch) explore every screen even
 * when the MQTT simulator / Postgres data pipeline is not running. The API
 * client short-circuits to these values while demo mode is enabled, so no
 * request ever leaves the browser.
 */

const now = Date.now();
const isoAgo = (minutes: number) => new Date(now - minutes * 60_000).toISOString();

export const demoCarbonReport = {
  saved_kwh: 128.5,
  co2_avoided_kg: 57.8,
  trees_equivalent: 3,
  period: new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(now),
  grid_factor: 0.45,
  formula: "CO2 évité = kWh économisés × 0.45 kg CO2/kWh",
};

export const demoEcoMode = {
  eco_mode: true,
  status: "success",
  message: "Mode Éco activé",
  peak_hours: "18h - 20h",
};

export const demoStats = {
  device_id: "SALLE1",
  period_hours: 24,
  avg_power_w: 3180,
  max_power_w: 6120,
  total_energy_kwh: 41.7,
  alert_count: 3,
  occupancy_ratio: 0.42,
};

export const demoReadings = Array.from({ length: 96 }).map((_, i) => {
  const hour = (i / 4) % 24;
  const occupancy = hour >= 8 && hour <= 18 ? 1 : 0;
  const base = occupancy ? 3600 : 780;
  const wave = Math.sin((i / 96) * Math.PI * 2) * 420;
  const spike = i > 52 && i < 60 ? 1350 : 0;
  return {
    id: 9000 + i,
    device_id: "SALLE1",
    timestamp: isoAgo((96 - i) * 15),
    power: Math.round(base + wave + spike),
    energy_kwh: Number((100 + i * 0.18).toFixed(2)),
    fan_current: occupancy ? 0.31 : 0.04,
    temperature: Number((21 + Math.sin(i / 8) * 3.4).toFixed(1)),
    humidity: 52,
    occupancy,
    lux: occupancy ? 420 : 35,
    voltage: 220,
    current: Number(((base + wave) / 220).toFixed(2)),
    created_at: isoAgo((96 - i) * 15),
  };
});

export const demoAlerts = [
  {
    id: 9101,
    device_id: "SALLE1",
    timestamp: isoAgo(24),
    type: "OVERCONSUMPTION_VS_FORECAST",
    severity: "HIGH",
    message: "Surconsommation de 42 % par rapport à la prévision horaire",
    cause: JSON.stringify({
      reason: "La puissance mesurée dépasse la prévision du modèle XGBoost.",
      evidence: { physical_cause: "Climatisation surchargée", power_w: 6120, temperature: 29.4 },
    }),
    confidence: 0.93,
    resolved: false,
    stage: "DETECTED",
    is_demo: false,
    equipment_id: 4,
    created_at: isoAgo(24),
  },
  {
    id: 9102,
    device_id: "SALLE1",
    timestamp: isoAgo(96),
    type: "FAN_NO_OCCUPANCY",
    severity: "MEDIUM",
    message: "Ventilateur allumé dans une salle inoccupée",
    cause: JSON.stringify({
      reason: "Ventilateur allumé sans occupant",
      evidence: { physical_cause: "Ventilateur oublié", power_w: 410, occupancy: 0 },
    }),
    confidence: 0.88,
    resolved: false,
    stage: "ANALYSED",
    is_demo: false,
    equipment_id: 1,
    created_at: isoAgo(96),
  },
  {
    id: 9103,
    device_id: "SALLE1",
    timestamp: isoAgo(180),
    type: "LIGHTING_CANDIDATE",
    severity: "LOW",
    message: "Éclairage actif alors que la salle est inoccupée",
    cause: JSON.stringify({
      reason: "Éclairage oublié",
      evidence: { physical_cause: "Éclairage oublié", lux: 380, occupancy: 0 },
    }),
    confidence: 0.81,
    resolved: false,
    stage: "PROPOSED",
    is_demo: false,
    equipment_id: 2,
    created_at: isoAgo(180),
  },
  {
    id: 9104,
    device_id: "SALLE1",
    timestamp: isoAgo(420),
    type: "ISOLATION_FOREST_ANOMALY",
    severity: "MEDIUM",
    message: "Anomalie de consommation détectée par Isolation Forest",
    cause: JSON.stringify({
      reason: "Profil de consommation atypique",
      evidence: { physical_cause: "Équipement défaillant", power_w: 4870 },
    }),
    confidence: 0.74,
    resolved: true,
    stage: "EXECUTED",
    is_demo: false,
    equipment_id: 1,
    created_at: isoAgo(420),
  },
  {
    id: 9105,
    device_id: "SALLE1",
    timestamp: isoAgo(720),
    type: "HIGH_POWER_NO_OCCUPANCY",
    severity: "HIGH",
    message: "Puissance élevée sans occupation",
    cause: JSON.stringify({
      reason: "Puissance élevée sans occupant",
      evidence: { physical_cause: "Climatisation surchargée", power_w: 5890, occupancy: 0 },
    }),
    confidence: 0.9,
    resolved: true,
    stage: "VERIFIED",
    is_demo: false,
    equipment_id: 4,
    created_at: isoAgo(720),
  },
];

export const demoSolarCurrent = {
  timestamp: isoAgo(0),
  power_kw: 4.218,
  power_w: 4218,
  peak_kw: 6.5,
  is_generating: true,
};

export const demoSolarHistory = Array.from({ length: 49 }).map((_, i) => {
  const d = new Date(now - (48 - i) * 30 * 60_000);
  const hour = d.getHours() + d.getMinutes() / 60;
  const daylight = hour >= 6 && hour <= 18;
  const kw = daylight ? Number((6.5 * Math.sin(((hour - 6) / 12) * Math.PI) * 0.92).toFixed(3)) : 0;
  return { timestamp: d.toISOString(), power_kw: kw, power_w: Math.round(kw * 1000) };
});

/**
 * Advanced PV telemetry used by the dedicated monitoring panels.
 *
 * Values follow the same physical model as the backend simulator
 * (`scripts/simulate_advanced_solar.py`) and are explicitly labelled
 * `data_source: "simulator"` so the UI never presents them as sensor data.
 */
const demoPvRows = Array.from({ length: 96 }).map((_, i) => {
  const d = new Date(now - (95 - i) * 15 * 60_000);
  const hour = d.getHours() + d.getMinutes() / 60;
  const daylight = hour >= 6 && hour <= 18;
  const irradiance = daylight
    ? Math.max(
        0,
        1000 * Math.sin(((hour - 6) / 12) * Math.PI) * (0.94 + 0.04 * Math.sin(hour * 1.7)),
      )
    : 0;
  const ambient = 19 + 9 * Math.sin(((hour - 9) / 24) * 2 * Math.PI);
  const panelTemperature = irradiance > 5 ? ambient + (25 / 800) * irradiance + 14 : ambient;
  const derating = Math.max(0, 1 - 0.004 * (panelTemperature - 25));
  const expected = irradiance * 34 * 0.195 * derating;
  const dustFactor = hour >= 12.5 && hour <= 17 ? 0.72 : 1;
  const dcPower = expected * dustFactor;
  const efficiency = dcPower > 5 ? 96.4 : null;
  const acPower = efficiency !== null ? dcPower * (efficiency / 100) : 0;
  const dcVoltage = irradiance > 5 ? 380 - 60 * Math.exp(-irradiance / 180) : 0;
  const dcCurrent = dcVoltage > 0 ? dcPower / dcVoltage : 0;
  const inverterTemperature = irradiance > 5 ? 28 + 0.005 * dcPower + 3 : ambient;
  return {
    id: 9800 + i,
    device_id: "PV1",
    timestamp: d.toISOString(),
    dc_voltage: Number(dcVoltage.toFixed(2)),
    dc_current: Number(dcCurrent.toFixed(2)),
    dc_power: Number(dcPower.toFixed(1)),
    ac_power: Number(acPower.toFixed(1)),
    irradiance: Number(irradiance.toFixed(1)),
    panel_temperature: Number(panelTemperature.toFixed(1)),
    ambient_temperature: Number(ambient.toFixed(1)),
    expected_power: Number(expected.toFixed(1)),
    actual_power: Number(acPower.toFixed(1)),
    panel_area: 34,
    panel_efficiency: 0.195,
    inverter_efficiency: efficiency,
    inverter_temperature: Number(inverterTemperature.toFixed(1)),
    inverter_status: irradiance > 5 ? "RUNNING" : "STANDBY",
    inverter_dc_input_power: Number(dcPower.toFixed(1)),
    inverter_ac_output_power: Number(acPower.toFixed(1)),
    data_source: "simulator",
  };
});

const demoPvMidday = demoPvRows.reduce((best, row) =>
  row.expected_power > best.expected_power ? row : best,
);

export const demoPvDetailed = {
  device_id: "PV1",
  data_available: true,
  latest: { ...demoPvMidday, timestamp: isoAgo(2) },
  history: demoPvRows,
  expected_power_w: demoPvMidday.expected_power,
  actual_power_w: demoPvMidday.actual_power,
  deviation_w: Number((demoPvMidday.actual_power - demoPvMidday.expected_power).toFixed(1)),
  deviation_percent: Number(
    (
      ((demoPvMidday.actual_power - demoPvMidday.expected_power) /
        demoPvMidday.expected_power) *
      100
    ).toFixed(1),
  ),
  data_source: "simulator",
  last_update: isoAgo(2),
  is_stale: false,
  resolution_minutes: 15,
};

const demoActivePvFaults = [
  {
    id: 9701,
    device_id: "PV1",
    fault_type: "PV_UNDERPERFORMANCE",
    severity: "WARNING",
    status: "ACTIVE",
    message:
      "Performance photovoltaïque anormalement faible — salissure ou ombrage possible.",
    explanation:
      "La puissance réelle est restée sous 80 % de la puissance attendue sur 5 mesures consécutives (ratio moyen 69 %). Une salissure, un ombrage partiel ou une perte de rendement module sont possibles ; aucune cause physique n'est confirmée.",
    recommended_action:
      "Inspecter visuellement les modules (poussière, ombrage, connectique), nettoyer si nécessaire puis comparer à nouveau la production réelle et attendue.",
    confidence: 0.75,
    is_confirmed: false,
    occurrences: 5,
    first_detected_at: isoAgo(95),
    last_detected_at: isoAgo(2),
    resolved_at: null,
  },
  {
    id: 9702,
    device_id: "PV1",
    fault_type: "PV_PANEL_OVERHEAT",
    severity: "WARNING",
    status: "ACTIVE",
    message: "Température du panneau anormalement élevée — inspection recommandée.",
    explanation:
      "Température module supérieure à 70 °C sur 3 mesures consécutives (pic 74,0 °C). Un point chaud localisé ne peut pas être confirmé sans caméra thermique ni mesure de température localisée.",
    recommended_action:
      "Vérifier la ventilation à l'arrière des modules, contrôler les diodes bypass et réaliser un relevé thermique avant de conclure à un point chaud.",
    confidence: 0.65,
    is_confirmed: false,
    occurrences: 3,
    first_detected_at: isoAgo(60),
    last_detected_at: isoAgo(2),
    resolved_at: null,
  },
];

export const demoPvFaults = {
  device_id: "PV1",
  data_available: true,
  health_score: 79,
  health_status: "warning",
  health_label: "Surveillance recommandée",
  active_faults: demoActivePvFaults,
  history: [
    ...demoActivePvFaults,
    {
      id: 9700,
      device_id: "PV1",
      fault_type: "INVERTER_OVERHEAT",
      severity: "WARNING",
      status: "RESOLVED",
      message: "Température de l'onduleur élevée — surveillance requise.",
      explanation:
        "Température onduleur supérieure à 65 °C sur 2 mesures consécutives (pic 68,0 °C).",
      recommended_action:
        "Dégager la ventilation de l'onduleur et vérifier la température du local technique.",
      confidence: 0.6,
      is_confirmed: false,
      occurrences: 2,
      first_detected_at: isoAgo(60 * 24 * 3),
      last_detected_at: isoAgo(60 * 24 * 3 - 15),
      resolved_at: isoAgo(60 * 24 * 3 - 30),
    },
  ],
  critical_count: 0,
  warning_count: 2,
  methodology:
    "Score = 100 − Σ pénalité. Pénalité = 8 points (avertissement) ou 20 points (critique) × facteur de persistance (1 + 0,1 × min(occurrences − 1, 4)), borné à [0, 100]. Statut : ≥ 85 sain, 60–84 surveillance, < 60 critique. Les diagnostics sont des anomalies détectées par règles, pas des défauts physiques confirmés.",
  last_update: isoAgo(2),
  is_stale: false,
};

export const demoInverterStatus = {
  device_id: "PV1",
  data_available: true,
  operating_status: "RUNNING",
  efficiency_percent: 96.4,
  temperature_c: 58.6,
  dc_input_power_w: demoPvMidday.inverter_dc_input_power,
  ac_output_power_w: demoPvMidday.inverter_ac_output_power,
  average_efficiency_percent: 96.2,
  degraded: false,
  efficiency_history: demoPvRows
    .filter((row) => row.inverter_efficiency !== null)
    .map((row) => ({
      timestamp: row.timestamp,
      efficiency_percent: row.inverter_efficiency as number,
    })),
  warnings: [],
  recommendations: [
    "Rendement dans la plage attendue : poursuivre la surveillance périodique.",
  ],
  last_update: isoAgo(2),
  data_availability_message: "Télémétrie onduleur disponible.",
};

export const demoSolarOptimization = {
  solar_used_kwh: 24.1,
  battery_used_kwh: 3.3,
  grid_used_kwh: 14.3,
  unused_solar_kwh: 3.9,
  battery_charge_kwh: 3.6,
  exported_kwh: 0,
  grid_charge_kwh: 0,
  battery_level_percent: 71,
  estimated_daily_savings_dzd: 150.7,
  estimated_savings_percent: 65.7,
  baseline_cost_dzd: 229.35,
  optimized_cost_dzd: 78.65,
  recommendation_text:
    "Le solaire couvre 24,10 kWh et la batterie fournit 3,30 kWh. Le réseau complète 14,30 kWh. La batterie est chargée en priorité par l'excédent solaire de mi-journée ; l'excédent restant (3,90 kWh) n'est pas valorisé car l'export réseau est désactivé. Économie journalière estimée : 150,70 DZD (tarif configuré 5,50 DZD/kWh). Estimation, non une économie vérifiée.",
  optimization_status: "ok",
  strategy: "deficit",
  forecast_used: false,
  battery_simulated: true,
  tariff_dzd_per_kwh: 5.5,
  suggested_charge_hours: [],
  suggested_discharge_hours: [],
  assumptions: [
    "Bilan énergétique agrégé sur 24 h faute de courbe horaire.",
    "Rendement aller-retour batterie : 90 %.",
    "Aucune hypothèse de tarif dynamique Sonelgaz : tarif configuré uniquement.",
    "Batterie simulée : aucun BMS n'est connecté.",
  ],
};

export const demoForecast = {
  status: "ok",
  device_id: "SALLE1",
  generated_at: isoAgo(0),
  predictions: Array.from({ length: 24 }).map((_, i) => {
    const hour = (new Date().getHours() + i) % 24;
    const occupancy = hour >= 8 && hour <= 18;
    const predicted = occupancy ? 3400 + Math.sin((i / 24) * Math.PI) * 900 : 820;
    return {
      hour_offset: i + 1,
      predicted_power: Math.round(predicted),
      predicted_energy_kwh: Number((predicted / 1000).toFixed(3)),
      confidence_lower: Math.round(predicted * 0.85),
      confidence_upper: Math.round(predicted * 1.15),
    };
  }),
};

export const demoSavings = {
  status: "ok",
  device_id: "SALLE1",
  period_from: isoAgo(60 * 24 * 30),
  period_to: isoAgo(0),
  total_saved_kwh: 128.5,
  total_saved_dzd: 706.75,
  count: 5,
  items: [
    { id: 1, alert_id: 9101, device_id: "SALLE1", timestamp: isoAgo(60 * 24 * 2), action_applied: "Climatisation régulée", baseline_kwh: 48, actual_kwh: 36, saved_kwh: 12, saved_percent: 25, confidence: 0.9 },
    { id: 2, alert_id: 9102, device_id: "SALLE1", timestamp: isoAgo(60 * 24 * 5), action_applied: "Ventilateur éteint", baseline_kwh: 22, actual_kwh: 9, saved_kwh: 13, saved_percent: 59.1, confidence: 0.88 },
    { id: 3, alert_id: 9103, device_id: "SALLE1", timestamp: isoAgo(60 * 24 * 8), action_applied: "Éclairage coupé", baseline_kwh: 18, actual_kwh: 6, saved_kwh: 12, saved_percent: 66.7, confidence: 0.82 },
    { id: 4, alert_id: 9104, device_id: "SALLE1", timestamp: isoAgo(60 * 24 * 12), action_applied: "Maintenance préventive", baseline_kwh: 64, actual_kwh: 47, saved_kwh: 17, saved_percent: 26.6, confidence: 0.76 },
    { id: 5, alert_id: 9105, device_id: "SALLE1", timestamp: isoAgo(60 * 24 * 18), action_applied: "Consigne optimisée", baseline_kwh: 58, actual_kwh: 39, saved_kwh: 19, saved_percent: 32.8, confidence: 0.9 },
  ],
};

export const demoModels = {
  models: {
    forecaster: {
      name: "forecaster_v1",
      loaded: true,
      path: "models/forecaster.pkl",
      metrics: { mae: 2289, rmse: 3428, r2: 0.937, n_samples: 99791 },
    },
    detector: {
      name: "detector_v1",
      loaded: true,
      path: "models/detector.pkl",
      metrics: { anomaly_rate: 0.05, contamination: 0.05 },
    },
  },
  last_training_run: {
    id: 1,
    model_name: "forecaster_v1",
    trained_at: isoAgo(60 * 24 * 3),
    mae: 2289,
    rmse: 3428,
    r2: 0.937,
    n_samples: 99791,
    notes: "Jeu de démonstration WATTWISE DZ",
  },
};

/** Small mutable eco-mode state so the toggle feels real in demo mode. */
let demoEcoState = demoEcoMode.eco_mode;

export function isDemoEcoEnabled() {
  return demoEcoState;
}

export function toggleDemoEco(enabled?: boolean) {
  demoEcoState = enabled === undefined ? !demoEcoState : enabled;
  return {
    ...demoEcoMode,
    eco_mode: demoEcoState,
    message: demoEcoState ? "Mode Éco activé" : "Mode Éco désactivé",
  };
}

export function demoExplanation(alertId: number) {
  const alert = demoAlerts.find((item) => item.id === alertId) ?? demoAlerts[0];
  let cause: Record<string, unknown> = {};
  try {
    cause = JSON.parse(alert.cause);
  } catch {
    cause = {};
  }
  return {
    reason: String(cause.reason ?? alert.message),
    evidence: (cause.evidence as Record<string, unknown>) ?? {},
    recommended_action:
      "Réguler la climatisation et vérifier l'occupation réelle de la salle avant la prochaine pointe.",
    estimated_savings_kwh_per_day: 4.6,
  };
}

export function demoSavingsCreate(payload: {
  alert_id: number;
  device_id: string;
  action_applied: string;
  baseline_kwh: number;
  actual_kwh: number;
}) {
  const saved = Math.max(0, payload.baseline_kwh - payload.actual_kwh);
  return {
    id: Date.now(),
    alert_id: payload.alert_id,
    device_id: payload.device_id,
    timestamp: new Date().toISOString(),
    action_applied: payload.action_applied,
    baseline_kwh: payload.baseline_kwh,
    actual_kwh: payload.actual_kwh,
    saved_kwh: saved,
    saved_percent: payload.baseline_kwh > 0 ? Number(((saved / payload.baseline_kwh) * 100).toFixed(1)) : 0,
    confidence: 0.9,
  };
}

export const demoScore = {
  score: 85,
  grade: "B",
  trend: "+2",
};

export const demoTopConsumers = {
  consumers: [
    { name: "Climatisation Aile A", power_kw: 4.5, pct: 100 },
    { name: "Serveurs Informatique", power_kw: 3.2, pct: 71 },
    { name: "Éclairage Étage 2", power_kw: 2.8, pct: 62 },
    { name: "Chauffe-eau", power_kw: 1.9, pct: 42 },
    { name: "Ventilation Parking", power_kw: 1.1, pct: 24 },
  ],
};

export const demoBenchmark = {
  your_consumption: 120,
  neighborhood_avg: 150,
  percentage: -20,
};

export const demoVacationMode = {
  vacation_mode: false,
  message: "Mode Vacances désactivé : fonctionnement normal rétabli.",
};

/** Mutable vacation-mode state for demo mode. */
let demoVacationState = demoVacationMode.vacation_mode;

export function isDemoVacationEnabled() {
  return demoVacationState;
}

export function toggleDemoVacationMode(enabled?: boolean) {
  demoVacationState = enabled === undefined ? !demoVacationState : enabled;
  return {
    ...demoVacationMode,
    vacation_mode: demoVacationState,
    message: demoVacationState
      ? "Mode Vacances activé : chauffage coupé, appareils non-essentiels éteints."
      : "Mode Vacances désactivé : fonctionnement normal rétabli.",
  };
}

/** Offline WATTY used by demo mode. */
export function demoChatReply(message: string): { reply: string; action: any | null } {
  const low = message.toLowerCase();

  if (low.includes("solaire") || low.includes("photovolta") || low.includes("production")) {
    return {
      reply:
        "Aujourd'hui, la production solaire estimée est de 28,4 kWh pour une puissance instantanée de 4,22 kW. L'autoconsommation couvre environ 68 % de la consommation du bâtiment. Ces valeurs proviennent du jeu de démonstration (simulateur), pas de capteurs physiques.",
      action: { type: "SHOW_SOLAR", label: "Voir la Production Solaire" },
    };
  }

  if (low.includes("onduleur")) {
    return {
      reply:
        "L'onduleur de démonstration affiche un rendement DC→AC de 96,4 % à 58,6 °C, au-dessus du seuil de 90 %. Aucune dégradation n'est détectée. Ces valeurs sont simulées : la télémétrie réelle de l'onduleur n'est pas encore connectée.",
      action: { type: "SHOW_SOLAR", label: "Voir l'Onduleur" },
    };
  }

  if (
    low.includes("batterie") ||
    low.includes("optimisation") ||
    low.includes("source d'énergie") ||
    low.includes("répartition")
  ) {
    return {
      reply:
        "Répartition estimée de démonstration : 24,1 kWh solaire, 3,3 kWh batterie et 14,3 kWh réseau, avec 3,9 kWh de surplus non valorisé (export désactivé). Économie estimée : 150,70 DZD/jour, soit 65,7 % par rapport au scénario 100 % réseau. La batterie est simulée (aucun BMS connecté) et ces économies ne sont pas vérifiées par facturation.",
      action: { type: "SHOW_SOLAR", label: "Voir l'Optimisation" },
    };
  }

  if (
    low.includes("défaut") ||
    low.includes("panne") ||
    low.includes("salissure") ||
    low.includes("ombrage") ||
    low.includes("santé du champ") ||
    low.includes("anomalie pv")
  ) {
    return {
      reply:
        "Le champ photovoltaïque de démonstration présente deux anomalies non confirmées : une sous-performance (≈ 69 % du rendement attendu sur 5 mesures) et une température module élevée (pic 74 °C). Ce sont des détections par règles, pas des défauts physiques confirmés. Une inspection visuelle et un relevé thermique sont recommandés. Aucune donnée capteur réelle n'est disponible en mode démo.",
      action: { type: "SHOW_SOLAR", label: "Voir le Diagnostic PV" },
    };
  }

  if (low.includes("carbone") || low.includes("co2") || low.includes("bilan")) {
    return {
      reply:
        "Votre bilan carbone du mois affiche 57,8 kg de CO₂ évités, soit l'équivalent de 3 arbres plantés. Le facteur utilisé est celui du mix algérien : 0,45 kg CO₂/kWh.",
      action: { type: "SHOW_CARBON_REPORT", label: "Voir le Bilan Carbone" },
    };
  }

  if (low.includes("éco") || low.includes("eco")) {
    return {
      reply:
        "Le Mode Éco réduit automatiquement la consommation pendant les heures de pointe (18h-20h). Je peux l'activer pour vous.",
      action: { type: "TOGGLE_ECO_MODE", label: "Basculer le Mode Éco" },
    };
  }

  if (low.includes("vacance") || low.includes("je pars") || low.includes("partir")) {
    return {
      reply:
        "J'active le mode vacances : je vais couper le chauffage et éteindre les appareils non-essentiels. Confirmez-vous ?",
      action: { type: "TOGGLE_VACATION_MODE", label: "Activer le Mode Vacances" },
    };
  }

  if (low.includes("simulateur") || low.includes("roi") || low.includes("investissement")) {
    return {
      reply:
        "Le simulateur ROI chiffre vos scénarios (isolation, LED, climatisation). Avec les leviers par défaut, l'investissement est de 680 000 DA pour environ 43 500 DA d'économies annuelles — le temps de retour est recalculé en direct selon vos réglages.",
      action: { type: "OPEN_SIMULATOR", label: "Ouvrir le Simulateur" },
    };
  }

  if (low.includes("score") || low.includes("note") || low.includes("grade") || low.includes("diagnostic")) {
    return {
      reply:
        "Votre Wattwise Score est de 85/100 (grade B). Vous êtes dans les standards d'efficacité, mais quelques ajustements (climatisation, éclairage) pourraient vous faire monter en grade A.",
      action: { type: "SHOW_SCORE", label: "Voir le Score Énergétique" },
    };
  }

  if (low.includes("top") || low.includes("consommateur") || low.includes("gaspilleur") || low.includes("wall of shame")) {
    return {
      reply:
        "Le poste le plus énergivore est la Climatisation Aile A avec 4,5 kW, suivie des Serveurs Informatique (3,2 kW) et de l'Éclairage Étage 2 (2,8 kW).",
      action: { type: "SHOW_TOP_CONSUMERS", label: "Voir les Top Consommateurs" },
    };
  }

  if (low.includes("voisin") || low.includes("benchmark") || low.includes("comparaison")) {
    return {
      reply:
        "Vous consommez 20 % de MOINS que la moyenne du voisinage. Bravo ! Votre bâtiment est plus efficient que la plupart des environs.",
      action: { type: "SHOW_BENCHMARK", label: "Voir le Benchmark" },
    };
  }

  if (low.includes("rapport") || low.includes("hebdomadaire") || low.includes("pdf") || low.includes("semaine")) {
    return {
      reply:
        "Je peux générer le Rapport Hebdomadaire PDF avec la consommation, les économies, le CO2 évité et les alertes résolues de la semaine. Voulez-vous l'ouvrir ?",
      action: { type: "OPEN_WEEKLY_REPORT", label: "Voir le Rapport Hebdomadaire" },
    };
  }

  if (low.includes("alerte") || low.includes("pourquoi")) {
    return {
      reply:
        "Vous avez 3 alertes actives. La principale est une surconsommation de 42 % liée à une climatisation surchargée. Je vous recommande de réguler la consigne et de vérifier l'occupation de la salle.",
      action: { type: "RESOLVE_ALERTS", label: "Résoudre les alertes" },
    };
  }

  return {
    reply:
      "Je suis WATTY, votre assistant énergie. Je peux analyser vos alertes FDD, afficher le bilan carbone, activer le Mode Éco ou le Mode Vacances, suivre le solaire, consulter votre Wattwise Score, les Top Consommateurs, le benchmark voisinage ou générer un Rapport Hebdomadaire PDF.",
    action: null,
  };
}

// ---------------------------------------------------------------------------
// V3 — Building hierarchy, workflow, Energy Brain, investigation, jury demo
// ---------------------------------------------------------------------------

const isoIn = (seconds: number) => new Date(now + seconds * 1000).toISOString();

export const demoBuildings = {
  status: "ok",
  buildings: [
    {
      id: 1,
      name: "ESI-SBA",
      address: "Route de Ain El Hadjar",
      city: "Sidi Bel Abbès",
      country: "Algérie",
      description:
        "École Supérieure en Informatique de Sidi Bel Abbès — campus pilote du projet WATTWISE DZ.",
      created_at: isoAgo(60 * 24 * 30),
    },
  ],
};

export const demoBuildingTree = {
  ...demoBuildings.buildings[0],
  floors: [
    {
      id: 1,
      building_id: 1,
      name: "Rez-de-chaussée",
      level: 0,
      zones: [
        {
          id: 1,
          floor_id: 1,
          name: "Salle 101",
          device_id: "SALLE1",
          plan_x: 0,
          plan_y: 0,
          plan_w: 2,
          plan_h: 1,
          equipment: [
            { id: 1, zone_id: 1, name: "Climatiseur S101", type: "AC", nominal_power_kw: 2.5, current_power_kw: 1.4, status: "online", health_score: 92, icon: "AirVent", created_at: isoAgo(600) },
            { id: 2, zone_id: 1, name: "Éclairage S101", type: "Light", nominal_power_kw: 0.4, current_power_kw: 0.3, status: "online", health_score: 98, icon: "Lightbulb", created_at: isoAgo(600) },
            { id: 3, zone_id: 1, name: "Ordinateurs S101", type: "Computer", nominal_power_kw: 0.6, current_power_kw: 0.5, status: "online", health_score: 95, icon: "Monitor", created_at: isoAgo(600) },
          ],
        },
        {
          id: 2,
          floor_id: 1,
          name: "Salle 102",
          device_id: "SALLE2",
          plan_x: 2,
          plan_y: 0,
          plan_w: 2,
          plan_h: 1,
          equipment: [
            { id: 4, zone_id: 2, name: "Climatiseur S102", type: "AC", nominal_power_kw: 2.5, current_power_kw: 5.0, status: "alert", health_score: 25, icon: "AirVent", created_at: isoAgo(600) },
            { id: 5, zone_id: 2, name: "Éclairage S102", type: "Light", nominal_power_kw: 0.4, current_power_kw: 0.2, status: "online", health_score: 97, icon: "Lightbulb", created_at: isoAgo(600) },
          ],
        },
      ],
    },
    {
      id: 2,
      building_id: 1,
      name: "1er Étage",
      level: 1,
      zones: [
        {
          id: 3,
          floor_id: 2,
          name: "Bureau Admin",
          device_id: "BUREAU1",
          plan_x: 0,
          plan_y: 1,
          plan_w: 4,
          plan_h: 1,
          equipment: [
            { id: 6, zone_id: 3, name: "Climatiseur Bureau", type: "AC", nominal_power_kw: 1.8, current_power_kw: 0.9, status: "online", health_score: 90, icon: "AirVent", created_at: isoAgo(600) },
            { id: 7, zone_id: 3, name: "PC Direction", type: "Computer", nominal_power_kw: 0.35, current_power_kw: 0.28, status: "warning", health_score: 55, icon: "Monitor", created_at: isoAgo(600) },
          ],
        },
      ],
    },
  ],
};

/** Mutable demo equipment state so the simulate/trigger/reset flows work. */
let demoEquipmentState: import("@/lib/api").Equipment[] | null = null;
function demoEquipment(): import("@/lib/api").Equipment[] {
  if (!demoEquipmentState) {
    demoEquipmentState = JSON.parse(JSON.stringify(
      demoBuildingTree.floors.flatMap((f) => f.zones.flatMap((z) => z.equipment)),
    ));
  }
  return demoEquipmentState!;
}

export function demoSimulateEquipment() {
  const equipment = demoEquipment();
  const statuses = ["online", "online", "online", "warning", "online", "alert", "offline"] as const;
  const ranges: Record<string, [number, number]> = {
    online: [80, 100],
    warning: [55, 79],
    alert: [15, 54],
    offline: [0, 20],
  };
  for (const eq of equipment) {
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    const [low, high] = ranges[status];
    eq.status = status;
    eq.health_score = Math.round(low + Math.random() * (high - low));
    eq.current_power_kw = status === "offline" ? 0 : Number((eq.nominal_power_kw * (0.3 + Math.random())).toFixed(2));
  }
  return { status: "ok", updated: equipment.length, equipment };
}

export const demoWorkflow = {
  stages: [
    { stage: "DETECTED", label: "Détecté", count: 1 },
    { stage: "ANALYSED", label: "Analysé", count: 1 },
    { stage: "PROPOSED", label: "Proposé", count: 1 },
    { stage: "APPROVED", label: "Approuvé", count: 0 },
    { stage: "EXECUTED", label: "Exécuté", count: 1 },
    { stage: "VERIFIED", label: "Vérifié", count: 1 },
  ],
  total_active: 5,
};

export function demoCreateAction(data: { equipment_id: number; message?: string; severity?: string }) {
  const eq = demoEquipment().find((item) => item.id === data.equipment_id);
  const alert = {
    id: 9500 + Math.floor(Math.random() * 500),
    device_id: "SALLE1",
    timestamp: new Date().toISOString(),
    type: "EQUIPMENT_MALFUNCTION",
    severity: data.severity ?? "HIGH",
    message: data.message ?? `${eq?.name ?? "Équipement"} : intervention requise (données simulées).`,
    cause: "",
    confidence: 0.85,
    resolved: false,
    stage: "DETECTED",
    is_demo: false,
    equipment_id: data.equipment_id,
    created_at: new Date().toISOString(),
  };
  demoAlerts.unshift(alert);
  return alert;
}

export function demoTransition(alertId: number, stage: string) {
  const labels: Record<string, string> = {
    ANALYSED: "Analysé",
    PROPOSED: "Proposé",
    APPROVED: "Approuvé",
    EXECUTED: "Exécuté",
    VERIFIED: "Vérifié",
  };
  const alert = demoAlerts.find((item) => item.id === alertId);
  if (alert) {
    alert.stage = stage;
    if (stage === "EXECUTED" && alert.equipment_id) {
      const eq = demoEquipment().find((item) => item.id === alert.equipment_id);
      if (eq) {
        eq.status = "online";
        eq.health_score = Math.max(eq.health_score, 80);
        eq.current_power_kw = eq.nominal_power_kw;
      }
    }
  }
  return {
    status: "ok",
    alert_id: alertId,
    stage,
    stage_label: labels[stage] ?? stage,
    message: `Étape « ${labels[stage] ?? stage} » appliquée (données simulées).`,
    saved_kwh: stage === "VERIFIED" ? 60 : null,
    saved_dzd: stage === "VERIFIED" ? 330 : null,
  };
}

export function demoInvestigation(alertId: number) {
  return {
    status: "ok",
    alert_id: alertId,
    hypotheses: [
      {
        cause: "Compresseur en fin de vie entraînant une surconsommation électrique (données simulées).",
        confidence: 85,
        evidence: ["Puissance actuelle 5.0 kW vs nominale 2.5 kW", "Score de santé 25/100"],
        missing_data: ["Pression du réfrigérant", "Historique de maintenance"],
        recommended_action: "Planifier une maintenance corrective du compresseur.",
      },
      {
        cause: "Thermostat mal réglé : consigne trop basse provoquant un fonctionnement prolongé.",
        confidence: 62,
        evidence: ["Fonctionnement continu détecté", "Occupation faible de la salle"],
        missing_data: ["Consigne de température réelle"],
        recommended_action: "Relever la consigne à 24 °C et vérifier l'horaire de fonctionnement.",
      },
      {
        cause: "Dérive du capteur de mesure (valeur isolée incohérente avec l'historique).",
        confidence: 28,
        evidence: ["Écart important avec la moyenne 24h"],
        missing_data: ["Seconde mesure de contrôle"],
        recommended_action: "Recouper avec une seconde lecture avant d'agir sur le matériel.",
      },
    ],
    summary:
      "Hypothèse principale (85 %) : compresseur en fin de vie entraînant une surconsommation. Action recommandée : planifier une maintenance corrective.",
    source: "rules",
    generated_at: new Date().toISOString(),
  };
}

export const demoInsights = {
  status: "ok",
  generated_at: new Date().toISOString(),
  insights: [
    {
      rule_id: "USELESS_AC",
      title: "Climatisation inutile",
      description: "Le Climatiseur S102 fonctionne (5.0 kW) alors que la salle est inoccupée.",
      severity: "warning",
      confidence: 90,
      category: "confort",
      recommended_action: "Éteindre ou régler le Climatiseur S102 dans le Centre d'Actions.",
      zone_id: 2,
      equipment_id: 4,
      data: {},
    },
    {
      rule_id: "SOLAR_SURPLUS",
      title: "Autoconsommation optimale",
      description: "La production solaire (4.2 kW) dépasse la consommation du bâtiment (2.4 kW) : tout l'usage courant est couvert par le solaire.",
      severity: "info",
      confidence: 85,
      category: "solaire",
      recommended_action: "Profiter du surplus pour charger la batterie (simulée).",
      zone_id: null,
      equipment_id: null,
      data: {},
    },
  ],
  briefing:
    "Climatisation inutile — Le Climatiseur S102 fonctionne (5.0 kW) alors que la salle est inoccupée. Action recommandée : Éteindre ou régler le Climatiseur S102 dans le Centre d'Actions.",
  critical_count: 0,
  warning_count: 1,
};

let demoJuryActive = false;

export function demoTriggerDemo() {
  demoJuryActive = true;
  const eq = demoEquipment().find((item) => item.name === "Climatiseur S102");
  if (eq) {
    eq.current_power_kw = 5.0;
    eq.health_score = 25;
    eq.status = "alert";
  }
  const alert = {
    id: 9901,
    device_id: "SALLE2",
    timestamp: new Date().toISOString(),
    type: "EQUIPMENT_MALFUNCTION",
    severity: "CRITICAL",
    message: "[DÉMO] Climatiseur S102 consomme 5.0 kW pour une puissance nominale de 2.5 kW — surconsommation critique détectée.",
    cause: "",
    confidence: 0.98,
    resolved: false,
    stage: "DETECTED",
    is_demo: true,
    equipment_id: eq?.id ?? 4,
    created_at: new Date().toISOString(),
  };
  demoAlerts.unshift(alert);
  return {
    status: "ok",
    message: "Anomalie injectée : Climatiseur S102 en surconsommation. Une action critique a été créée dans le Centre d'Actions.",
    alert_id: alert.id,
    equipment: eq ?? null,
  };
}

export function demoResetDemo() {
  demoJuryActive = false;
  let resolved = 0;
  for (const alert of demoAlerts) {
    if (alert.is_demo && !alert.resolved) {
      alert.resolved = true;
      resolved += 1;
    }
  }
  const eq = demoEquipment().find((item) => item.name === "Climatiseur S102");
  if (eq) {
    eq.status = "online";
    eq.health_score = 95;
    eq.current_power_kw = eq.nominal_power_kw;
  }
  return {
    status: "ok",
    message: "Mode démo réinitialisé : équipement restauré et alertes de démo résolues.",
    resolved_alerts: resolved,
    reset_equipment: eq ? 1 : 0,
  };
}

export function demoDemoStatus() {
  const activeDemo = demoAlerts.filter((alert) => alert.is_demo && !alert.resolved);
  const eq = demoEquipment().find((item) => item.name === "Climatiseur S102");
  return {
    active: activeDemo.length > 0 || demoJuryActive,
    alert_ids: activeDemo.map((alert) => alert.id),
    equipment_id: eq?.id ?? null,
  };
}
