# WATTWISE DZ — Energy Intelligence Platform

WATTWISE DZ is an energy waste detection platform for Algerian buildings. Phase 1 builds the data backbone: battery-powered sensors publish telemetry over MQTT, a FastAPI backend validates and stores each sample in PostgreSQL, applies a small rules engine to flag obvious waste, and exposes the collected data through a paginated REST API. Phase 2 adds the AI layer on top of that foundation: real Building 59 data preparation, an XGBoost 24-hour power forecaster (MAE 4.29% of avg power), a hybrid Isolation Forest + residual detector, deterministic French explanations, new REST endpoints, and Alembic migration 0002. Phase 3 adds a React 18 + TypeScript frontend with TanStack Query, Recharts, TailwindCSS, and shadcn/ui components, plus a verified savings layer (POST /api/savings, GET /api/savings/summary) with DZD currency conversion (5.5 DZD/kWh, Sonelgaz residential average). The final pitch-ready pass adds a solar PV view, an FDD diagnostic column, WATTY solar/eco/carbon actions, a full Carbon Report, Demo Mode, skeleton loaders, illustrated empty states, and accessible motion — everything needed for the SEM'INNOV Challenge demo.

The repository ships with a realistic sensor simulator so the entire system can be run and verified on a laptop without hardware. PostgreSQL, the Eclipse Mosquitto broker and the backend run in Docker Compose; the simulator runs either on the host (default) or on the same Docker network. Configuration is entirely environment-driven, migrations are managed with Alembic, and the test-suite runs against a dedicated test database.

---

## Architecture

```
                       +---------------------------+
                       |  simulator/simulator.py   |
                       |  (JSON every 10 seconds)  |
                       +-------------+-------------+
                                     |
                        topic: wattwise/SALLE1/data
                                     |
                                     v
                     +-------------------------------+
                     |     Eclipse Mosquitto :1883   |
                     |   (anonymous, dev only)       |
                     |   websockets :9001            |
                     +---------------+---------------+
                                     |
                        subscribe: wattwise/+/data
                                     |
                                     v
+-----------------------------------------------------------------------+
|                     backend container (FastAPI)                       |
|                                                                       |
|  app/mqtt_client.py          app/routes/*.py                          |
|  +------------------+        +-----------------------------+          |
|  | paho-mqtt thread |        | GET  /api/health            |          |
|  | JSON + Pydantic  |        | GET  /api/readings/latest   |          |
|  | detect_waste()   |        | GET  /api/readings/range    |          |
|  +--------+---------+        | GET  /api/alerts/active     |          |
|           |                  | POST /api/alerts/{id}/resolve|         |
|           | async insert     | GET  /api/stats/summary     |          |
|           v                  +--------------+--------------+          |
|  SQLAlchemy 2.x async + asyncpg              |                        |
|           |                                 |                        |
+-----------|---------------------------------|------------------------+
            |                                 |
            v                                 |
   +---------------------+                    |
   | PostgreSQL 15       |<-------------------+
   | db: wattwise        |
   | tables: readings,   |
   |         alerts,     |
   |         savings     |
   +---------------------+
```

Message flow: **sensor JSON → Mosquitto → MQTTIngestor → Pydantic validation → `readings` INSERT → `detect_waste()` → `alerts` INSERT → REST API**.

---

## Project structure

```
wattwise-dz/
├── docker-compose.yml
├── .env.example
├── .env                     # local copy (git-ignored)
├── .gitignore
├── README.md
├── mosquitto/
│   └── mosquitto.conf       # anonymous dev broker + websockets
├── backend/
│   ├── Dockerfile
│   ├── pyproject.toml
│   ├── alembic.ini
│   ├── alembic/
│   │   ├── env.py
│   │   ├── script.py.mako
│   │   └── versions/
│   │       ├── 0001_initial_schema.py
│   │       └── 0002_ai_tables.py
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── database.py
│   │   ├── models.py           # adds ModelRun table
│   │   ├── schemas.py          # adds forecast/explanation/model schemas
│   │   ├── mqtt_client.py      # Phase 1 detect_waste() untouched; hybrid integration
│   │   ├── ai/
│   │   │   ├── __init__.py
│   │   │   ├── prepare_data.py # Building 59 → training_data.csv
│   │   │   ├── features.py     # 15-min feature engineering
│   │   │   ├── train_forecaster.py   # explicit CLI: XGBoost training
│   │   │   ├── forecaster.py   # 24h inference, residual prediction
│   │   │   ├── train_detector.py     # explicit CLI: Isolation Forest training
│   │   │   ├── detector.py     # 3-layer hybrid detector
│   │   │   ├── explainer.py    # deterministic French explanations
│   │   │   ├── pv_detector.py  # expected power, 7 PV rules, health score
│   │   │   ├── energy_optimizer.py  # solar/battery/grid deterministic optimizer
│   │   │   └── agent.py        # WATTY LLM agent (PV + optimizer context)
│   │   ├── routes/
│   │   │   ├── __init__.py
│   │   │   ├── health.py
│   │   │   ├── ai.py           # /forecast/next24h, /alerts/{id}/explanation, /models
│   │   │   ├── solar.py        # /current, /history, /detailed, /faults,
│   │   │   │                   #   /inverter-status, /optimization
│   │   │   └── readings.py
│   │   └── tests/
│   │       ├── conftest.py         # truncates model_runs / pv_* too
│   │       ├── test_health.py
│   │       ├── test_readings.py
│   │       ├── test_mqtt_ingest.py
│   │       ├── test_features.py
│   │       ├── test_forecaster.py
│   │       ├── test_forecast_route.py
│   │       ├── test_detector.py
│   │       ├── test_explainer.py
│   │       ├── test_model_runs.py
│   │       ├── test_migration_0002.py
│   │       └── test_pv.py          # 24 PV monitoring / diagnostic / optimizer tests
├── scripts/
│   ├── fetch_building59_data.py   # downloads Building_59.zip from Dryad
│   └── simulate_advanced_solar.py # advanced PV telemetry simulator (backend image)
└── frontend/
    ├── Dockerfile
    ├── nginx.conf
    ├── package.json
    ├── vitest.config.ts
    ├── tsconfig.json
    ├── tailwind.config.ts
    ├── postcss.config.js
    ├── index.html
    ├── playwright.config.ts
    ├── src/
    │   ├── main.tsx, App.tsx, index.css
    │   ├── lib/{api,format,constants,demoData}.ts
    │   ├── hooks/{useTheme,useDemoMode}.tsx
    │   ├── components/layout/{Header,Sidebar,Footer}.tsx
    │   ├── components/ui/{Button,Card,Badge,Dialog,Table,Input,Select,Skeleton,EmptyState,AnimatedCounter}.tsx
    │   ├── components/charts/{PowerChart,ForecastChart,SavingsChart,SolarConsumptionChart,ProductionComparisonChart}.tsx
    │   ├── components/solar/{PvLiveMetrics,PvHealthPanel,InverterPanel}.tsx
    │   ├── components/widgets/{TopConsumersWidget,EnergySourceWidget}.tsx
    │   ├── components/alerts/AlertTable.tsx
    │   ├── components/status/{DeviceStatus,ModelStatus}.tsx
    │   ├── components/chat/ChatWidget.tsx
    │   ├── components/reports/CarbonReportDialog.tsx
    │   ├── pages/{Dashboard,Alerts,Forecast,Solar,Simulator,CarbonReport,Savings,Settings}.tsx
    │   └── __tests__/{format,api}.test.ts
    └── tests/
        └── e2e/smoke.spec.ts
```

