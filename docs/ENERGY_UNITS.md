# Energy units and data integrity (WATTWISE DZ)

## Backend field → unit → frontend usage

| Model field | Unit | Frontend usage |
|---|---|---|
| `Reading.power` | W | `/stats/summary` → `avg_power_w`, `max_power_w` (W) |
| `Reading.energy_kwh` | kWh (cumulative meter) | `total_energy_kwh` = max − min |
| `Reading.voltage` | V | electrical monitoring |
| `Reading.current` | A | electrical monitoring |
| `Equipment.nominal_power_kw` | kW | equipment cards |
| `Equipment.current_power_kw` | kW | building side panel (×1000 → W for formatPower) |
| `SolarProduction.power_kw` | kW | solar page |
| `PVReading.dc_power` / `ac_power` | W | solar detailed |
| `PVReading.irradiance` | W/m² | solar detailed |
| `PVReading.panel_temperature` / `ambient_temperature` | °C | solar detailed |
| Forecast `predicted_power` | W (mean of 15-min bins) | ForecastChart (formatPower, W) |
| Forecast `predicted_energy_kwh` | kWh (sum power_W × 0.25h / 1000) | forecast energy |

## Conventions
- `formatPower(w)` expects **watts** and renders W or kW.
- kW values must be multiplied by 1000 before `formatPower`.
- kWh values use `formatEnergy` / `formatEnergyAuto`.
- Energy over an interval = power × duration (kWh = kW × h), or meter delta (max − min) for cumulative meters.
- Missing/unavailable values render as "—" (never 0).
- Data freshness: FRESH / STALE / OFFLINE / SIMULATED / UNAVAILABLE.