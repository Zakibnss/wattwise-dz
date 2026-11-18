# WATTWISE DZ ESP32 — Wiring Guide

This document describes the electrical connections between the ESP32 DevKit v1
and all sensors. **Read the safety warnings before connecting anything.**

## ⚠️ SAFETY WARNINGS

1. **220 V AC is lethal.** Always switch off the mains breaker and verify with a
   multimeter before touching any wire. Work only if you are a qualified
   electrician or under supervision.
2. **Hi-Link AC-DC converter:** The primary side carries mains voltage. Fit a
   1 A fuse in series with the live wire. Ensure the enclosure is isolated and
   cannot be touched.
3. **PZEM-004T and SCT-013:** Never touch the CT or PZEM terminals while the
   circuit is energised. The SCT-013 must ALWAYS have its burden resistor
   connected — an open secondary on a live CT can generate dangerous voltages.
4. **Common GND:** The ESP32 GND must be common with the PZEM-004T GND for
   UART communication to work.
5. **Test with a multimeter** before connecting the ESP32 to any sensor.

## Pin Assignment (fixed)

| Function         | ESP32 GPIO | Notes                                       |
|------------------|------------|---------------------------------------------|
| PZEM RX (GPIO16) | GPIO16     | UART2 RX ← PZEM TX                          |
| PZEM TX (GPIO17) | GPIO17     | UART2 TX → PZEM RX                          |
| SCT-013 ADC      | GPIO34     | ADC1_CH6, 33 Ω burden resistor              |
| DHT22 data       | GPIO4      | 10 kΩ pull-up to 3.3 V                      |
| PIR              | GPIO27     | Digital input                               |
| I2C SDA          | GPIO21     | Shared: BH1750 (0x23) + SSD1306 (0x3C)      |
| I2C SCL          | GPIO22     | Shared: BH1750 (0x23) + SSD1306 (0x3C)      |

## ASCII Wiring Diagram

```
        220 V AC ──[1 A Fuse]──┬── Hi-Link 5 V ──┬── ESP32 5 V (VBUS)
                               │                 │
                               │                 └── PZEM-004T VCC (5 V)
                               │
          SCT-013 ─────[33 Ω]──┴── GPIO34 (ADC)
                               │
          PZEM-004T TX ────────┴── GPIO16 (RX2)
          PZEM-004T RX ────────┴── GPIO17 (TX2)
          PZEM-004T GND ────────┴── ESP32 GND (common)
                               │
          DHT22 DATA ──────────┴── GPIO4 ──[10 kΩ]── 3.3 V
          DHT22 VCC ────────────┴── 3.3 V
          DHT22 GND ─────────────┴── GND
                               │
          PIR OUT ─────────────┴── GPIO27
          PIR VCC ──────────────┴── 3.3 V
          PIR GND ──────────────┴── GND
                               │
          I2C SDA (GPIO21) ───┬── BH1750 SDA (0x23)
                              ├── SSD1306 SDA (0x3C)
          I2C SCL (GPIO22) ───┬── BH1750 SCL
                              └── SSD1306 SCL
                              [4k7 pull-ups to 3.3 V on both lines]

## Connection Table (step-by-step)

| # | ESP32 Pin | Connects To | Wire Colour | Notes |
|---|-----------|-------------|-------------|-------|
| 1 | 3.3 V     | DHT22 VCC   | Red         |       |
| 2 | 3.3 V     | PIR VCC     | Red         |       |
| 3 | 3.3 V     | BH1750 VCC  | Red         |       |
| 4 | 3.3 V     | SSD1306 VCC | Red         |       |
| 5 | GND       | DHT22 GND   | Black       | Common GND |
| 6 | GND       | PIR GND     | Black       | Common GND |
| 7 | GND       | PZEM GND    | Black       | Common GND |
| 8 | GND       | SCT burden  | Black       | One side of burden |
| 9 | GND       | BH1750 GND  | Black       |       |
|10 | GND       | SSD1306 GND | Black       |       |
|11 | GPIO16    | PZEM TX     | Yellow      | UART2 RX |
|12 | GPIO17    | PZEM RX     | Orange      | UART2 TX |
|13 | GPIO21    | I2C SDA     | Blue        | 4k7 pull-up to 3.3 V |
|14 | GPIO22    | I2C SCL     | Violet      | 4k7 pull-up to 3.3 V |
|15 | GPIO4     | DHT22 DATA  | Grey        | 10k pull-up to 3.3 V |
|16 | GPIO27    | PIR OUT     | Brown       |       |
|17 | GPIO34    | SCT burden  | White       | Other side of burden |

## Before Powering On

- [ ] Verify 220 V breaker is OFF
- [ ] Verify Hi-Link 1 A fuse installed
- [ ] Verify common GND between ESP32 and PZEM-004T
- [ ] Verify I2C pull-ups (4k7 Ω) on SDA/SCL
- [ ] Verify DHT22 10 kΩ pull-up
- [ ] Set TEST_MODE=0 in config.h
- [ ] Build and upload firmware
- [ ] Connect ESP32 to USB, open Serial Monitor at 115200 baud
- [ ] Only then switch 220 V breaker ON

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| PZEM not responding | UART2 pins swapped / no common GND | Check GPIO16/GPIO17, GND link |
| SCT reads 0 A | Burden resistor missing / wrong CT ratio | Check 33 Ω, adjust SCT_CALIBRATION |
| DHT returns NaN | Bad connection / missing pull-up | Check GPIO4 + 10 kΩ |
| WiFi won't connect | Wrong SSID / password / out of range | Edit config.h, check signal |
| OLED blank | I2C address wrong / no pull-ups | Check 0x3C, 4k7 resistors |
| MQTT publish fails | Broker unreachable / wrong port | Check MQTT_BROKER, MQTT_PORT (1883) |