---

## Prerequisites

- **Docker Desktop** (or Docker Engine) with the Compose v2 plugin — `docker compose version`
- **Python 3.11+** for the simulator (`python --version`)

Nothing else needs to be installed locally: the backend, database and broker run in containers.

---

## Quick start

From the `wattwise-dz/` directory. Commands use Compose v2 (`docker compose`);
on Compose v1 use `docker-compose` with identical arguments.

```bash
# 1. Create the local environment file
cp .env.example .env

# 2. Build and start postgres, mosquitto and the backend
docker compose up -d

# 3. Apply database migrations (creates readings, alerts, savings)
docker compose exec backend alembic upgrade head

# 4. Follow backend logs (JSON structured logs)
docker compose logs -f backend
```

`GET http://localhost:8000/api/health` should now return:

```json
{"status": "ok", "database": "ok", "mqtt": "ok"}
```

> `mqtt` becomes `ok` a moment after startup, once paho completes its first broker handshake.

---

## Phase 2: AI layer

### 1. Prepare real Building 59 data

Building 59 (LBNL, Dryad DOI `10.7941/D1N33Q`) is a three-year office-building dataset. The archive (~263 MB) is downloaded from Dryad, then converted into the WATTWISE training schema:

```bash
# From wattwise-dz/, on the host (needs the Dryad cookie header)
python scripts/fetch_building59_data.py --archive /tmp/Building_59.zip --destination backend/data/raw/Building_59/Bldg59_clean\ data

# From inside the backend container
docker compose exec backend python -m app.ai.prepare_data
```

This writes `backend/data/training_data.csv` (~2.3M rows when unfiltered). Column mapping:

| WATTWISE column | Building 59 source |
|-----------------|--------------------|
| `power` | `(mels_S + lig_S + mels_N + hvac_N + hvac_S) * 1000` (kW → W) |
| `fan_current` | `(hvac_N + hvac_S) * 1000 / 220` (HVAC current proxy) |
| `temperature` | `site_weather.air_temp_set_1` |
| `humidity` | `site_weather.relative_humidity_set_1` |
| `occupancy` | `sum(occ_third_south, occ_fourth_south) > 0` |
| `lux` | `NULL` (no illuminance sensor in Building 59) |
| `voltage` | `NULL` |
| `current` | `power / 220` |
| `energy_kwh` | cumulative 15-min integral of `power` |

Ele/Wi-Fi dates parse as `%Y/%m/%d %H:%M`; occupancy/weather dates as `%Y-%m-%d %H:%M:%S`. All sources are floored to 15-minute bins; rows without an electricity sample are dropped.

> **Download note (important):** Dryad sits behind an Anubis JavaScript proof-of-work gate. Automated script/curl downloads are challenged with 401/403. Use a browser session to obtain the cookie header (see `scripts/fetch_building59_data.py --help`), or download `Building_59.zip` manually and pass it with `--archive`. Without the archive, Phase 2 training commands are skipped (models stay absent, `/api/forecast/next24h` returns 503).

### 2. Train models (explicit CLI only — never at startup)

```bash
# Inside the backend container
docker compose exec backend python -m app.ai.prepare_data
docker compose exec backend python -m app.ai.train_forecaster
docker compose exec backend python -m app.ai.train_detector
```

Outputs:
- `backend/models/forecaster.pkl` — bare `XGBRegressor`
- `backend/models/forecaster_metrics.json` — `mae`, `rmse`, `r2`, `n_samples`, `trained_at`
- `backend/models/detector.pkl` — `IsolationForest`
- `backend/models/detector_metrics.json` — `anomaly_rate`, `n_samples`, `contamination`
- `model_runs` table row (one per forecaster training run)

### 3. Run migrations

```bash
docker compose exec backend alembic upgrade head     # creates model_runs table
docker compose exec backend alembic downgrade -1     # drops model_runs table
docker compose exec backend alembic upgrade head     # re-creates (reversible)
```

### 4. New API endpoints (prefix `/api`, host port 18000 with overrides)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/forecast/next24h?device_id=SALLE1` | 24 hourly predictions with `±1.5 × MAE` confidence bounds; **503** if forecaster untrained |
| GET | `/api/alerts/{id}/explanation` | Deterministic French `reason` / `evidence` / `recommended_action` / `estimated_savings_kwh_per_day`; 404 if missing |
| GET | `/api/models` | Forecaster/detector availability, sidecar metrics, last `model_runs` row |

