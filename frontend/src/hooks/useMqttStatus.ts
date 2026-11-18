import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";

type MqttStatus = "ok" | "error" | "unknown";

export function useMqttStatus() {
  const [status, setStatus] = useState<MqttStatus>("unknown");
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const checkStatus = useCallback(async () => {
    try {
      const health = await api.getHealth();
      setStatus(health.mqtt === "ok" ? "ok" : "error");
      setLastChecked(new Date());
    } catch {
      setStatus("error");
      setLastChecked(new Date());
    }
  }, []);

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 30000);
    return () => clearInterval(interval);
  }, [checkStatus]);

  return { status, lastChecked, checkStatus, isConnected: status === "ok" };
}
