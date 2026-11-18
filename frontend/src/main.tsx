import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router/dom";
import { createBrowserRouter } from "react-router";
import { Dashboard } from "./pages/Dashboard";
import { AlertsPage } from "./pages/Alerts";
import { ActionCenter } from "./pages/ActionCenter";
// Building page lazy: pulls in the heavy three.js/R3F scene.
import { ForecastPage } from "./pages/Forecast";
import { SavingsPage } from "./pages/Savings";
import { SettingsPage } from "./pages/Settings";
import { CarbonReportPage } from "./pages/CarbonReport";
import { WeeklyReportPage } from "./pages/WeeklyReport";
import { App } from "./App";
import { ThemeProvider } from "@/hooks/useTheme";
import { DemoModeProvider } from "@/hooks/useDemoMode";
import "./index.css";

// Heavy, demo-only pages are lazy-loaded so the initial bundle stays small.
const SimulatorPage = React.lazy(() =>
  import("./pages/Simulator").then((module) => ({ default: module.SimulatorPage })),
);
const SolarPage = React.lazy(() =>
  import("./pages/Solar").then((module) => ({ default: module.SolarPage })),
);
// Building page: pulls in the heavy three.js / R3F scene, lazy-loaded.
const BuildingPage = React.lazy(() =>
  import("./pages/Building").then((module) => ({ default: module.Building })),
);

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: "building", element: <BuildingPage /> },
      { path: "actions", element: <ActionCenter /> },
      { path: "alerts", element: <AlertsPage /> },
      { path: "forecast", element: <ForecastPage /> },
      { path: "savings", element: <SavingsPage /> },
      { path: "simulateur", element: <SimulatorPage /> },
      { path: "solar", element: <SolarPage /> },
      { path: "carbon", element: <CarbonReportPage /> },
      { path: "settings", element: <SettingsPage /> },
      { path: "report/weekly", element: <WeeklyReportPage /> },
    ],
  },
]);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      retry: 1,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <DemoModeProvider>
          <RouterProvider router={router} />
        </DemoModeProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </React.StrictMode>
);
