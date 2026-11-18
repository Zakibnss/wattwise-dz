# WATTWISE DZ — Application Report

**Platform:** energy-waste detection and energy intelligence for Algerian buildings
**Stack:** FastAPI · PostgreSQL · Eclipse Mosquitto (MQTT) · React 18 + TypeScript · Recharts · TailwindCSS · Docker Compose
**Context:** SEM'INNOV Challenge deliverable
**Report date:** 14 November 2026

---

## 1. What the application does

WATTWISE DZ turns raw electrical telemetry from building sensors into three things a facility
manager can act on:

1. **Detection** — rule-based and machine-learning detection of wasted energy (a fan running in an
   empty room, lighting left on, consumption far above the forecast).
2. **Explanation** — every alert carries a physical cause, the sensor evidence behind it, a
   recommended corrective action and an estimated daily saving, in French.
3. **Quantification** — the same detections are converted into kWh, dinars (5.5 DZD/kWh, Sonelgaz
   residential average) and CO₂ avoided, with a savings ledger and a carbon report.

Around that core sit a 24-hour consumption forecaster (XGBoost), a photovoltaic monitoring and
diagnostic layer (inverter, irradiance, expected vs actual production), a deterministic
solar/battery/grid optimizer, an ROI "what-if" simulator, and WATTY — a conversational agent that
answers questions about the building.

---

## 2. Architecture

```
 sensor (ESP32 / simulator)
        │  JSON over MQTT  wattwise/SALLE1/data
        ▼
 ┌──────────────────┐
 │ Mosquitto :1883  │  (websockets :9001, anonymous — dev only)
 └────────┬─────────┘
          │ subscribe wattwise/+/data  ·  wattwise/+/solar
          ▼
 ┌────────────────────────────────────────────────────────────┐
 │ FastAPI backend (uvicorn, :8000)                           │
 │                                                            │
 │  mqtt_client.py ── paho thread ──► asyncio bridge          │
 │        │                                                   │
 │        ├─ Pydantic validation                              │
 │        ├─ INSERT readings                                  │
 │        ├─ Layer 1 rules   detect_waste()                   │
 │        ├─ Layer 2 anomaly IsolationForest                  │
 │        └─ Layer 3 residual vs XGBoost forecast            │
 │        │                                                   │
 │        └─ alerts (cause = explanation JSON)                │
 │                                                            │
 │  REST API /api/*      Alembic migrations      tests/       │
 └────────┬───────────────────────────────────────────────────┘
          │ SQLAlchemy 2.x async + asyncpg
          ▼
 ┌──────────────────┐          ┌────────────────────────────┐
 │ PostgreSQL 15    │          │ React SPA (nginx :3002)    │
 │ readings         │◄─────────┤ Vite dev server :5173      │
 │ alerts           │  /api    │ TanStack Query · Recharts  │
 │ savings          │  proxy   │ Tailwind design system     │
 │ model_runs       │          └────────────────────────────┘
 │ pv_readings      │
 │ pv_faults        │
 │ solar_production │
 │ system_settings  │
 └──────────────────┘
```

### Message flow

`sensor → Mosquitto → MQTTIngestor → Pydantic → readings INSERT → detect_waste() → alerts INSERT → REST → UI`

The MQTT callback runs in paho's network thread; each message is scheduled onto the FastAPI event
loop with `asyncio.run_coroutine_threadsafe`, so all database work stays async and loop-bound.
Startup is resilient: the broker is contacted with `connect_async()` + `loop_start()`, so a broker
that is not ready yet only degrades `/api/health`, it never prevents the API from serving.

---

## 3. Repository map