Phase 1 endpoints are unchanged: `/api/health`, `/api/readings/latest`, `/api/readings/range`, `/api/alerts/active`, `/api/alerts/{id}/resolve`, `/api/stats/summary`. New alert types `ISOLATION_FOREST_ANOMALY` and `OVERCONSUMPTION_VS_FORECAST` appear in `/api/alerts/active` with `cause`/`confidence` populated; existing alert types (`FAN_NO_OCCUPANCY`, `HIGH_POWER_NO_OCCUPANCY`, `LIGHTING_CANDIDATE`) gain explainer templates too.

### 5. Hybrid detection in MQTT ingestion

`MQTTIngestor.process_payload()` now, after the reading flush, runs the three-layer hybrid detector via lazy imports (Phase 1 stays importable without ML deps):

1. **Layer 1** — untouched `detect_waste()` rule set.
2. **Layer 2** — Isolation Forest anomaly on `(power, fan_current, temperature, occupancy)`.
3. **Layer 3** — positive residual vs. XGBoost forecast (observed > `max(50 W, 30% × predicted)`).

Each alert's `cause` is stored as JSON from the explainer (`reason`, `evidence`, `recommended_action`, `estimated_savings_kwh_per_day`), so `/api/alerts/{id}/explanation` can serve it without re-reading the original reading.

### 6. Actual results (verified)

Training was run on the real Building 59 dataset (3 years, 2018-01-01 to 2021-01-01):

| Metric | Value |
|--------|-------|
| Training rows | 99,935 |
| Usable feature rows | 99,791 |
| Train / test split | 79,832 / 19,958 |
| Avg power | 53,325 W |
| Max power | 181,900 W |
| Forecaster MAE | 2,289 W (4.29% of avg power — **< 15% threshold**) |
| Forecaster RMSE | 3,428 W |
| Forecaster R² | 0.937 |
| Detector anomaly rate | 5.00% |
| CSV input sizes | ele: 6.16 MB, occ: 11.66 MB, wifi: 2.74 MB, weather: 5.32 MB |
| training_data.csv | ~12.4 MB, 13 columns |

Test suite: **33 passed, 2 skipped** (8 existing Phase 1 + 25 new Phase 2; 2 skips require `forecaster.pkl` present in the test container).

Verified end-to-end: publishing an anomalous MQTT reading (power=200,000 W vs predicted=11,065 W) generated `ISOLATION_FOREST_ANOMALY` (Layer 2), `OVERCONSUMPTION_VS_FORECAST` (Layer 3), plus the Phase 1 rules — all with explainer JSON in `alerts.cause`.

---

---

## Run the simulator

The simulator runs on the host and publishes to `localhost:1883` by default.

```bash
cd simulator
pip install -r requirements.txt
python simulator.py
```

Each published JSON line is printed to stdout. The backend logs a corresponding
`stored reading id=... device=SALLE1 power=...` entry. The cumulative energy
counter starts at `100.0 kWh` and grows with each sample.

Optional simulator environment variables (see `.env.example`):
`SIMULATOR_MQTT_HOST`, `SIMULATOR_MQTT_PORT`, `SIMULATOR_DEVICE_ID`,
`SIMULATOR_INTERVAL_SECONDS`, `SIMULATOR_FAULT_PROBABILITY`.

---

## Test the API

```bash
# Health
curl http://localhost:8000/api/health

# Latest readings (default limit=100, max=1000)
curl "http://localhost:8000/api/readings/latest?limit=10&device_id=SALLE1"

# Readings in a time range (defaults to last 24h)
curl "http://localhost:8000/api/readings/range?from=2026-01-01T00:00:00Z&to=2026-01-02T00:00:00Z&device_id=SALLE1"

# Active (unresolved) alerts
curl "http://localhost:8000/api/alerts/active?device_id=SALLE1"

# Resolve an alert
curl -X POST http://localhost:8000/api/alerts/1/resolve

# 24h KPI summary
curl "http://localhost:8000/api/stats/summary?device_id=SALLE1&hours=24"
```

An OpenAPI UI is available at `http://localhost:8000/docs`.

### API summary

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Service, database and MQTT status |
| GET | `/api/readings/latest?limit=100&offset=0&device_id=SALLE1` | Latest readings, newest first |
| GET | `/api/readings/range?from=...&to=...&device_id=...` | Readings in a range (default 24h), 400 if `from >= to` |
| GET | `/api/alerts/active?device_id=...` | Unresolved alerts, newest first |
| POST | `/api/alerts/{id}/resolve` | Mark alert resolved (404 if missing) |
| GET | `/api/stats/summary?device_id=...&hours=24` | Power / energy / alert / occupancy KPIs |
| GET | `/api/stats/score?device_id=...` | Wattwise Score: grade A-F (0-100), deducts per alert, +10 if Eco Mode ON |
| GET | `/api/stats/top-consumers?device_id=...` | Top 5 most energy-consuming zones/devices with progress % |
| GET | `/api/stats/benchmark?device_id=...` | Your consumption vs neighborhood average (+/- %) |
| GET | `/api/forecast/next24h?device_id=SALLE1` | 24 hourly power forecasts + `±1.5 × MAE` bounds; 503 if untrained |
| POST | `/api/system/vacation-mode` | Toggle Mode Vacances (autonomous agent when away) |
| GET | `/api/alerts/{id}/explanation` | French `reason` / `evidence` / `recommended_action` / savings; 404 if missing |
| GET | `/api/models` | Forecaster/detector availability, metrics, last training run |
| GET | `/api/solar/current` | Current PV power (unchanged Phase 3 endpoint) |
| GET | `/api/solar/history?hours=24` | PV power history (unchanged Phase 3 endpoint) |
| GET | `/api/solar/detailed` | Advanced PV telemetry + expected vs actual |
| GET | `/api/solar/faults` | Rule-based PV diagnostics + health score |
| GET | `/api/solar/inverter-status` | Inverter efficiency/temperature/history |
| GET | `/api/solar/optimization` | Solar/battery/grid split + estimated savings |

All list endpoints accept `limit` (1–1000, default 100) and `offset` (≥0, default 0).

---

## Run tests

Inside the backend container (test database is created automatically):

```bash
docker compose exec backend pytest
```

