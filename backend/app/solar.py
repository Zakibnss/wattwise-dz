"""Solar photovoltaic calculation helpers and generation model."""

from __future__ import annotations

import math
import random
from datetime import datetime


def calculate_solar_power_kw(
    dt: datetime,
    peak_kw: float = 6.5,
    noise_factor: float = 0.05,
) -> float:
    """Calculate solar power in kW for a given timestamp using a diurnal bell curve.

    Peak occurs at 12:00 (noon). Sunrise around 06:00, sunset around 18:00.
    Outside daylight hours, production is 0 kW.

    Args:
        dt: The timestamp to evaluate.
        peak_kw: Maximum peak power at noon (in kW).
        noise_factor: Magnitude of random variance (clouds, dust, etc.).

    Returns:
        Generated power in kW rounded to 3 decimal places.
    """
    hour = dt.hour + dt.minute / 60.0 + dt.second / 3600.0

    if hour < 6.0 or hour > 18.0:
        return 0.0

    phase = (hour - 6.0) / 12.0 * math.pi
    base_power = peak_kw * math.sin(phase)

    if base_power > 0.05:
        variation = 1.0 + random.uniform(-noise_factor, noise_factor)
        power = max(0.0, base_power * variation)
    else:
        power = max(0.0, base_power)

    return round(power, 3)