| Path | Contents |
|---|---|
| `backend/app/main.py` | FastAPI app, CORS, startup schema creation, router wiring |
| `backend/app/mqtt_client.py` | MQTT ingestor, payload validation, hybrid detection trigger |
| `backend/app/ai/` | `forecaster.py`, `detector.py`, `explainer.py`, `pv_detector.py`, `energy_optimizer.py`, `agent.py`, training CLIs |
| `backend/app/routes/` | `health.py`, `readings.py` (readings/alerts/stats/savings), `ai.py`, `solar.py` |
| `backend/alembic/versions/` | `0001_initial_schema`, `0002_ai_tables`, `0003_pv_monitoring` |
| `backend/tests/` | 76 tests (Phase 1 → Phase 4), pytest + pytest-asyncio |
| `frontend/src/pages/` | Dashboard, Alerts, Forecast, Solar, Simulator, CarbonReport, Savings, Settings, WeeklyReport |
| `frontend/src/components/` | UI primitives, charts, solar panels, widgets, layout |
| `frontend/src/lib/` | `api.ts` (typed client + demo fixtures), `format.ts`, `chartTheme.ts`, `constants.ts` |
| `simulator/simulator.py` | Host-side sensor simulator (10 s cadence, fault injection) |
| `scripts/simulate_advanced_solar.py` | Backend-side PV telemetry generator (scenario modes) |
| `docker-compose.yml` | postgres, mosquitto, backend, frontend |
| `mosquitto/mosquitto.conf` | anonymous dev broker + websockets |

---

## 4. Data model

| Table | Purpose | Key columns |
|---|---|---|
| `readings` | One row per sensor sample | `device_id`, `timestamp`, `power`, `energy_kwh`, `fan_current`, `temperature`, `humidity`, `lux`, `occupancy` |
| `alerts` | Detected anomalies | `type`, `severity`, `message`, `cause` (JSON explanation), `confidence`, `resolved` |
| `savings` | Verified actions | `alert_id`, `baseline_kwh`, `actual_kwh`, `saved_kwh`, `saved_percent` |
| `model_runs` | Training audit trail | `model_name`, `trained_at`, `mae`, `rmse`, `r2`, `n_samples` |
| `pv_readings` | Advanced PV telemetry | DC/AC power, voltage/current, irradiance, panel/inverter temperatures, `expected_power`, `data_source` |
| `pv_faults` | Persistent PV diagnostics | `fault_type`, `severity`, `status`, `occurrences`, `is_confirmed` (always false), timestamps |
| `solar_production` | Simple PV series | `timestamp`, `power_kw` |
| `system_settings` | Runtime switches | `eco_mode`, `vacation_mode` |

---

## 5. API surface

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Service + database + MQTT status (always HTTP 200) |
| GET | `/api/readings/latest` | Newest samples, `limit` 1–1000, `device_id` filter |
| GET | `/api/readings/range` | Time-window query, 400 when `from >= to` |
| GET | `/api/alerts/active` | Unresolved alerts, newest first |
| GET | `/api/alerts` | Alerts with `resolved` filter |
| POST | `/api/alerts/{id}/resolve` | Mark one alert resolved (404 if missing) |
| POST | `/api/alerts/resolve-all` | Bulk resolve for a device |
| GET | `/api/alerts/{id}/explanation` | French reason / evidence / action / savings |
| GET | `/api/stats/summary` | Power, energy, alert count, occupancy ratio |
| GET | `/api/stats/score` | Wattwise Score (0–100) + grade A–F + trend |
| GET | `/api/stats/top-consumers` | Top 5 consuming zones |
| GET | `/api/stats/benchmark` | Consumption vs neighbourhood average |
| POST | `/api/savings` | Record a verified saving |
| GET | `/api/savings/summary` | Ledger + DZD conversion |
| GET | `/api/reports/carbon` | kg CO₂ avoided, tree equivalent |
| GET | `/api/forecast/next24h` | 24 hourly predictions ±1.5 × MAE (503 if untrained) |
| GET | `/api/models` | Forecaster/detector availability + metrics |
| GET | `/api/solar/current` · `/history` | Simple PV series |
| GET | `/api/solar/detailed` | Latest PV sample, resampled history, deviation |
| GET | `/api/solar/faults` | Rule diagnostics + health score |
| GET | `/api/solar/inverter-status` | DC→AC efficiency, temperature, warnings |
| GET | `/api/solar/optimization` | Solar/battery/grid split + estimated savings |
| GET/POST | `/api/system/eco-mode` | Demand-response switch |
| GET/POST | `/api/system/vacation-mode` | Autonomous away mode |
| POST | `/api/chat` | WATTY agent (Groq) with building context |