Expected: **76 passed** (Phase 1 + Phase 2 + Phase 3 + 24 advanced PV tests in `tests/test_pv.py`). The suite uses `TEST_DATABASE_URL`, creates the `wattwise_test` database on first run, recreates tables per test and truncates data afterwards. No MQTT broker is needed — the ingest handler is called with a fake message.

New test files:
- `tests/test_features.py` — 15-min feature engineering, NaN-free output, warmup-row drop
- `tests/test_forecaster.py` — 24 bounded hourly predictions, missing-model guard
- `tests/test_forecast_route.py` — `/api/forecast/next24h` 200 / 503 behaviour
- `tests/test_detector.py` — Phase 1 rule delegation, Isolation Forest layer, residual layer
- `tests/test_explainer.py` — all six alert-type templates, savings formula, endpoint
- `tests/test_model_runs.py` — training metrics persistence, `/api/models` response
- `tests/test_migration_0002.py` — upgrade/downgrade reversibility on a throw-away database
- `tests/test_pv.py` — expected power (temperature derating), inverter efficiency guards, all 7 diagnostic rules, persistence/duplicate suppression, health score, optimizer keys, and the four solar endpoints

To run tests on the host instead:

```bash
cd backend
python -m venv .venv && .venv\Scripts\activate   # Windows
pip install -e ".[dev]"
# Point tests at the Docker-published Postgres port
set TEST_DATABASE_URL=postgresql+asyncpg://wattwise:wattwise_dev@localhost:5432/wattwise_test
pytest
```

---

## Configuration

All settings come from environment variables (documented in `.env.example`):

| Variable | Default | Purpose |
|----------|---------|---------|
| `DATABASE_URL` | `postgresql+asyncpg://wattwise:wattwise_dev@postgres:5432/wattwise` | Backend database |
| `TEST_DATABASE_URL` | `...@postgres:5432/wattwise_test` | Isolated pytest database |
| `MQTT_BROKER_HOST` | `mosquitto` | Broker host for the backend |
| `MQTT_BROKER_PORT` | `1883` | Broker TCP port |
| `MQTT_TOPIC` | `wattwise/+/data` | Subscription filter for consumption sensors |
| `MQTT_SOLAR_TOPIC` | `wattwise/+/solar` | Optional advanced PV telemetry topic |
| `MQTT_KEEPALIVE` | `60` | paho keepalive seconds |
| `SIMULATOR_MQTT_HOST` | `localhost` | Broker host for the host-run simulator |
| `SIMULATOR_MQTT_PORT` | `1883` | Broker port for the simulator |
| `SIMULATOR_DEVICE_ID` | `SALLE1` | Device identifier and topic segment |
| `SIMULATOR_INTERVAL_SECONDS` | `10` | Publish cadence |
| `SIMULATOR_FAULT_PROBABILITY` | `0.15` | Stuck-fan injection rate (demo) |
| `LOG_LEVEL` | `INFO` | Root log level |
| `PV_DEVICE_ID` | `PV1` | Photovoltaic device identifier |
| `PV_PANEL_AREA_M2` | `34` | Total module area (m²) |
| `PV_PANEL_EFFICIENCY` | `0.195` | Module efficiency at STC (0–1) |
| `PV_PEAK_KW` | `6.5` | Nominal plant peak power (display only) |
| `PV_TEMP_COEFFICIENT_PER_C` | `-0.004` | Power temperature coefficient |
| `PV_NOCT_C` | `45` | Nominal Operating Cell Temperature |
| `PV_STALE_AFTER_MINUTES` | `30` | Age after which samples are stale |
| `PV_UNDERPERFORMANCE_RATIO` | `0.80` | Underperformance threshold |
| `PV_MIN_IRRADIANCE_WM2` | `500` | Irradiance floor for underperformance |
| `PV_CONSECUTIVE_READINGS` | `3` | Persistence required for persistent faults |
| `PV_MAX_PANEL_TEMPERATURE_C` | `70` | Panel overheat threshold |
| `PV_INVERTER_MIN_EFFICIENCY_PCT` | `90` | Inverter degradation threshold |
| `PV_INVERTER_MAX_TEMPERATURE_C` | `65` | Inverter overheat threshold |
| `PV_FAULT_RENOTIFY_MINUTES` | `30` | Duplicate-alert suppression window |
| `BATTERY_CAPACITY_KWH` | `10` | Usable battery capacity (simulated) |
| `BATTERY_MIN_SOC_PERCENT` | `20` | Minimum state of charge |
| `BATTERY_MAX_SOC_PERCENT` | `95` | Maximum state of charge |
| `BATTERY_ROUND_TRIP_EFFICIENCY` | `0.90` | Round-trip efficiency |
| `GRID_TARIFF_DZD_PER_KWH` | `5.5` | Documented flat import tariff |
| `GRID_EXPORT_ENABLED` | `false` | Feed-in disabled (no verified tariff) |
| `GRID_EXPORT_TARIFF_DZD_PER_KWH` | `0` | Export tariff (unused while disabled) |
| `GRID_CO2_FACTOR_KG_PER_KWH` | `0.45` | Grid emission factor |
| `POSTGRES_PORT` | `5432` | Host port mapped to PostgreSQL (compose override) |
| `BACKEND_PORT` | `8000` | Host port mapped to the backend API (compose override) |

---

## Design Decisions

1. **MQTT thread → asyncio bridge.** paho-mqtt runs its network loop in a
   background thread while SQLAlchemy is async. Every message is scheduled onto
   the FastAPI event loop with `asyncio.run_coroutine_threadsafe`, keeping all
   DB access async and loop-bound. Failures are logged inside the future
   callback, never propagated through the MQTT thread.
2. **Resilient startup.** The broker is contacted with `connect_async()` +
   `loop_start()`, so paho retries with backoff if Mosquitto is not ready. A
   disconnect only flips the health flag and logs a warning; the API stays up
   and reconnects automatically.
3. **Server-side timestamps** (`datetime.now(timezone.utc)`) are used for
   `readings.timestamp`, as specified in the MQTT contract. Sensor clocks are
   therefore not trusted for ordering.
4. **Alerts and stats live in `routes/readings.py`.** To keep the file tree
   exactly as requested, alert and statistics endpoints share the readings
   router instead of introducing extra modules.
