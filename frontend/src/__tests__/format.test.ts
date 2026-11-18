import { describe, it, expect } from "vitest";
import {
  formatPower,
  formatEnergy,
  formatCurrency,
  formatDateFr,
  formatPercent,
  formatNumber,
  DZD_PER_KWH,
} from "@/lib/format";

describe("formatPower", () => {
  it("returns em dash for null", () => {
    expect(formatPower(null)).toBe("—");
  });
  it("returns em dash for undefined", () => {
    expect(formatPower(undefined)).toBe("—");
  });
  it("formats watts below 1000", () => {
    expect(formatPower(500)).toBe("500 W");
  });
  it("formats kilowatts above 1000", () => {
    const result = formatPower(1500);
    expect(result).toMatch(/kW$/);
    expect(parseFloat(result.replace(/[^\d.,]/g, "").replace(",", "."))).toBeCloseTo(1.5);
  });
  it("formats exact 1000 as kW", () => {
    const result = formatPower(1000);
    expect(result).toMatch(/kW$/);
  });
});

describe("formatEnergy", () => {
  it("returns em dash for null", () => {
    expect(formatEnergy(null)).toBe("—");
  });
  it("formats kWh below 1000", () => {
    const result = formatEnergy(12.5);
    expect(result).toMatch(/kWh$/);
  });
});

describe("formatCurrency", () => {
  it("returns em dash for null", () => {
    expect(formatCurrency(null)).toBe("—");
  });
  it("formats currency with DZD code", () => {
    const result = formatCurrency(1234.5);
    expect(result).toContain("DZD");
    expect(result).toContain("234");
  });
});

describe("DZD_PER_KWH", () => {
  it("is set to 5.5", () => {
    expect(DZD_PER_KWH).toBe(5.5);
  });
});

describe("formatPercent", () => {
  it("returns em dash for null", () => {
    expect(formatPercent(null)).toBe("—");
  });
  it("formats percentage", () => {
    const result = formatPercent(50);
    expect(result).toMatch(/%$/);
    expect(result).toContain("50");
  });
});

describe("formatNumber", () => {
  it("returns em dash for null", () => {
    expect(formatNumber(null)).toBe("—");
  });
  it("formats number with thousands separator", () => {
    const result = formatNumber(1234);
    expect(result).toMatch(/\d/);
    expect(result).toContain("234");
  });
});

describe("formatDateFr", () => {
  it("returns em dash for null", () => {
    expect(formatDateFr(null)).toBe("—");
  });
  it("formats ISO date string", () => {
    const result = formatDateFr("2026-11-08T12:00:00Z");
    expect(result).toContain("2026");
    expect(result.length).toBeGreaterThan(0);
  });
});