OpenAPI UI: `http://localhost:8000/docs`.

---

## 6. The AI layer, honestly described

- **Forecaster** — `XGBRegressor` on 15-minute engineered features (lags, rolling means, weather,
  occupancy). Documented results on the real Building 59 dataset: MAE 2 289 W (4.29 % of average
  power), RMSE 3 428 W, R² 0.937 over 99 791 usable rows. Models are trained **only** through an
  explicit CLI (`python -m app.ai.train_forecaster`), never at startup; when the artifact is
  missing the API degrades to 503 and the UI shows a friendly "modèle non entraîné" state.
- **Detector** — three layers: the deterministic Phase 1 rules, an isolation forest on
  `(power, fan_current, temperature, occupancy)`, and a positive residual against the forecast
  (observed > max(50 W, 30 % × predicted)).
- **Explainer** — six deterministic French templates; the JSON is stored in `alerts.cause` at
  detection time.
- **PV diagnostics** — seven correlation-based rules (underperformance, production drop, panel and
  inverter overheat, inverter degradation, sensor inconsistency, stale data). No row is ever marked
  `is_confirmed = true`: an inspection remains the only way to confirm a physical fault.
- **Optimizer** — deterministic solar/battery/grid split with a simulated battery; feed-in is
  disabled because no verified Algerian export tariff exists.

**What is simulated:** the battery state of charge, the PV telemetry when generated by
`simulate_advanced_solar`, and (in Demo Mode) the entire UI dataset. Every simulated row is labelled
`data_source = "simulator"` and surfaces in the interface as **Données simulées**.

---

## 7. The design system — "Live Grid"

The previous interface used a default shadcn palette (emerald on slate) in which translucent
utilities silently rendered transparent: the colour tokens had no `<alpha-value>` placeholder, so
`bg-primary/10`, `border-emerald-500/30` and every soft tint fell back to nothing. That is why the
UI read as flat and grey rather than as an energy product.

### 7.1 Palette

| Token | Light | Dark | Role |
|---|---|---|---|
| `--background` | `210 40% 98%` | `220 45% 7%` | Ambient canvas |
| `--card` | `0 0% 100%` | `219 38% 10.5%` | Instrument panel |
| `--foreground` | `216 45% 11%` | `205 34% 94%` | Primary text |
| `--muted-foreground` | `215 22% 41%` | `212 18% 65%` | Secondary text |
| `--primary` | `191 92% 30%` | `187 92% 56%` | Electric cyan — brand, CTAs |
| `--volt` | `191 92% 34%` | `187 92% 58%` | Live measurements |
| `--solar` | `30 94% 43%` | `38 96% 60%` | PV production, peak demand |
| `--eco` | `158 76% 30%` | `152 70% 50%` | Savings, healthy state |
| `--copper` | `20 78% 42%` | `22 88% 58%` | Waste, above-benchmark |
| `--destructive` | `354 76% 43%` | `355 82% 61%` | Critical alerts |
| `--warning` | `30 94% 40%` | `36 96% 56%` | Demo mode, degraded state |
| `--sidebar-background` | `218 46% 11%` | `220 48% 5.5%` | Control-room rail |

Semantic choices, not decoration:

- **Cyan = voltage/measurement.** Every live number, chart line and primary action.
- **Amber = solar energy.** Production curves, peak windows, PV diagnostics.
- **Green = money saved / healthy.** Savings ledger, eco mode, resolved anomalies.
- **Copper = waste.** The "top consumers" ranking and above-average consumption.
- **Graphite ink = the machinery.** The navigation rail stays dark in both themes, so the console
  reads as equipment rather than as a document.

### 7.2 Surfaces & motion

- **Ambient canvas** (`app-canvas`): a 48 px engineering grid plus two low-opacity light leaks
  (cyan top-left, amber top-right). The grid is doubled in intensity in dark mode.
- **Instrument panel**: hairline border, `0 10px 30px -22px` elevation, 0.9 rem radius; hover lifts
  the shadow instead of scaling, so tables stay stable.
