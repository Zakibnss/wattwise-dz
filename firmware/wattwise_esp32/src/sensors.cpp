#include "sensors.h"
#include <math.h>

#if TEST_MODE == 0
    #include <PZEM004Tv30.h>
    #include <DHT.h>
    #include <Adafruit_BH1750.h>
#endif

/* ---- Constructor ----------------------------------------------------- */
Sensors::Sensors()
#if TEST_MODE == 0
    : pzem(nullptr), dht(nullptr), bh1750(nullptr)
#endif
{
    _last_sim_ms = 0;
    _sim_phase = 0.0f;
}

/* ---- begin() --------------------------------------------------------- */
void Sensors::begin() {
#if TEST_MODE == 0
    /* PZEM-004T on UART2 */
    pzem = new PZEM004Tv30(Serial2, PZEM_RX_PIN, PZEM_TX_PIN);
    Serial2.begin(9600, SERIAL_8N1, PZEM_RX_PIN, PZEM_TX_PIN);

    /* DHT22 */
    dht = new DHT(DHT_PIN, DHT_TYPE);
    dht->begin();

    /* BH1750 */
    bh1750 = new Adafruit_BH1750();
    if (!bh1750->begin(BH1750_ADDR, &Wire)) {
        Serial.println(F("[Sensors] BH1750 not found!"));
    }

    /* EmonLib for SCT-013 */
    emon.current(SCT_ADC_PIN, SCT_CALIBRATION);

    /* PIR pin */
    pinMode(PIR_PIN, INPUT);

    Serial.println(F("[Sensors] Hardware initialised"));
#else
    Serial.println(F("[Sensors] TEST_MODE active — simulated sensors"));
#endif
}

/* ---- readAll() ------------------------------------------------------- */
Reading Sensors::readAll() {
#if TEST_MODE == 0
    /* --- Real hardware path ---------------------------------------- */
    Reading r{};

    /* PZEM readings (may return NaN on comms failure) */
    float v = pzem->voltage();
    float c = pzem->current();
    float p = pzem->power();
    float e = pzem->energy();

    r.voltage   = isnan(v) ? 0.0f : v;
    r.current   = isnan(c) ? 0.0f : c;
    r.power     = isnan(p) ? 0.0f : p;
    r.energy_kwh = isnan(e) ? 0.0f : e;

    /* SCT-013 fan current */
    r.fan_current = _readFanCurrent();

    /* DHT22 */
    float t = dht->readTemperature();
    float h = dht->readHumidity();
    r.temperature = isnan(t) ? 0.0f : t;
    r.humidity    = isnan(h) ? 0.0f : h;

    /* BH1750 */
    float lx = bh1750->readLightLevel();
    r.lux = isnan(lx) ? 0.0f : lx;

    /* PIR occupancy */
    r.occupancy = digitalRead(PIR_PIN) ? 1 : 0;
    return r;
#else
    /* --- TEST_MODE: simulated values ------------------------------- */
    return _readTestMode();
#endif
}

/* ---- _readFanCurrent() ---------------------------------------------- */
float Sensors::_readFanCurrent() {
#if TEST_MODE == 0
    double irms = emon.calcIrms(1480);  /* 1480 samples ~ 100 ms @ 50 Hz  */
    /* Convert A RMS to fan current (A) */
    return (irms < 0.0) ? 0.0f : (float)irms;
#else
    return 0.0f; /* overridden in _readTestMode */
#endif
}

/* ---- _readTestMode() ------------------------------------------------- */
Reading Sensors::_readTestMode() {
    Reading r{};
    unsigned long now = millis();

    /* Initialise phase on first call */
    if (_last_sim_ms == 0) {
        _last_sim_ms = now;
        _sim_phase = 0.0f;
    }

    /* Time delta in seconds */
    float dt = (now - _last_sim_ms) / 1000.0f;
    _last_sim_ms = now;
    _sim_phase += dt * 0.2f;          /* slow cycle */
    if (_sim_phase > 2.0f * PI) _sim_phase -= 2.0f * PI;

    /* --- Power: sine wave between 40 W and 220 W ------------------ */
    r.power = 130.0f + 90.0f * sin(_sim_phase);

    /* --- Voltage: stable 220 V ± small ripple --------------------- */
    r.voltage = 220.0f + 2.0f * sin(_sim_phase * 3.0f);

    /* --- Current derived from P/V --------------------------------- */
    r.current = r.power / r.voltage;

    /* --- Energy: cumulative integral ------------------------------ */
    static float energy = 0.0f;
    energy += r.power * dt / 3600.0f; /* Wh → kWh */
    r.energy_kwh = energy;

    /* --- Fan current: 0 A when unoccupied, ~0.35 A when on ------- */
    bool occupied = (_sim_phase < PI); /* occupied half the cycle */
    r.fan_current = occupied ? 0.35f : 0.0f;

    /* --- Temperature: 20–26 °C sine ------------------------------- */
    r.temperature = 23.0f + 3.0f * sin(_sim_phase * 0.5f);

    /* --- Humidity: 40–60 % sine ----------------------------------- */
    r.humidity = 50.0f + 10.0f * cos(_sim_phase * 0.5f);

    /* --- Lux: 0–800 sine (lights off at night) ------------------- */
    r.lux = fmaxf(0.0f, 400.0f + 400.0f * sin(_sim_phase * 0.7f));

    /* --- Occupancy: 1 between "08:00–17:00" simulation ----------- */
    r.occupancy = occupied ? 1 : 0;

    return r;
}
