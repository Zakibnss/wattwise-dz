#include <Arduino.h>
#include <WiFi.h>
#include "config.h"
#include "sensors.h"
#include "mqtt_client.h"
#include "display.h"

/* ---- Globals ---------------------------------------------------------- */
WiFiClient wifiClient;
Sensors    sensors;
/* oled is defined in display.cpp, declared extern in display.h */

unsigned long _lastPublish = 0;
unsigned long _lastOled    = 0;

/* ---- setup() ---------------------------------------------------------- */
void setup() {
    Serial.begin(115200);
    while (!Serial) { ; } /* wait for Serial (native USB) */
    Serial.println();
    Serial.println(F("========================================"));
    Serial.println(F(" WATTWISE DZ ESP32 Firmware"));
    Serial.print(F(" Device ID: "));
    Serial.println(DEVICE_ID);
#if TEST_MODE == 1
    Serial.println(F(" TEST_MODE: ON (simulated sensors)"));
#else
    Serial.println(F(" TEST_MODE: OFF (real hardware)"));
#endif
    Serial.println(F("========================================"));

    /* Sensors */
    sensors.begin();

    /* Display */
    oled.begin();
    oled.showStatus("WATTWISE DZ", "WiFi connecting...");

    /* MQTT (WiFi started inside mqtt.begin loop) */
    mqtt.begin(wifiClient);

    Serial.println(F("[Setup] Ready — entering loop()"));
}

/* ---- loop() ----------------------------------------------------------- */
void loop() {
    /* Keep MQTT + WiFi alive */
    mqtt.loop();

    unsigned long now = millis();

    /* ---- Publish sensor readings ------------------------------------ */
    if (now - _lastPublish >= PUBLISH_INTERVAL_MS) {
        _lastPublish = now;

        Reading r = sensors.readAll();

        /* Print JSON to Serial for debugging */
        Serial.print(F("[Reading] "));
        Serial.print(F("device_id="));
        Serial.print(DEVICE_ID);
        Serial.print(F(" power="));
        Serial.print(r.power, 1);
        Serial.print(F("W voltage="));
        Serial.print(r.voltage, 1);
        Serial.print(F("V current="));
        Serial.print(r.current, 2);
        Serial.print(F("A energy="));
        Serial.print(r.energy_kwh, 2);
        Serial.print(F("kWh fan="));
        Serial.print(r.fan_current, 2);
        Serial.print(F("A temp="));
        Serial.print(r.temperature, 1);
        Serial.print(F("C hum="));
        Serial.print(r.humidity, 1);
        Serial.print(F("% lux="));
        Serial.print(r.lux, 0);
        Serial.print(F(" occ="));
        Serial.println(r.occupancy);

        /* Publish to MQTT */
        mqtt.publish(r);
    }

    /* ---- Update OLED ------------------------------------------------ */
    if (now - _lastOled >= OLED_UPDATE_MS) {
        _lastOled = now;
        Reading r = sensors.readAll(); /* re-read (cheap in TEST_MODE) */
        oled.update(r);
    }
}