- **Typography**: Inter for text, **JetBrains Mono with tabular figures** for every measurement, so
  counters never jitter as values change.
- **Micro-details**: a gradient hairline under section titles, live pulse rings on telemetry dots,
  a sheen on hero panels, shimmer skeletons, and `prefers-reduced-motion` respected globally.

### 7.3 Component layer

`Card`, `Button` (default/destructive/outline/secondary/ghost/success/solar), `Badge`
(default/secondary/destructive/outline/success/warning/volt, optional status dot), `Input`,
`Dialog`, `Skeleton` (shimmer variants), `EmptyState` (4 illustrations), and a shared
`lib/chartTheme.ts` that gives every Recharts surface the same axis ticks, grid, tooltip and legend
styling.

Charts are recoloured through CSS variables (`--chart-consumption`, `--chart-solar`,
`--chart-forecast`, `--chart-grid`), so switching theme re-tints every series without a re-render.

---

## 8. Functional changes in this pass

| Area | Change | Why |
|---|---|---|
| Theme | `useTheme` now initialises from storage on first render and writes only on explicit change | The saved choice was overwritten by the default on every mount, so light/dark never persisted |
| Theme | Pre-paint inline script in `index.html` + `color-scheme` on `<html>` | No white flash when a dark user reloads |
| Theme | Three-way segmented control in the header (clair / sombre / système) | One click instead of a dropdown |
| Tokens | All Tailwind colour tokens gained `/<alpha-value>` | Every soft tint in the app was rendering as transparent |
| Navigation | Sidebar grouped into Supervision / Analyse / Actions / Système with a live gateway status | Eight flat links were hard to scan |
| Navigation | Command palette actually works (⌘K / Ctrl+K) with keyboard navigation and actions, not just pages | The old search box was decorative and its shortcut only fired while the input had focus |
| Dashboard | Automatic refresh (10 s readings, 30 s aggregates) and `invalidateQueries` for the refresh button | The button reloaded the whole page; data went stale between visits |
| Dashboard | New **live** power KPI with sparkline and delta in watts vs the previous frame | Percentage deltas off a near-zero baseline produced meaningless +351 % readings |
| Dashboard | New **load profile** panel: peak, base load (10th percentile), average, σ and load factor with an interpretation | Turns a stream of samples into an actionable shape-of-load reading |
| Dashboard | Status card merges device + model, energy values switch to Wh below 0.1 kWh | "0.00 kWh" looked broken; nested cards looked like a rendering bug |
| Alerts | Client-side search over message/type/cause/device, severity filter chips, sort (recent/oldest/severity) | The only filter was an exact device ID; the three severity cards were static |
| Alerts | Compact rows: no-wrap dates, dot badges, stable action buttons | Row heights were jumping between 1 and 2 lines |
| Forecast | Peak insight banner (clock time of the peak, confidence band, what to shift) and clock times in the hourly table | "H+17" is not actionable for a facility manager |
| Simulator | Annual baseline is now an explicit, editable assumption (measured when usable, otherwise a labelled 5 000 kWh hypothesis) | Extrapolating a near-empty 24 h counter gave a **113 333-year** payback; the metric was technically computed and practically useless |
| Simulator | Compact currency formatting, mono figures, honest rentability badge ("Hors horizon 5 ans") | Large amounts overflowed their cards |
| Donut chart | Centre label split into value + unit, `innerRadius` 62 % → 66 %, caption shortened to “total”, `paddingAngle` 0 for a single slice | “0.02 kWh” measured 85 px inside a 79 px hole, so the number printed over the ring stroke; a lone 100 % slice was also split by a 2° padding gap |
| Dialogs | Portalled to `<body>`, height capped at `calc(100dvh - 2rem)` | Inside the blurred header `position: fixed` resolved against the 64 px bar, so “Bilan Carbone” opened off the top of the screen (`top: -303px`) |
| Layout | Header promoted to `relative z-40` | The header's `backdrop-blur` creates a stacking context; with `z-index: auto` its notification popover painted **under** the dashboard cards |
| Build | `manualChunks`: charts / ui / router / react split | Main bundle 1 181 kB → 455 kB (gzip 340 → 130 kB) |

