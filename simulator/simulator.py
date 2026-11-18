"""WATTWISE DZ sensor simulator.

Publishes realistic building telemetry to MQTT every 10 seconds so the whole
platform can be exercised without physical hardware.
"""

from __future__ import annotations

import json
import math
import os
import random
import time
from datetime import datetime

import paho.mqtt.client as mqtt

DEFAULT_INTERVAL_SECONDS = 10.0
INITIAL_ENERGY_KWH = 100.0


def generate_reading(
    now: datetime,
    energy_kwh: float,
    interval_seconds: float = DEFAULT_INTERVAL_SECONDS,
    fault_probability: float = 0.15,
    rng: random.Random | None = None,
) -> dict[str, float | int | str]:
    """Build one realistic sensor sample for the given local time.

    The formulas follow the Phase 1 simulator contract. A small, documented
    fault injection keeps the detection rules observable during demos: while
    the room is unoccupied, a fan is occasionally left running (stuck fan),
    which is exactly the waste pattern WATTWISE DZ must flag.

    Args:
        now: Local timestamp used to derive hour-based behaviour.
        energy_kwh: Previous cumulative energy counter value in kWh.
        interval_seconds: Publish interval used to integrate energy.
        fault_probability: Chance of injecting a stuck fan while unoccupied.
        rng: Optional random generator (injectable for deterministic tests).

    Returns:
        A JSON-serialisable dictionary matching the MQTT payload contract.
    """
    generator = rng or random
    hour = now.hour + now.minute / 60.0

    temperature = 22 + 6 * math.sin((hour - 6) * math.pi / 12) + generator.uniform(
        -0.5, 0.5
    )

    weekday = now.weekday() < 5
    occupancy = 1 if weekday and 8 <= now.hour <= 17 else 0

    fan_current = 0.0 if temperature < 24 else generator.uniform(0.35, 0.45)

    # Fault injection: simulate a fan left running in an empty room.
    injected_fault = False
    if occupancy == 0 and fan_current == 0.0 and generator.random() < fault_probability:
        fan_current = generator.uniform(0.35, 0.45)
        injected_fault = True

    lamp1_on = bool(occupancy) or generator.random() < 0.15
    lamp2_on = bool(occupancy) or generator.random() < 0.10

    power = fan_current * 220 + (20 if lamp1_on else 0) + (20 if lamp2_on else 0)
    voltage = 220 + generator.uniform(-5, 5)
    current = power / voltage if voltage else 0.0

    lux = 100 + 900 * max(0.0, math.sin((hour - 6) * math.pi / 12)) + generator.uniform(
        -50, 50
    )
    lux = max(0.0, lux)

    humidity = 50 - (temperature - 22) * 2 + generator.uniform(-3, 3)
    humidity = min(85.0, max(20.0, humidity))

    next_energy = energy_kwh + power * interval_seconds / 3_600_000

    reading: dict[str, float | int | str] = {
        "device_id": os.getenv("SIMULATOR_DEVICE_ID", "SALLE1"),
        "voltage": round(voltage, 2),
        "current": round(current, 3),
        "power": round(power, 2),
        "energy_kwh": round(next_energy, 5),
        "fan_current": round(fan_current, 3),
        "temperature": round(temperature, 2),
        "humidity": round(humidity, 2),
        "lux": round(lux, 1),
        "occupancy": occupancy,
    }

    if injected_fault:
        print(
            "[simulator] injected fault: fan running while occupancy=0",
            flush=True,
        )

    return reading


def _connect(host: str, port: int) -> mqtt.Client:
    """Create a paho client and block until the broker is reachable.

    The simulator is usually started from the host machine, so connection
    failures are retried indefinitely instead of aborting the demo.
    """
    client = mqtt.Client(
        callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
        client_id="wattwise-dz-simulator",
        clean_session=True,
    )
    client.reconnect_delay_set(min_delay=1, max_delay=30)
    while True:
        try:
            client.connect(host, port, keepalive=60)
            print(f"[simulator] connected to {host}:{port}", flush=True)
            return client
        except OSError as exc:
            print(
                f"[simulator] broker {host}:{port} unavailable ({exc}); retrying in 5s",
                flush=True,
            )
            time.sleep(5)


def main() -> None:
    """Publish simulated readings forever at the configured interval."""
    host = os.getenv("SIMULATOR_MQTT_HOST", "localhost")
    port = int(os.getenv("SIMULATOR_MQTT_PORT", "1883"))
    device_id = os.getenv("SIMULATOR_DEVICE_ID", "SALLE1")
    interval = float(
        os.getenv("SIMULATOR_INTERVAL_SECONDS", str(DEFAULT_INTERVAL_SECONDS))
    )
    fault_probability = float(os.getenv("SIMULATOR_FAULT_PROBABILITY", "0.15"))
    topic = f"wattwise/{device_id}/data"

    client = _connect(host, port)
    client.loop_start()

    energy_kwh = INITIAL_ENERGY_KWH
    print(
        f"[simulator] publishing to {topic} every {interval}s "
        f"(fault_probability={fault_probability})",
        flush=True,
    )

    try:
        while True:
            reading = generate_reading(
                datetime.now(),
                energy_kwh,
                interval_seconds=interval,
                fault_probability=fault_probability,
            )
            energy_kwh = float(reading["energy_kwh"])  # type: ignore[arg-type]
            payload = json.dumps(reading, ensure_ascii=False)
            client.publish(topic, payload, qos=0)
            print(payload, flush=True)
            time.sleep(interval)
    except KeyboardInterrupt:
        print("[simulator] stopped by user", flush=True)
    finally:
        client.loop_stop()
        client.disconnect()


if __name__ == "__main__":
    main()
