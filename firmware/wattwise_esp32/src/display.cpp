#include "display.h"

/* ---- Global instance -------------------------------------------------- */
Display oled;

/* ---- Constructor ------------------------------------------------------ */
Display::Display()
#if TEST_MODE == 0
    : display(nullptr)
#endif
{
    _lastUpdate = 0;
}

/* ---- begin() ---------------------------------------------------------- */
void Display::begin() {
#if TEST_MODE == 0
    Wire.begin(I2C_SDA, I2C_SCL);
    display = new Adafruit_SSD1306(OLED_WIDTH, OLED_HEIGHT, &Wire, -1);
    if (!display->begin(SSD1306_SWITCHCAPVCC, OLED_ADDR)) {
        Serial.println(F("[Display] SSD1306 not found!"));
        return;
    }
    display->clearDisplay();
    display->setTextColor(SSD1306_WHITE);
    display->setTextSize(1);
    showStatus(F("WATTWISE DZ"), F("Starting..."));
    Serial.println(F("[Display] SSD1306 initialised"));
#else
    Serial.println(F("[Display] TEST_MODE — OLED simulation disabled"));
#endif
}

/* ---- update() --------------------------------------------------------- */
void Display::update(const Reading &reading) {
    unsigned long now = millis();
    if (now - _lastUpdate < OLED_UPDATE_MS) return;
    _lastUpdate = now;

#if TEST_MODE == 0
    if (!display) return;

    display->clearDisplay();
    display->setCursor(0, 0);

    /* Line 1: Title */
    display->println(F("WATTWISE DZ"));
    display->println();

    /* Line 2: Power & temperature */
    display->print(F("P: "));
    display->print(reading.power, 1);
    display->print(F(" W   T: "));
    display->print(reading.temperature, 1);
    display->println(F(" C"));

    /* Line 3: Current */
    display->print(F("I: "));
    display->print(reading.current, 2);
    display->println(F(" A"));

    /* Line 4: Fan current */
    display->print(F("Fan: "));
    display->print(reading.fan_current, 2);
    display->println(F(" A"));

    /* Line 5: Occupancy */
    display->print(F("Occ: "));
    display->println(reading.occupancy ? F("OUI") : F("NON"));

    /* Line 6: Lux + Energy */
    display->print(F("Lux: "));
    display->print(reading.lux, 0);
    display->print(F("   E: "));
    display->print(reading.energy_kwh, 2);
    display->println(F(" kWh"));

    display->display();
#else
    /* Serial echo in test mode */
    Serial.printf(
        "[OLED] P:%.1f W T:%.1f C I:%.2f A Fan:%.2f A Occ:%d Lux:%.0f E:%.2f kWh\n",
        reading.power, reading.temperature, reading.current,
        reading.fan_current, reading.occupancy, reading.lux,
        reading.energy_kwh);
#endif
}

/* ---- showStatus() ----------------------------------------------------- */
void Display::showStatus(const char *line1, const char *line2) {
#if TEST_MODE == 0
    if (!display) return;
    display->clearDisplay();
    display->setCursor(0, 0);
    display->println(line1);
    display->println(line2);
    display->display();
#else
    Serial.printf("[OLED] %s / %s\n", line1, line2);
#endif
}
