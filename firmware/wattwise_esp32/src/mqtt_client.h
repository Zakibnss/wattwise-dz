#ifndef MQTT_CLIENT_H
#define MQTT_CLIENT_H

#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include "config.h"
#include "sensors.h"

/* ---- Ring buffer entry ---------------------------------------------- */
struct BufferedReading {
    char  json[256];
    bool  valid;
};

/* ---- MQTT client wrapper -------------------------------------------- */
class MqttClient {
public:
    MqttClient();
    void begin(WiFiClient &wifiClient);
    bool reconnect();
    void loop();
    bool publish(const Reading &reading);
    bool isConnected() const;

private:
    WiFiClient   *_wifiClient;
    PubSubClient *_mqttClient;
    BufferedReading _buffer[BUFFER_SIZE];
    uint8_t      _head;
    uint8_t      _tail;
    uint8_t      _count;
    unsigned long _lastReconnectAttempt;

    void _wifiConnect();
    bool _bufferPush(const char *json);
    bool _bufferPop(char *jsonOut, size_t maxLen);
    void _flushBuffer();
    bool _publishRaw(const char *topic, const char *payload);
};

extern MqttClient mqtt;

#endif /* MQTT_CLIENT_H */
