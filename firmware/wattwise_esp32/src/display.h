#ifndef DISPLAY_H
#define DISPLAY_H

#include <Arduino.h>
#include "config.h"
#include "sensors.h"

#if TEST_MODE == 0
    #include <Adafruit_SSD1306.h>
    #include <Adafruit_GFX.h>
#endif

class Display {
public:
    Display();
    void begin();
    void update(const Reading &reading);
    void showStatus(const char *line1, const char *line2);

private:
#if TEST_MODE == 0
    Adafruit_SSD1306 *display;
#endif
    unsigned long _lastUpdate;
};

extern Display oled;

#endif /* DISPLAY_H */
