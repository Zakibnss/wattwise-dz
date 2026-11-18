import { describe, it, expect, vi, beforeEach } from "vitest";
import { api } from "@/lib/api";

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
});

(globalThis as any).fetch = mockFetch;

describe("api client", () => {
  it("getHealth calls /api/health", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: "ok", database: "ok", mqtt: "ok" }),
    });
    const result = await api.getHealth();
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/api/health",
      expect.objectContaining({ headers: expect.objectContaining({ "Content-Type": "application/json" }) })
    );
    expect(result.status).toBe("ok");
  });

  it("getForecastNext24h throws on 503", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      text: async () => "Forecaster model not found",
    });
    await expect(api.getForecastNext24h("SALLE1")).rejects.toThrow();
  });

  it("createSavings sends correct payload", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 1,
        alert_id: 1,
        device_id: "SALLE1",
        timestamp: "2026-11-08T12:00:00Z",
        action_applied: "Ventilateur éteint",
        baseline_kwh: 10.0,
        actual_kwh: 4.0,
        saved_kwh: 6.0,
        saved_percent: 60.0,
        confidence: null,
      }),
    });
    const result = await api.createSavings({
      alert_id: 1,
      device_id: "SALLE1",
      action_applied: "Ventilateur éteint",
      baseline_kwh: 10.0,
      actual_kwh: 4.0,
    });
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/api/savings",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          alert_id: 1,
          device_id: "SALLE1",
          action_applied: "Ventilateur éteint",
          baseline_kwh: 10.0,
          actual_kwh: 4.0,
        }),
      })
    );
    expect(result.saved_kwh).toBe(6.0);
  });

  it("getSavingsSummary applies DZD conversion", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: "ok",
        device_id: "SALLE1",
        period_from: "2026-10-09T12:00:00Z",
        period_to: "2026-11-08T12:00:00Z",
        total_saved_kwh: 10.0,
        total_saved_dzd: 55.0,
        count: 1,
        items: [],
      }),
    });
    const result = await api.getSavingsSummary({ device_id: "SALLE1" });
    expect(result.total_saved_dzd).toBe(55.0);
    expect(result.total_saved_kwh).toBe(10.0);
  });

  it("getModels returns forecaster and detector status", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        models: {
          forecaster: { name: "forecaster_v1", loaded: true, path: "/app/models/forecaster.pkl", metrics: { mae: 2289.34 } },
          detector: { name: "detector_v1", loaded: true, path: "/app/models/detector.pkl", metrics: { anomaly_rate: 0.05 } },
        },
        last_training_run: null,
      }),
    });
    const result = await api.getModels();
    expect(result.models.forecaster.loaded).toBe(true);
    expect(result.models.detector.loaded).toBe(true);
    expect(result.models.forecaster.metrics?.mae).toBe(2289.34);
  });
});