Accessibility kept intact throughout: every icon-only control retains its `aria-label`, progress
bars expose `role="progressbar"`, the palette is keyboard-navigable, focus rings are visible in both
themes, and the reduced-motion media query disables the spin/shimmer/pulse animations.

---

## 9. Running it

```bash
# 1. Stack (Docker Desktop must be running)
cd wattwise-dz
docker compose up -d
docker compose exec backend alembic upgrade head

# 2. Live data
cd simulator && python simulator.py            # or the container variant used here
docker compose exec backend python -m scripts.simulate_advanced_solar \
    --duration-hours 24 --interval-minutes 15 --mode normal

# 3. Frontend
#    production build → http://localhost:3002
#    dev server       → cd frontend && npm run dev   (http://localhost:5173, proxies /api)
```

In this environment PostgreSQL's host port is mapped to **5433** because a native Postgres service
already occupies 5432 (`POSTGRES_PORT=5433 docker compose up -d`).

**Known environment note:** the backend creates its schema with `Base.metadata.create_all` at
startup, so a fresh `alembic upgrade head` reports "relation already exists" and Alembic stays
unstamped. The tables are correct and the API works; stamping the revision
(`alembic stamp head`) is the clean follow-up.

---

## 10. Verification performed

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npm run build` (tsc + Vite) | clean, 12.9 s, chunks split |
| Live stack | postgres / mosquitto / backend / frontend all up; `/api/health` → `{"status":"ok","database":"ok","mqtt":"ok"}` |
| End-to-end data path | simulator → MQTT → `readings` insert → rule alerts generated → API → dashboard |
| API spot-checks | `readings/latest`, `stats/summary`, `stats/score`, `alerts/active`, `solar/*`, `models` all returning data |
| Visual review | Dashboard, Alerts, Solar, Settings, Simulator inspected in **both** light and dark themes |
| Overlay stacking | Notification popover verified above the dashboard via hit-testing (`elementFromPoint` → panel), on both the dev server and the production image |
| Dialog positioning | `DialogContent` now renders through a Radix portal to `<body>` with `max-h-[calc(100dvh-2rem)]`; the Bilan Carbone dialog measured `top 16 / bottom 792` in an 808 px viewport (previously `top -303`), and 68/652 in a 720 px viewport |
| Backend test suite | not run in this pass (documented expectation: 76 passed) |
| Browser interaction sweep | not performed beyond the pages listed above |

---

## 11. Limitations

- **Model artifacts are not versioned.** Without `forecaster.pkl`, `/api/forecast/next24h` returns
  503 and the hybrid layers 2/3 are skipped — by design, but it means a fresh clone is
  rules-only until training runs.
- **Building 59 download is gate-blocked** by an Anubis proof-of-work challenge; the archive must be
  fetched manually in a browser.
- **Battery state of charge is simulated** — no BMS is connected.
- **PV diagnostics are correlation-based.** The UI never presents an anomaly as a confirmed fault.
- **Savings use one flat tariff** (5.5 DZD/kWh); no time-of-use or feed-in tariff is assumed.
- **Anonymous MQTT broker** (`allow_anonymous true`) is dev-only; production needs TLS and auth.
- **No authentication / multi-tenancy**; the API is open on the local network.
- **Demo Mode is a client-side fixture layer** — realistic, but it is not a replay of stored data.

---

## 12. Suggested next steps

1. `alembic stamp head` and move schema creation out of application startup.
2. Persist per-device thresholds and tariff tiers in `system_settings` instead of environment
   variables.
3. Real authentication (OIDC) and per-building row scoping before any multi-site deployment.
4. Replace the flat tariff with Sonelgaz tiers (0–100, 101–200, 201–300, 301+ kWh) — the constants
   already encode them in `lib/constants.ts`.
5. Add a Playwright smoke test around the new palette (theme persistence, command palette, alerts
   filtering) so the regressions fixed here stay fixed.