5. **`total_energy_kwh` from the cumulative counter.** `energy_kwh` is a
   monotonic meter, so summing it would be meaningless. The summary reports
   `max(energy_kwh) - min(energy_kwh)` over the window (0 when there is no
   data). It is documented here because Phase 2 may switch to integrating
   `power × time`.
6. **Test-isolated database.** `tests/conftest.py` overrides `DATABASE_URL`
   with `TEST_DATABASE_URL` before importing the app, creates `wattwise_test`
   if needed, and disposes the engine after each test. The latter avoids
   pytest-asyncio's per-test event loop being incompatible with pooled asyncpg
   connections.
7. **Simulator fault injection.** The temperature formula keeps fans off
   outside working hours, so pure telemetry would never produce a
   `FAN_NO_OCCUPANCY` alert. With probability
   `SIMULATOR_FAULT_PROBABILITY` (default 15 %) an unoccupied room gets a stuck
   fan drawing 0.35–0.45 A. This makes the acceptance scenario reproducible and
   is clearly logged by the simulator.
8. **Simulator defaults to `localhost`.** It is designed to run on the host,
   where the compose service name `mosquitto` does not resolve. Override
   `SIMULATOR_MQTT_HOST=mosquitto` if running it inside the Docker network.
9. **Structured JSON logging.** A stdlib formatter emits one JSON object per
   line with timestamp, level, logger and message, suitable for container log
   collectors. No external logging dependency is required.
10. **Health endpoint always returns 200.** `status` stays `ok` while
    `database` / `mqtt` report dependency state, letting orchestrators
    distinguish a degraded dependency from a dead process.
11. **Dev-only anonymous MQTT.** `allow_anonymous true` is intentional for the
    local development broker. Production deployments must add TLS and
    authentication.

### Phase 2 design decisions

12. **Models trained only via explicit CLI, never at startup.** `forecaster.pkl`,
    `detector.pkl` and their metrics sidecars are absent until
    `python -m app.ai.train_forecaster` / `train_detector` runs. The API degrades
    gracefully: `/api/forecast/next24h` returns 503, Layer 2/3 detection is
    skipped, `/api/models` reports `loaded: false`.
13. **`WasteDetector.detect()` returns dictionaries, not ORM objects.** This keeps
    it synchronous, DB-free and directly compatible with Phase 1's `Alert(**dict)`
    persistence loop in `MQTTIngestor`.
14. **Hybrid detection integrated via lazy imports.** `MQTTIngestor.process_payload()`
    imports `app.ai.forecaster` and `app.ai.detector` lazily after the reading
    flush, so Phase 1 stays importable even when ML packages or artifacts are
    absent.
15. **Forecaster artifact is a bare `XGBRegressor`; metrics live in a sidecar
    JSON.** `forecaster_metrics.json` carries `mae`/`rmse`/`r2` because the
    estimator itself does not. Confidence interval = `±1.5 × training MAE`.
16. **`predict_next_24h` generates 96 15-min steps and aggregates into 24 hourly
    items**, matching the API contract while the model was trained on 15-min
    bins. Hourly energy = sum of four 15-min energies (`× 0.25 h / 1000`).
17. **Explanation JSON stored in `alerts.cause`** at detection time, so the
    explanation endpoint can serve it without re-reading the original reading.
    Pre-stored explanation JSON is returned unchanged (idempotent).
18. **Migration `0002_ai_tables` uses `CREATE TABLE IF NOT EXISTS`** so it is safe
    to re-run on databases where `Base.metadata.create_all` already created the
    table (e.g. the pytest database). Downgrade drops the table and index.

### Limitations

- **Building 59 download is gate-blocked.** Dryad sits behind an Anubis
  JavaScript proof-of-work challenge. `curl`/`wget`/Python `requests` receive
  `401 Unauthorized` on `/api/v2/files/1305095/download` even with valid
  session cookies; the challenge is only cleared in a real browser session. The
  archive (~263 MB, SHA-256 `1e224dd7479bb196a8e0368fceb70aa6f699c1d39e1e895ceba7f3b25150b1b4`)
  must be obtained manually (browser download) and passed to
  `scripts/fetch_building59_data.py --archive <zip>`. Until then, forecaster and
  detector artifacts are absent and `/api/forecast/next24h` returns 503.
- **No frontend.** Phase 2, like Phase 1, is API-only. Phase 3 adds a React
  frontend at `http://localhost:3000`.
- **`lux` and `voltage` are `NULL`** in the Building 59-derived training data
  (not measured by the public dataset); the simulator still supplies them.
- **The forecaster is seeded by the last 200 readings of one device.** Cold
  start (no history) yields a persistence-style forecast anchored on default
  weather (22 °C, 50 % humidity) and zero power lags.
- **XGBoost `n_jobs=-1`** uses all cores inside the container; on a single-core
  host this provides no speedup and may add overhead.

### Database schema

- `readings` — one row per sensor sample, indexed on `device_id` and `timestamp`.
- `alerts` — rule detections (`FAN_NO_OCCUPANCY`, `HIGH_POWER_NO_OCCUPANCY`,
  `LIGHTING_CANDIDATE`), indexed on `device_id` and `timestamp`, `resolved`
  defaults to `false`.
- `savings` — optional FK to `alerts.id` (`ON DELETE SET NULL`) plus baseline /
  actual / saved kWh and percentages for Phase 2.

---

## Phase 3: Frontend

### Startup

From the `wattwise-dz/` directory:

```bash
# Build and start all services (postgres, mosquitto, backend, frontend)
docker compose up -d --build

# Apply migrations
docker compose exec backend alembic upgrade head

# Train models (optional; the forecast page degrades gracefully without them)
docker compose exec backend python -m app.ai.train_forecaster
docker compose exec backend python -m app.ai.train_detector
```

The frontend is served at **http://localhost:3002** (nginx proxies `/api` to the backend at `http://localhost:8000`).

### Pages

