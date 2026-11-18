import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { setApiDemoMode } from "@/lib/api";

const STORAGE_KEY = "wattwise_demo_mode";

type DemoModeContextValue = {
  demoMode: boolean;
  enableDemoMode: () => void;
  disableDemoMode: () => void;
  toggleDemoMode: () => void;
};

const DemoModeContext = React.createContext<DemoModeContextValue | undefined>(undefined);

function readStoredDemoMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

// Make sure the very first API call already knows about demo mode.
setApiDemoMode(readStoredDemoMode());

export function DemoModeProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [demoMode, setDemoMode] = React.useState<boolean>(readStoredDemoMode);

  const enableDemoMode = React.useCallback(() => {
    setApiDemoMode(true);
    setDemoMode(true);
    try {
      window.sessionStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore storage failures */
    }
    // Every mounted query refetches instantly from the in-memory dataset.
    queryClient.invalidateQueries();
    toast.success("Mode Démo activé", {
      description: "Données de démonstration chargées — aucune connexion requise.",
    });
  }, [queryClient]);

  const disableDemoMode = React.useCallback(() => {
    setApiDemoMode(false);
    setDemoMode(false);
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore storage failures */
    }
    queryClient.invalidateQueries();
    toast.info("Mode Démo désactivé", {
      description: "Retour aux données temps réel.",
    });
  }, [queryClient]);

  const toggleDemoMode = React.useCallback(() => {
    if (demoMode) disableDemoMode();
    else enableDemoMode();
  }, [demoMode, enableDemoMode, disableDemoMode]);

  return (
    <DemoModeContext.Provider value={{ demoMode, enableDemoMode, disableDemoMode, toggleDemoMode }}>
      {children}
    </DemoModeContext.Provider>
  );
}

export function useDemoMode() {
  const ctx = React.useContext(DemoModeContext);
  if (!ctx) {
    throw new Error("useDemoMode must be used within a DemoModeProvider");
  }
  return ctx;
}
