"""Convert the real Building 59 dataset into WATTWISE DZ training format.

Building 59 (LBNL, Dryad DOI ``10.7941/D1N33Q``) publishes five electricity
channels in ``ele.csv`` (all in kW), camera people counts in ``occ.csv``,
Wi-Fi device counts in ``wifi.csv`` and weather in ``site_weather.csv``.

Column mapping used here
------------------------
===================  =====================================================
WATTWISE column      Building 59 source
===================  =====================================================
``power``            ``(mels_S + lig_S + mels_N + hvac_N + hvac_S) * 1000``
``fan_current``      ``(hvac_N + hvac_S) * 1000 / 220`` (HVAC current proxy)
``temperature``      ``site_weather.air_temp_set_1``
``humidity``         ``site_weather.relative_humidity_set_1``
``occupancy``        ``sum(occ_third_south, occ_fourth_south) > 0``
``lux``              ``NULL`` — Building 59 has no illuminance sensor
``voltage``          ``NULL`` — not measured in the public dataset
``current``          ``power / 220`` (apparent current, nominal voltage)
``energy_kwh``       cumulative integral of ``power`` over 15-minute bins
``wifi_devices``     ``sum(wifi_*_south)`` (proxy, not used by models)
``solar_radiation_w_m2``  ``site_weather.solar_radiation_set_1``
===================  =====================================================

All sources are floored to 15-minute bins. Rows without an electricity sample
are dropped because ``power`` is the forecasting target.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

import pandas as pd

BACKEND_ROOT = Path(__file__).resolve().parents[2]
PROJECT_ROOT = BACKEND_ROOT.parent
ARCHIVE_DIR = "Bldg59_clean data"
DEFAULT_OUTPUT = BACKEND_ROOT / "data" / "training_data.csv"

REQUIRED_FILES = ("ele.csv", "occ.csv", "wifi.csv", "site_weather.csv")

ENERGY_COLUMNS = ("mels_S", "lig_S", "mels_N", "hvac_N", "hvac_S")
HVAC_COLUMNS = ("hvac_N", "hvac_S")
OCCUPANCY_COLUMNS = ("occ_third_south", "occ_fourth_south")
WIFI_COLUMNS = (
    "wifi_first_south",
    "wifi_second_south",
    "wifi_third_south",
    "wifi_fourth_south",
)
WEATHER_COLUMNS = (
    "air_temp_set_1",
    "relative_humidity_set_1",
    "solar_radiation_set_1",
)

NOMINAL_VOLTAGE = 220.0
BIN_MINUTES = 15
BIN_HOURS = BIN_MINUTES / 60.0
DEVICE_ID = "BUILDING59"

OUTPUT_COLUMNS = (
    "timestamp",
    "device_id",
    "voltage",
    "current",
    "power",
    "energy_kwh",
    "fan_current",
    "temperature",
    "humidity",
    "lux",
    "occupancy",
    "wifi_devices",
    "solar_radiation_w_m2",
)


def source_candidates() -> list[Path]:
    """Return the supported default locations for the extracted CSVs."""
    return [
        BACKEND_ROOT / "data" / "raw" / "Building_59" / ARCHIVE_DIR,
        PROJECT_ROOT / "data" / "raw" / "Building_59" / ARCHIVE_DIR,
    ]


def resolve_source(source: Path | None = None) -> Path:
    """Resolve the Building 59 folder from an explicit path or defaults.

    Raises:
        FileNotFoundError: If no candidate folder contains the four CSVs.
    """
    candidates = [source.expanduser().resolve()] if source else source_candidates()
    for candidate in candidates:
        if all((candidate / name).is_file() for name in REQUIRED_FILES):
            return candidate
    searched = "\n  ".join(str(candidate) for candidate in candidates)
    raise FileNotFoundError(
        "Building 59 CSVs not found. Searched:\n  "
        f"{searched}\nRun scripts/fetch_building59_data.py first, or pass --source."
    )


def _read(source: Path, filename: str) -> pd.DataFrame:
    """Read one CSV, raising a clear error when a required column is absent."""
    frame = pd.read_csv(source / filename)
    return frame


def _timestamps(series: pd.Series) -> pd.Series:
    """Parse Building 59 date strings (two source formats) into timestamps."""
    parsed = pd.to_datetime(series, errors="coerce")
    if parsed.isna().all():
        parsed = pd.to_datetime(series, format="%Y/%m/%d %H:%M", errors="coerce")
    return parsed.dt.floor(f"{BIN_MINUTES}min")


def _require_columns(frame: pd.DataFrame, columns: tuple[str, ...], filename: str) -> None:
    """Validate that a CSV contains the expected source columns."""
    missing = set(columns).difference(frame.columns)
    if missing:
        raise ValueError(
            f"{filename} is missing required columns: {', '.join(sorted(missing))}"
        )


def _energy(source: Path) -> pd.DataFrame:
    """Build the 15-minute power / fan-current frame from ``ele.csv``."""
    frame = _read(source, "ele.csv")
    _require_columns(frame, ("date", *ENERGY_COLUMNS), "ele.csv")
    frame = frame[["date", *ENERGY_COLUMNS]].copy()
    frame["timestamp"] = _timestamps(frame.pop("date"))
    frame[list(ENERGY_COLUMNS)] = frame[list(ENERGY_COLUMNS)].apply(
        pd.to_numeric, errors="coerce"
    )
    frame = (
        frame.dropna(subset=["timestamp"])
        .groupby("timestamp", as_index=True)[list(ENERGY_COLUMNS)]
        .mean()
    )
    frame["total_kw"] = frame[list(ENERGY_COLUMNS)].sum(
        axis=1, min_count=len(ENERGY_COLUMNS)
    )
    frame["hvac_kw"] = frame[list(HVAC_COLUMNS)].sum(axis=1, min_count=1)
    return frame[["total_kw", "hvac_kw"]]


def _occupancy(source: Path) -> pd.DataFrame:
    """Build the 15-minute binary occupancy frame from ``occ.csv``."""
    frame = _read(source, "occ.csv")
    _require_columns(frame, ("date", *OCCUPANCY_COLUMNS), "occ.csv")
    frame = frame[["date", *OCCUPANCY_COLUMNS]].copy()
    frame["timestamp"] = _timestamps(frame.pop("date"))
    frame[list(OCCUPANCY_COLUMNS)] = frame[list(OCCUPANCY_COLUMNS)].apply(
        pd.to_numeric, errors="coerce"
    )
    frame["people_count"] = frame[list(OCCUPANCY_COLUMNS)].sum(
        axis=1, min_count=1
    )
    grouped = (
        frame.dropna(subset=["timestamp"])
        .groupby("timestamp", as_index=True)["people_count"]
        .mean()
    )
    return pd.DataFrame({"occupancy": (grouped > 0).astype(int)})


def _wifi(source: Path) -> pd.DataFrame:
    """Build the 15-minute Wi-Fi device-count proxy from ``wifi.csv``."""
    frame = _read(source, "wifi.csv")
    _require_columns(frame, ("date", *WIFI_COLUMNS), "wifi.csv")
    frame = frame[["date", *WIFI_COLUMNS]].copy()
    frame["timestamp"] = _timestamps(frame.pop("date"))
    frame[list(WIFI_COLUMNS)] = frame[list(WIFI_COLUMNS)].apply(
        pd.to_numeric, errors="coerce"
    )
    frame["wifi_devices"] = frame[list(WIFI_COLUMNS)].sum(axis=1, min_count=1)
    grouped = (
        frame.dropna(subset=["timestamp"])
        .groupby("timestamp", as_index=True)["wifi_devices"]
        .mean()
    )
    return pd.DataFrame({"wifi_devices": grouped})


def _weather(source: Path) -> pd.DataFrame:
    """Build the 15-minute weather frame from ``site_weather.csv``."""
    frame = _read(source, "site_weather.csv")
    _require_columns(frame, ("date", *WEATHER_COLUMNS), "site_weather.csv")
    frame = frame[["date", *WEATHER_COLUMNS]].copy()
    frame["timestamp"] = _timestamps(frame.pop("date"))
    frame[list(WEATHER_COLUMNS)] = frame[list(WEATHER_COLUMNS)].apply(
        pd.to_numeric, errors="coerce"
    )
    grouped = (
        frame.dropna(subset=["timestamp"])
        .groupby("timestamp", as_index=True)[list(WEATHER_COLUMNS)]
        .mean()
    )
    return pd.DataFrame(
        {
            "temperature": grouped["air_temp_set_1"],
            "humidity": grouped["relative_humidity_set_1"],
            "solar_radiation_w_m2": grouped["solar_radiation_set_1"],
        }
    )


def prepare_frame(
    source: Path,
    start: str | None = None,
    end: str | None = None,
) -> pd.DataFrame:
    """Load and merge the four Building 59 CSVs into the training schema.

    Args:
        source: Folder containing ``ele.csv``, ``occ.csv``, ``wifi.csv`` and
            ``site_weather.csv``.
        start: Optional inclusive start timestamp.
        end: Optional exclusive end timestamp.

    Returns:
        A chronologically sorted DataFrame using :data:`OUTPUT_COLUMNS`.
    """
    energy = _energy(source)
    occupancy = _occupancy(source)
    wifi = _wifi(source)
    weather = _weather(source)

    frame = (
        energy.join(occupancy, how="outer")
        .join(wifi, how="outer")
        .join(weather, how="outer")
        .sort_index()
    )
    frame = frame[frame["total_kw"].notna()].copy()

    # Weather and occupancy are state variables: carry them over short gaps.
    frame["temperature"] = frame["temperature"].ffill().bfill()
    frame["humidity"] = frame["humidity"].ffill().bfill()
    frame["occupancy"] = (
        frame["occupancy"].ffill(limit=4).fillna(0).astype(int)
    )
    frame["wifi_devices"] = frame["wifi_devices"].ffill().fillna(0.0)

    frame["power"] = frame["total_kw"] * 1000.0
    frame["fan_current"] = (frame["hvac_kw"].fillna(0.0) * 1000.0) / NOMINAL_VOLTAGE
    frame["current"] = frame["power"] / NOMINAL_VOLTAGE
    frame["voltage"] = pd.NA
    frame["lux"] = pd.NA
    frame["device_id"] = DEVICE_ID
    frame["energy_kwh"] = (
        frame["power"].fillna(0.0) * BIN_HOURS / 1000.0
    ).cumsum().round(6)

    if start is not None:
        frame = frame[frame.index >= pd.Timestamp(start)]
    if end is not None:
        frame = frame[frame.index < pd.Timestamp(end)]

    frame = frame.rename_axis("timestamp").reset_index()
    return frame.loc[:, list(OUTPUT_COLUMNS)].reset_index(drop=True)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    """Parse command-line options."""
    parser = argparse.ArgumentParser(
        description="Prepare the real Building 59 dataset for WATTWISE DZ."
    )
    parser.add_argument(
        "--source",
        type=Path,
        default=None,
        help="Folder containing ele.csv/occ.csv/wifi.csv/site_weather.csv.",
    )
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--start", default=None, help="Optional ISO start date.")
    parser.add_argument("--end", default=None, help="Optional ISO end date.")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    """Convert the dataset, write the CSV and print a JSON summary."""
    args = parse_args(argv)
    try:
        source = resolve_source(args.source)
        frame = prepare_frame(source, start=args.start, end=args.end)
    except (FileNotFoundError, ValueError) as exc:
        print(f"Preparation failed: {exc}", file=sys.stderr)
        return 1

    if frame.empty:
        print("Preparation produced no rows; check the date filters.", file=sys.stderr)
        return 1

    args.output.parent.mkdir(parents=True, exist_ok=True)
    frame.to_csv(args.output, index=False)

    file_sizes = {
        name: (source / name).stat().st_size for name in REQUIRED_FILES
    }
    summary: dict[str, Any] = {
        "source": str(source),
        "output": str(args.output),
        "rows": int(len(frame)),
        "columns": list(frame.columns),
        "first_timestamp": str(frame["timestamp"].iloc[0]),
        "last_timestamp": str(frame["timestamp"].iloc[-1]),
        "avg_power_w": round(float(frame["power"].mean()), 3),
        "max_power_w": round(float(frame["power"].max()), 3),
        "input_files_bytes": file_sizes,
    }
    print(json.dumps(summary, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
