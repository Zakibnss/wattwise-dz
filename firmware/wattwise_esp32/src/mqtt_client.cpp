#include "mqtt_client.h"

/* ---- Global instance -------------------------------------------------- */
MqttClient mqtt;

/* ---- Constructor ------------------------------------------------------ */
MqttClient::MqttClient()
    : _wifiClient(nullptr), _mqttClient(nullptr),
      _head(0), _tail(0), _count(0), _lastReconnectAttempt(0)
{
    for (int i = 0; i < BUFFER_SIZE; i++) {
        _buffer[i].valid = false;
        _buffer[i].json[0] = '\0';
    }
}

/* ---- begin() ---------------------------------------------------------- */
void MqttClient::begin(WiFiClient &wifiClient) {
    _wifiClient = &wifiClient;
    _mqttClient = new PubSubClient(*_wifiClient);
    _mqttClient->setServer(MQTT_BROKER, MQTT_PORT);
    _mqttClient->setKeepAlive(60);
    Serial.print(F("[MQTT] Broker: "));
    Serial.print(MQTT_BROKER);
    Serial.print(F(":"));
    Serial.println(MQTT_PORT);
}

/* ---- isConnected() ---------------------------------------------------- */
bool MqttClient::isConnected() const {
    return _mqttClient && _mqttClient->connected();
}

/* ---- loop() ----------------------------------------------------------- */
void MqttClient::loop() {
    if (!_mqttClient) return;

    /* WiFi reconnect */
    if (WiFi.status() != WL_CONNECTED) {
        _wifiConnect();
    }

    /* MQTT reconnect */
    if (!_mqttClient->connected()) {
        unsigned long now = millis();
        if (now - _lastReconnectAttempt > MQTT_RECONNECT_MS) {
            _lastReconnectAttempt = now;
            if (reconnect()) {
                _flushBuffer();
            }
        }
    } else {
        _mqttClient->loop();
    }
}

/* ---- _wifiConnect() --------------------------------------------------- */
void MqttClient::_wifiConnect() {
    static unsigned long lastAttempt = 0;
    unsigned long now = millis();
    if (now - lastAttempt < WIFI_RECONNECT_MS) return;
    lastAttempt = now;

    Serial.print(F("[WiFi] Connecting to "));
    Serial.println(WIFI_SSID);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
}

/* ---- reconnect() ------------------------------------------------------ */
bool MqttClient::reconnect() {
    if (WiFi.status() != WL_CONNECTED) return false;

    String clientId = String("wattwise-") + String(DEVICE_ID) +
                      String("-") + String((uint32_t)ESP.getEfuseMac(), HEX);

    Serial.print(F("[MQTT] Connecting as "));
    Serial.println(clientId);

    if (strlen(MQTT_USER) > 0) {
        if (_mqttClient->connect(clientId.c_str(), MQTT_USER, MQTT_PASS)) {
            Serial.println(F("[MQTT] Connected (auth)"));
            return true;
        }
    } else {
        if (_mqttClient->connect(clientId.c_str())) {
            Serial.println(F("[MQTT] Connected (anonymous)"));
            return true;
        }
    }

    Serial.print(F("[MQTT] Connect failed, rc="));
    Serial.print(_mqttClient->state());
    Serial.println(F(" retrying..."));
    return false;
}

/* ---- publish() -------------------------------------------------------- */
bool MqttClient::publish(const Reading &reading) {
    if (!_mqttClient || !_mqttClient->connected()) {
        /* Buffer for later */
        StaticJsonDocument<256> doc;
        doc["device_id"] = DEVICE_ID;
        doc["voltage"] = reading.voltage;
        doc["current"] = reading.current;
        doc["power"] = reading.power;
        doc["energy_kwh"] = reading.energy_kwh;
        doc["fan_current"] = reading.fan_current;
        doc["temperature"] = reading.temperature;
        doc["humidity"] = reading.humidity;
        doc["lux"] = reading.lux;
        doc["occupancy"] = reading.occupancy;

        char json[256];
        size_t n = serializeJson(doc, json);
        json[n] = '\0';
        return _bufferPush(json);
    }

    /* Build JSON payload */
    StaticJsonDocument<256> doc;
    doc["device_id"] = DEVICE_ID;
    doc["voltage"] = reading.voltage;
    doc["current"] = reading.current;
    doc["power"] = reading.power;
    doc["energy_kwh"] = reading.energy_kwh;
    doc["fan_current"] = reading.fan_current;
    doc["temperature"] = reading.temperature;
    doc["humidity"] = reading.humidity;
    doc["lux"] = reading.lux;
    doc["occupancy"] = reading.occupancy;

    char json[256];
    size_t n = serializeJson(doc, json);
    json[n] = '\0';

    /* Flush any buffered readings first */
    _flushBuffer();

    /* Publish current reading */
    String topic = String("wattwise/") + String(DEVICE_ID) + String("/data");
    return _publishRaw(topic.c_str(), json);
}

/* ---- _publishRaw() ---------------------------------------------------- */
bool MqttClient::_publishRaw(const char *topic, const char *payload) {
    if (!_mqttClient || !_mqttClient->connected()) return false;
    bool ok = _mqttClient->publish(topic, payload, false); /* non-retained */
    if (ok) {
        Serial.print(F("[MQTT] Published to "));
        Serial.println(topic);
    } else {
        Serial.println(F("[MQTT] Publish failed"));
    }
    return ok;
}

/* ---- _bufferPush() ---------------------------------------------------- */
bool MqttClient::_bufferPush(const char *json) {
    if (_count >= BUFFER_SIZE) {
        /* Drop oldest */
        _tail = (_tail + 1) % BUFFER_SIZE;
        _count--;
    }
    strncpy(_buffer[_head].json, json, sizeof(_buffer[_head].json) - 1);
    _buffer[_head].json[sizeof(_buffer[_head].json) - 1] = '\0';
    _buffer[_head].valid = true;
    _head = (_head + 1) % BUFFER_SIZE;
    _count++;
    Serial.print(F("[Buffer] Stored ("));
    Serial.print(_count);
    Serial.println(F("/20)"));
    return true;
}

/* ---- _bufferPop() ----------------------------------------------------- */
bool MqttClient::_bufferPop(char *jsonOut, size_t maxLen) {
    if (_count == 0) return false;
    strncpy(jsonOut, _buffer[_tail].json, maxLen - 1);
    jsonOut[maxLen - 1] = '\0';
    _buffer[_tail].valid = false;
    _tail = (_tail + 1) % BUFFER_SIZE;
    _count--;
    return true;
}

/* ---- _flushBuffer() --------------------------------------------------- */
void MqttClient::_flushBuffer() {
    if (_count == 0) return;
    Serial.print(F("[Buffer] Flushing "));
    Serial.print(_count);
    Serial.println(F(" buffered readings..."));

    char json[256];
    while (_count > 0 && _mqttClient->connected()) {
        if (!_bufferPop(json, sizeof(json))) break;
        /* Extract topic from JSON is not stored; republish to default topic */
        String topic = String("wattwise/") + String(DEVICE_ID) + String("/data");
        if (!_publishRaw(topic.c_str(), json)) {
            /* Push back if publish failed mid-flush */
            _bufferPush(json);
            break;
        }
    }
    Serial.println(F("[Buffer] Flush complete"));
}