| Path | Description |
|------|-------------|
| `/` | Dashboard: animated KPI cards, consumption chart, solar vs consumption, recent alerts, device/model status |
| `/alerts` | Active/resolved toggle, severity cards, FDD diagnostic column, explanation dialog, resolve-all |
| `/forecast` | 24h forecast with confidence band; skeleton then graceful "model not trained" state |
| `/solar` | Advanced PV: 8 sections — overview KPIs, real-time DC/AC monitoring, expected vs actual, PV health diagnostics, inverter, energy-source optimization, 24h history, methodology cards |
| `/simulator` | Digital Twin ROI: 3 levers, animated KPIs, color-coded payback, 5-year projection |
| `/carbon` | Carbon Report: CO₂ avoided, tree equivalent, monthly objective bar, printable PDF |
| `/savings` | Record savings, summary with DZD conversion, history table and CSV export |
| `/settings` | API URL, refresh interval, model status, theme; persisted in localStorage |

### Demo Mode (pitch fallback)

The header exposes a **Demo Mode** toggle. It is fully client-side: `src/lib/api.ts` short-circuits every read/action to deterministic fixtures in `src/lib/demoData.ts`, so the UI remains complete even if the backend, MQTT broker or Groq API is unavailable. No network request is made in demo mode (except an optional health check).

**Demo Instructions (5-minute jury walkthrough):**

