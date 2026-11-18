#ifndef CONFIG_H
#define CONFIG_H

/* ========================================================================
 * WATTWISE DZ ESP32 — Configuration
 * ========================================================================
 * Edit this file to match your deployment. TEST_MODE=1 compiles and runs
 * without any physical hardware (simulated sensor values).
 * ======================================================================== */

/* ---- Test mode ------------------------------------------------------- */
#define TEST_MODE 1          /* 1 = simulation (no hardware), 0 = real sensors */

/* ---- WiFi ------------------------------------------------------------ */
#define WIFI_SSID     "CHANGE_ME"
#define WIFI_PASSWORD "CHANGE_ME"

/* ---- MQTT broker ----------------------------------------------------- */
#define MQTT_BROKER "192.168.1.100"   /* Mosquitto broker IP/hostname   */
#define MQTT_PORT   1883              /* Broker TCP port                */
#define MQTT_USER   ""                /* Username (empty = anonymous)   */
#define MQTT_PASS   ""                /* Password (empty = anonymous)   */

/* ---- Device identity ------------------------------------------------- */
#define DEVICE_ID "SALLE1"            /* Must match backend device_id   */

/* ---- Timing ---------------------------------------------------------- */
#define PUBLISH_INTERVAL_MS 10000     /* Publish every 10 s             */
#define OLED_UPDATE_MS      1000      /* Refresh OLED every 1 s         */
#define WIFI_RECONNECT_MS   5000      /* WiFi reconnect retry interval  */
#define MQTT_RECONNECT_MS   5000      /* MQTT reconnect retry interval  */

/* ---- Ring buffer for offline storage --------------------------------- */
#define BUFFER_SIZE 20                /* Max readings kept offline      */

/* ---- SCT-013 calibration --------------------------------------------- */
#define SCT_ADC_PIN       34          /* GPIO34 = ADC1_CH6              */
#define SCT_BURDEN_OHMS   33.0        /* Burden resistor value          */
#define SCT_CT_RATIO      30.0        /* 30 A primary / 1 mA secondary  */
#define SCT_ADC_REF_V     3.3         /* ESP32 ADC reference            */
#define SCT_ADC_BITS      4096.0      /* 12-bit ADC                     */
#define SCT_CALIBRATION   111.1       /* Calibration constant (EmonLib) */

/* ---- PZEM-004T UART (Serial2) ---------------------------------------- */
#define PZEM_RX_PIN 16                /* GPIO16  → PZEM TX              */
#define PZEM_TX_PIN 17                /* GPIO17  → PZEM RX              */
#define PZEM_SERIAL 2                 /* UART2                          */

/* ---- DHT22 ----------------------------------------------------------- */
#define DHT_PIN   4                   /* GPIO4, 10k pull-up to 3.3 V    */
#define DHT_TYPE  DHT22

/* ---- PIR ------------------------------------------------------------- */
#define PIR_PIN   27                  /* GPIO27                         */

/* ---- I2C (BH1750 + SSD1306) ------------------------------------------ */
#define I2C_SDA 21                    /* GPIO21                         */
#define I2C_SCL 22                    /* GPIO22                         */
#define BH1750_ADDR 0x23
#define OLED_ADDR   0x3C
#define OLED_WIDTH  128
#define OLED_HEIGHT 64

#endif /* CONFIG_H */
