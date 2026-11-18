# WATTWISE DZ ESP32 Firmware

ESP32-based energy monitoring node that reads all building sensors and publishes
JSON telemetry to the WATTWISE DZ MQTT broker. Fully functional in **TEST_MODE**
without any physical hardware.

## Table of Contents

1. [Overview](#overview)
2. [Bill of Materials](#bill-of-materials)
3. [Project Structure](#project-structure)
4. [Configuration](#configuration)
5. [PlatformIO Setup](#platformio-setup)
6. [TEST_MODE (no hardware)](#test-mode-no-hardware)
7. [Real Hardware Mode](#real-hardware-mode)
8. [JSON Payload Contract](#json-payload-contract)
9. [Safety Warnings](#safety-warnings)
10. [Troubleshooting](#troubleshooting)
11. [Design Decisions](#design-decisions)
12. [Known Limitations](#known-limitations)

## Overview

The firmware runs on an ESP32 DevKit v1 and:

- Reads PZEM-004T (voltage, current, power, energy) over UART2
- Reads SCT-013 current clamp (fan current) via ADC + EmonLib
- Reads DHT22 (temperature, humidity)
- Reads PIR (occupancy)
- Reads BH1750 (illuminance)
- Displays key metrics on an SSD1306 OLED
- Publishes JSON to Mosquitto on topic `wattwise/{DEVICE_ID}/data`
- Buffers up to 20 readings when offline and flushes on reconnect
- Compiles and runs without hardware via `TEST_MODE=1`

## Bill of Materials

| Qty | Part | Approx. Cost | Notes |
|-----|------|--------------|-------|
| 1 | ESP32 DevKit v1 (WROOM-32) | $6–10 | Main MCU |
| 1 | PZEM-004T v3.0 AC power meter | $12–18 | Whole-circuit V/A/kWh |
| 1 | SCT-013-030 current clamp | $4–8 | Fan/motor current |
| 1 | Burden resistor 33 Ω 1% | $0.10 | For SCT-013 |
| 1 | DHT22 temperature/humidity | $2–4 | Ambient sensing |
| 1 | HC-SR501 PIR motion sensor | $2–4 | Occupancy detection |
| 1 | BH1750 illuminance sensor | $2–4 | Lux level |
| 1 | SSD1306 OLED 0.96" I2C | $3–6 | Local display |
| 1 | Hi-Link 5 V 3 W AC-DC | $3–5 | Mains power for ESP32 |
| 1 | 1 A fuse + holder | $1 | Hi-Link primary protection |
| 1 | Enclosure + terminal blocks | $5–10 | Safe mounting |
|—| **Total** | **~$40–70** | |

## Project Structure

```
firmware/wattwise_esp32/
├── platformio.ini          # PlatformIO project config
├── src/
│   ├── main.cpp            # Entry point, setup/loop
│   ├── config.h            # WiFi, MQTT, pins, TEST_MODE
│   ├── sensors.h           # Sensor abstractions + Reading struct
│   ├── sensors.cpp         # Sensor read implementation
│   ├── mqtt_client.h       # MQTT wrapper + ring buffer
│   ├── mqtt_client.cpp     # MQTT connect/publish/buffer
│   ├── display.h           # OLED abstraction
│   └── display.cpp         # OLED rendering
├── WIRING.md               # Pinout + safety warnings
├── README.md               # This file
└── .gitignore              # Exclude .pio/ build artifacts
```

## Configuration

Edit `src/config.h` before building:

```cpp
#define TEST_MODE      1    /* 1 = simulate, 0 = real hardware  */
#define WIFI_SSID      "YOUR_SSID"
#define WIFI_PASSWORD  "YOUR_PASS"
#define MQTT_BROKER    "192.168.1.100"
#define MQTT_PORT      1883
#define DEVICE_ID      "SALLE1"
#define PUBLISH_INTERVAL_MS 10000
#define OLED_UPDATE_MS      1000
```

- **DEVICE_ID** must match a device expected by the backend (e.g. `SALLE1`).
- **MQTT_BROKER** is the IP/hostname of the Mosquitto broker. In Docker Compose
  the service name is `mosquitto`; from the host it is `localhost`.

## PlatformIO Setup

1. Install PlatformIO Core:

   ```bash
   pip install platformio
   ```

2. From `firmware/wattwise_esp32/`:

   ```bash
   # Build (TEST_MODE=1, no hardware)
   pio run -e esp32dev

   # Upload to ESP32
   pio run -e esp32dev -t upload

   # Monitor serial output
   pio device monitor
   ```

3. For real hardware, use the `esp32dev-hardware` environment
   (TEST_MODE=0):

   ```bash
   pio run -e esp32dev-hardware -t upload
   ```

## TEST_MODE (no hardware)

With `TEST_MODE=1` in `config.h` the firmware compiles and runs on an ESP32
without any sensors attached:

- All sensor values are simulated (sine-wave power/temp/lux, occupancy toggling,
  fan current 0 or 0.35 A).
- JSON is printed to Serial at 115200 baud.
- MQTT publishes still go to the broker (if WiFi is configured), so you can
  verify end-to-end against the running backend.

### Expected TEST_MODE Serial output

```
========================================
 WATTWISE DZ ESP32 Firmware
 Device ID: SALLE1
 TEST_MODE: ON (simulated sensors)
========================================
[Sensors] TEST_MODE active — simulated sensors
[Display] TEST_MODE — OLED simulation disabled
[MQTT] Broker: 192.168.1.100:1883
[Setup] Ready — entering loop()
[Reading] device_id=SALLE1 power=142.3 W voltage=221.5 V current=0.64 A energy=0.40 kWh fan=0.35 A temp=24.2 C hum=48.1% lux=512 occ=1
[MQTT] Published to wattwise/SALLE1/data
[OLED] P:142.3 W T:24.2 C I:0.64 A Fan:0.35 A Occ:1 Lux:512 E:0.40 kWh
[Reading] device_id=SALLE1 power=41.7 W voltage=218.9 V current=0.19 A energy=0.51 kWh fan=0.00 A temp=22.8 C hum=52.3% lux=0 occ=0
[MQTT] Published to wattwise/SALLE1/data
...
```

### Verify against the backend

With the backend stack running (`docker compose up -d`) and Mosquitto on
`localhost:1883`:

1. Set `MQTT_BROKER` to your host IP in `config.h`.
2. Build and upload with `TEST_MODE=1`.
3. Open Serial Monitor — confirm JSON is published every 10 s.
4. Query the backend:

   ```bash
   curl http://localhost:18000/api/readings/latest?device_id=SALLE1
   ```

   You should see the simulated readings persisted.

5. Check the health endpoint:

   ```bash
   curl http://localhost:18000/api/health
   ```

## Real Hardware Mode

1. Set `TEST_MODE=0` in `config.h`.
2. Wire all sensors per `WIRING.md` — **follow all safety warnings**.
3. Build and upload:

   ```bash
   pio run -e esp32dev-hardware -t upload
   ```

4. Monitor serial:

   ```bash
   pio device monitor
   ```

5. Confirm real sensor values appear in Serial and in the backend.

## JSON Payload Contract

The firmware publishes exactly the fields expected by the backend
`ReadingIngest` schema:

```json
{
  "device_id": "SALLE1",
  "voltage": 220.5,
  "current": 0.45,
  "power": 99.0,
  "energy_kwh": 12.34,
  "fan_current": 0.35,
  "temperature": 24.1,
  "humidity": 48.0,
  "lux": 320,
  "occupancy": 1
}
```

Topic: `wattwise/SALLE1/data` (matches backend subscription `wattwise/+/data`).

## Safety Warnings

1. **220 V AC is lethal.** Switch off the mains breaker and verify with a
   multimeter before any wiring.
2. **Hi-Link primary side:** Fit a 1 A fuse. Do not touch while energised.
3. **SCT-013:** Never leave the secondary open-circuit while current flows.
4. **PZEM-004T:** Common GND with ESP32 is required for UART.
5. Only qualified personnel should assemble the mains section.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| PZEM not responding | UART2 pins swapped, no common GND | Check GPIO16/17, GND link |
| SCT reads 0 A | Missing burden resistor | Install 33 Ω, adjust calibration |
| DHT returns NaN | Missing pull-up / bad connection | Add 10 kΩ to GPIO4 |
| WiFi won't connect | Wrong credentials / out of range | Edit config.h |
| MQTT publish fails | Broker unreachable | Verify MQTT_BROKER + port 1883 |
| OLED blank | Wrong I2C address / missing pull-ups | Check 0x3C, 4k7 Ω resistors |
| Buffer fills up | MQTT down for long periods | Buffer drops oldest after 20 |

## Design Decisions

1. **TEST_MODE first:** Firmware compiles and publishes simulated JSON without
   hardware, allowing end-to-end validation of the MQTT → backend pipeline
   before any hardware is purchased or wired.
2. **Non-blocking loop:** No `delay()` > 50 ms; WiFi/MQTT reconnect and sensor
   publishing use `millis()` timers so the watchdog is never starved.
3. **Ring buffer (20):** Readings are stored in RAM when MQTT is down and
   flushed on reconnect, so no telemetry is lost during brief outages.
4. **NaN → 0:** Sensor read failures (PZEM comms, DHT checksum) are coerced to
   0 rather than crashing or publishing invalid JSON.
5. **No `delay()` > 50 ms:** Keeps the ESP32 watchdog happy and maintains MQTT
   keepalive.

## Known Limitations

- Buffer is in RAM only; reboot loses unsent readings (no NVS/EEPROM persistence
  yet).
- SCT-013 calibration constant is approximate; field calibration against a
  reference meter is recommended.
- PZEM-004T energy is read directly from the meter; no local energy integration
  fallback if PZEM fails.
- TEST_MODE publishes to a real MQTT broker if WiFi is configured — ensure
  `DEVICE_ID` is unique to avoid colliding with other nodes.

## License

MIT — WATTWISE DZ project.