1. Open **http://localhost:3002**, confirm the green MQTT pulse in the header, then click **Demo Mode**. A banner confirms that all data is simulated.
2. **Dashboard** — watch KPI counters animate; open **Bilan Carbone** and point out the `TreePine` icon, the CO₂ objective progress bar and the **Télécharger PDF** button (`window.print()`).
3. **Alertes** — the FDD **Diagnostic** column shows a colored cause badge ("Cause probable : …"); switch to **Résolues** to show the filtered history and CSV export.
4. **Simulateur** — toggle Isolation/LED/Climatisation; KPIs and payback animate, turning green below 2 years and red above 5 years.
5. **Solaire** — show the rotating sun (respects `prefers-reduced-motion`), the gradient **Autoconsommation** badge, the real-time DC/AC metrics, the expected-vs-actual curve, the PV health ring (warning state, non-confirmed anomalies), the inverter panel, the energy-source donut and the estimated daily savings. Every card is labelled **Données simulées** in demo mode.
6. **Premium widgets** — on the Dashboard, point out the **Wattwise Score** gauge (grade A-F with color-coded ring), the **Top Consommateurs** wall of shame (red "Gaspilleur" badge on #1) and the **Benchmark Voisinage** card (green if you consume less than the neighborhood average).
7. **Rapport Hebdomadaire PDF** — click the **Rapport Hebdo** button in the Dashboard header; the print-ready page (no sidebar) shows weekly KPIs, a consumption bar chart and a **Télécharger PDF** button (`window.print()`).
8. **Mode Vacances** — open **WATTY**, click the **"Je pars en vacances"** suggestion or type it: WATTY asks for confirmation, then activates the mode. A blue **"Mode Vacances Actif"** banner appears at the top. With vacation mode ON, an occupancy reading for >2 hours triggers an "Intrusion ou retour anticipé" alert.
9. Open **WATTY** (bottom-right). Click a suggestion chip or ask "Bilan carbone", "Active le mode éco", "Je pars en vacances" or "Production solaire": a 3-dot typing indicator appears, then the answer plus a distinct green `Zap` action button routes to the right page.
10. Toggle light/dark mode in **Paramètres**, then resize to 390 px: no horizontal overflow, sidebar and chat remain usable.
11. Turn **Demo Mode** off to return to live backend data.

### Polish details

- **Design system:** shared spacing, typography and card radius; Framer Motion fade+slide page transitions; WCAG AA contrast in both themes; visible focus rings.
- **Loading & empty states:** `Skeleton`, `ChartSkeleton`, `KpiSkeleton`, `TableSkeleton`; illustrated `EmptyState` variants (alerts, success, data, search) on every table and chart.
- **Performance:** Simulateur and Solaire are `React.lazy` + `Suspense`; charts animate in <500 ms.
- **Accessibility:** `aria-label` on icon buttons, keyboard-navigable sidebar/chat, progress bars exposed via `role="progressbar"`.
- **Header/Footer:** notification bell lists the 5 latest alerts; footer reads "WATTWISE DZ © 2026 — SEM'INNOV Challenge".

### Currency assumption

The savings layer uses **5.5 DZD/kWh** (Sonelgaz residential average), configurable via `DZD_PER_KWH` in `backend/app/config.py` or the `DZD_PER_KWH` environment variable.

### 503 handling

The forecast page gracefully handles a missing model: if `/api/forecast/next24h` returns 503, a friendly empty state shows the training command with a retry button.

### Tests

- **Backend:** `docker compose exec backend pytest` → **76 passed**
- **Frontend unit:** `cd frontend && npm test -- --run` → **21 passed**
- **Frontend build:** `npm run build` + `npx tsc --noEmit` → clean
- **Frontend e2e:** `cd frontend && npm run e2e` → Playwright smoke test (pages load, 0 console errors, 503 handling, mobile 390px, localStorage persistence)

### Screenshots (descriptions)

- **Dashboard:** 4 animated KPI cards (Puissance, Énergie 24h, Alertes actives, Coût estimé), consumption chart, solar comparison, device/model status, recent alerts.
- **Alertes:** severity summary cards, device filter, active/resolved segmented control, FDD diagnostic column, resolution actions.
- **Prévisions:** 3 summary cards, confidence-band chart, hourly detail table; friendly "modèle non entraîné" state.
- **Solaire:** rotating sun hero, 4 KPI cards, gradient autoconsommation badge, coverage progress bar, PV vs consumption chart.
- **Simulateur:** 4 animated KPI cards with green/amber/red payback, three scenario sliders, 5-year projection chart.
- **Bilan Carbone:** CO₂ avoided and trees equivalent, monthly objective bar, methodology card, PDF export.
- **Économies:** 3 KPI cards, savings chart, validated form, history table with CSV export.
- **Paramètres:** API URL, refresh interval, connection test, model status, theme selector.

---

## Phase 4: Advanced PV monitoring, AI diagnostics & energy-source optimization

This phase extends the existing platform without replacing anything: `/api/solar/current` and `/api/solar/history` keep their original behaviour, and all new logic lives in dedicated tables and modules.

### Data model

| Table | Purpose |
|-------|---------|
| `pv_readings` | One advanced PV sample: `dc_voltage`, `dc_current`, `dc_power`, `ac_power`, `irradiance`, `panel_temperature`, `ambient_temperature`, `expected_power`, `actual_power`, `panel_area`, `panel_efficiency`, `inverter_efficiency`, `inverter_temperature`, `inverter_status`, `inverter_dc_input_power`, `inverter_ac_output_power`, `data_source` (`simulator` \| `mqtt`), `timestamp`. Indexed on `(device_id, timestamp)`. |
| `pv_faults` | Persistent rule-based diagnostics: `fault_type`, `severity`, `status` (`ACTIVE` \| `RESOLVED`), `message`, `explanation`, `recommended_action`, `confidence`, `is_confirmed` (always `false` from the detector), `occurrences`, `first_detected_at`, `last_detected_at`, `resolved_at`. |

Migration `backend/alembic/versions/0003_pv_monitoring.py` is idempotent (`CREATE TABLE/INDEX IF NOT EXISTS`), so it is safe on databases already initialised by `Base.metadata.create_all`.

### New API endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/solar/detailed?device_id=PV1&hours=24&resolution_minutes=15` | Latest PV sample, resampled history, expected vs actual power and deviation. |
| GET | `/api/solar/faults?device_id=PV1&history_limit=20` | Active + resolved diagnostics, health score/status and methodology. |
| GET | `/api/solar/inverter-status?device_id=PV1&hours=24` | Current DC→AC efficiency, temperature, input/output power, efficiency history, warnings. |
| GET | `/api/solar/optimization?device_id=PV1&consumption_device_id=SALLE1&hours=24` | Solar/battery/grid energy split, unused surplus, battery level, estimated savings (DZD) and recommendation. |

All four return `data_available: false` (and no invented values) when there is no telemetry. They are consumed by `Solar.tsx` and the dashboard `EnergySourceWidget`.

### Expected power and inverter efficiency

```
expected_power = irradiance × panel_area × panel_efficiency
                 × (1 + temp_coefficient × (panel_temperature − 25 °C))   # when specs exist
inverter_efficiency = inverter_ac_output_power / inverter_dc_input_power × 100
```

Division by zero is guarded: when DC input is zero or unavailable, efficiency is `null` and the API reports the value as unavailable instead of fabricating `0 %` or `100 %`.

### Diagnostic rules (rule-based, never "confirmed")

The detector (`backend/app/ai/pv_detector.py`) evaluates the recent window and persists anomalies. Required persistence and thresholds are configurable (see `.env.example`):

| Fault | Severity | Trigger |
|-------|----------|---------|
| `PV_UNDERPERFORMANCE` | WARNING | Actual < 80 % of expected for `PV_CONSECUTIVE_READINGS` (irradiance ≥ 500 W/m², expected ≥ 50 W). |
| `PV_PRODUCTION_DROP` | CRITICAL | Actual power collapses vs the previous readings while irradiance stays high. |
| `PV_PANEL_OVERHEAT` | WARNING | Panel temperature > 70 °C for **2** consecutive samples. |
| `INVERTER_OVERHEAT` | WARNING | Inverter temperature > 65 °C for **2** consecutive samples. |
| `INVERTER_DEGRADATION` | WARNING | DC→AC efficiency < 90 % for `PV_CONSECUTIVE_READINGS`. |
| `PV_SENSOR_INCONSISTENCY` | WARNING | `dc_power` disagrees with `dc_voltage × dc_current` beyond tolerance. |
| `PV_DATA_STALE` | WARNING | No fresh sample within `PV_STALE_AFTER_MINUTES`. |

Persistence rules: an ongoing anomaly updates the existing `ACTIVE` row (`occurrences += 1`) instead of inserting duplicates, and auto-resolves when the condition disappears. Re-notification is throttled by `PV_FAULT_RENOTIFY_MINUTES` (default 30). **No row is ever marked `is_confirmed = true`** — an inspection remains the only way to confirm a physical fault.

Health score:

```
health = clamp(100 − Σ penalty, 0, 100)
penalty = severity_points × persistence
severity_points = 8 (WARNING) | 20 (CRITICAL)
persistence = 1 + 0.1 × min(occurrences − 1, 4)
status = normal (≥ 85) | warning (60–84) | critical (< 60) | unknown (no data)
```

### Energy-source optimizer

`backend/app/ai/energy_optimizer.py` is deterministic and rule-based. It computes the daily balance between solar production, consumption, a simulated battery and grid import, then returns the required keys: `solar_used_kwh`, `battery_used_kwh`, `grid_used_kwh`, `unused_solar_kwh`, `battery_level_percent`, `estimated_daily_savings_dzd`, `estimated_savings_percent`, `baseline_cost_dzd`, `optimized_cost_dzd`, `recommendation_text`, `optimization_status`.

- The battery is **simulated** (`battery_simulated: true`); no BMS is connected.
- No time-of-use or dynamic Sonelgaz tariff is assumed. Savings use the configured `GRID_TARIFF_DZD_PER_KWH` (default 5.5 DZD/kWh) and are estimates, not verified billing savings.
- Grid feed-in is disabled by default; surplus remains `unused_solar_kwh` rather than being valued.
- When consumption or solar data is missing, `optimization_status` is `no_data` and the text explains what is missing.

### Run the advanced PV simulator

The simulator writes physically consistent rows to `pv_readings` (irradiance → DC, module temperature → derating, inverter efficiency → AC) and marks every row `data_source = "simulator"`. It runs inside the backend container:

```bash
# Normal 24 h, 15-minute samples
docker compose exec backend python -m scripts.simulate_advanced_solar \
    --duration-hours 24 --interval-minutes 15 --mode normal

# Scenario injection (each triggers its diagnostic)
docker compose exec backend python -m scripts.simulate_advanced_solar --mode partial_shading
docker compose exec backend python -m scripts.simulate_advanced_solar --mode dust
docker compose exec backend python -m scripts.simulate_advanced_solar --mode overheat
docker compose exec backend python -m scripts.simulate_advanced_solar --mode inverter_degradation

# Preview one sample without writing
docker compose exec backend python -m scripts.simulate_advanced_solar --dry-run
```

Options: `--duration-hours`, `--interval-minutes`, `--mode {normal,partial_shading,dust,overheat,inverter_degradation}`, `--device-id`, `--start`, `--seed` (default 42, reproducible), `--dry-run`, `--skip-diagnostics`.

### MQTT / ESP32 wiring

Physical telemetry can be published to the optional topic `MQTT_SOLAR_TOPIC` (default `wattwise/+/solar`). The backend stores the sample in `pv_readings` with `data_source = "mqtt"` and runs diagnostics in a background `asyncio` task, so ingestion and the API stay non-blocking.

```json
{
  "device_id": "PV1",
  "timestamp": "2026-03-01T12:15:00Z",
  "irradiance": 860.0,
  "panel_temperature": 51.2,
  "ambient_temperature": 31.4,
  "dc_voltage": 342.1,
  "dc_current": 12.4,
  "dc_power": 4242.0,
  "ac_power": 4092.0,
  "panel_area": 34.0,
  "panel_efficiency": 0.195,
  "inverter_efficiency": 96.5,
  "inverter_temperature": 49.8,
  "inverter_status": "RUNNING",
  "inverter_dc_input_power": 4242.0,
  "inverter_ac_output_power": 4092.0,
  "data_source": "mqtt"
}
```

An ESP32 (or any gateway) only needs to publish this JSON to `wattwise/PV1/solar`; no backend code change is required. `expected_power` is recomputed server-side from irradiance, area and efficiency so a faulty device cannot inflate its own expected baseline.

### WATTY integration

`backend/app/ai/agent.py` injects a compact PV/optimizer context (latest reading, active diagnostics, inverter status, energy split) into WATTY's system prompt and exposes actions to open the relevant solar section. WATTY states explicitly when data is missing or simulated, and never presents a rule-based anomaly as a confirmed fault.

### Frontend sections (`/solar`)

1. Header (simulated/physical badge, generation state).
2. Overview KPIs (current production, installed peak, coverage, consumption).
3. Real-time monitoring (`PvLiveMetrics`): DC/AC power, voltage, current, irradiance, module/ambient temperature, efficiency.
4. Expected vs actual (`ProductionComparisonChart`) with deviation badge.
5. PV health (`PvHealthPanel`) — score ring, active anomalies, methodology disclosure.
6. Inverter (`InverterPanel`) — efficiency, temperature, efficiency history, warnings.
7. Optimization (`EnergySourceWidget`) — solar/battery/grid donut, simulated SoC, estimated savings.
8. Historical performance and methodology cards.

The dashboard also shows a compact `EnergySourceWidget` ("Source d'énergie active") after the KPI row.

### Honesty guarantees / limitations

- Simulated rows are always labelled `data_source = "simulator"` and the UI shows **Données simulées**. They are never presented as physical sensor values.
- No Sonelgaz time-of-use tariff, feed-in tariff, maintenance date or confirmed PV fault is invented. Only the documented flat tariff (5.5 DZD/kWh) is used, and savings are estimates.
- Diagnostics are correlation-based rules; a real fault still requires a visual/thermal inspection.
- Battery state of charge is simulated until a BMS is integrated.
- The PV device (`PV1`) is separate from the consumption device (`SALLE1`); the optimizer needs both to produce a split.

### Tests

- Backend: `docker compose exec backend pytest` → **76 passed** (includes 24 in `tests/test_pv.py`).
- Frontend unit: `cd frontend && npm test` → **21 passed**.
- Frontend build: `npm run build` → clean (`tsc` + Vite; only the pre-existing chunk-size warning).

---


## Troubleshooting

| Symptom | Cause / fix |
|---------|-------------|
| `docker compose up` fails: `.env` not found | Run `cp .env.example .env` from `wattwise-dz/`. |
| Backend restarts or logs `connection refused` for Postgres | Wait for the `postgres` healthcheck; inspect `docker compose logs postgres`. If the `pgdata` volume was initialised with different credentials, run `docker compose down -v` (destroys data) and retry. |
| `/api/health` shows `"mqtt": "error"` | The backend has not completed its broker handshake yet, or Mosquitto is down. Check `docker compose logs mosquitto` and that port 1883 is free. |
| `/api/health` shows `"database": "error"` | Postgres is unreachable or migrations/credentials are wrong. Check `docker compose ps` and `DATABASE_URL`. |
| Simulator cannot connect to `mosquitto` | It runs on the host — keep `SIMULATOR_MQTT_HOST=localhost` (default). Only use `mosquitto` inside the compose network. |
| `alembic upgrade head`: `relation already exists` | The schema was created by an earlier run outside Alembic. Reset with `docker compose down -v`, then `up -d` and migrate again. |
| `pytest`: `database "wattwise_test" does not exist` | Conftest creates it automatically; ensure the `wattwise` role can create databases and that Postgres is reachable. |
| `pytest` hangs or raises event-loop errors | Ensure tests run through `pytest` (asyncio mode is configured in `pyproject.toml`); do not share one async engine across custom loops. |
| Port 5432 / 1883 / 8000 already in use | Stop the conflicting service or change the host side of the port mapping in `docker-compose.yml`. `POSTGRES_PORT` and `BACKEND_PORT` env vars override the host ports without editing the file (e.g. `POSTGRES_PORT=55432 BACKEND_PORT=18000 docker compose up -d` on Linux/macOS, or `$env:POSTGRES_PORT="55432"; $env:BACKEND_PORT="18000"` in PowerShell). URL examples then use the overridden backend port. |
| Readings not appearing | Confirm the simulator is publishing (`docker compose logs -f mosquitto`) and the topic matches `wattwise/+/data`. |
| `alembic` command not found in container | Run it via compose: `docker compose exec backend alembic upgrade head`. |

---

## Roadmap

- Phase 4: alert notifications (SMS / email), multi-building tenancy, authentication and rate limiting.
