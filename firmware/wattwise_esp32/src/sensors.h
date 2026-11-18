#ifndef SENSORS_H
#define SENSORS_H

#include <Arduino.h>
#include "config.h"

#if TEST_MODE == 0
    #include <PZEM004Tv30.h>
    #include <DHT.h>
    #include <Adafruit_BH1750.h>
    #include <EmonLib.h>
#endif

/* ---- Reading structure ------------------------------------------------
 * Field names MUST match backend ReadingIngest schema exactly:
 *   device_id, voltage, current, power, energy_kwh,
 *   fan_current, temperature, humidity, lux, occupancy
 * --------------------------------------------------------------------- */
struct Reading {
    float voltage;        /* V    - PZEM line voltage        */
    float current;        /* A    - PZEM line current        */
    float power;          /* W    - PZEM active power        */
    float energy_kwh;     /* kWh  - PZEM cumulative energy   */
    float fan_current;    /* A    - SCT-013 fan current      */
    float temperature;    /* °C   - DHT22 temperature        */
    float humidity;       /* %    - DHT22 relative humidity  */
    float lux;            /* lx   - BH1750 illuminance       */
    int8_t occupancy;     /* 0/1  - PIR presence             */
};

/* ---- Sensor module --------------------------------------------------- */
class Sensors {
public:
    Sensors();
    void begin();
    Reading readAll();

private:
#if TEST_MODE == 0
    PZEM004Tv30   *pzem;
    DHT           *dht;
    Adafruit_BH1750 *bh1750;
    EnergyMonitor emon;
#endif
    unsigned long _last_sim_ms;
    float         _sim_phase;

    float  _readFanCurrent();
    Reading _readTestMode();
};

#endif /* SENSORS_H */
