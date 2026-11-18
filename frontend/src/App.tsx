import * as React from "react";
import { Outlet, useLocation } from "react-router";
import { Toaster, toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ChatWidget } from "@/components/chat/ChatWidget";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { useEcoMode } from "@/hooks/useEcoMode";
import { useDemoMode } from "@/hooks/useDemoMode";
import { VacationBanner } from "@/components/widgets/VacationBanner";
import { api } from "@/lib/api";
import { cn } from "@/components/ui/Button";
import { Leaf, FlaskConical } from "lucide-react";

export function App() {
  const { ecoMode } = useEcoMode();
  const { demoMode } = useDemoMode();
  const queryClient = useQueryClient();
  const { data: vacationMode, isLoading: vacationLoading } = useQuery({
    queryKey: ["vacation-mode"],
    queryFn: () => api.getVacationMode(),
  });

  // Jury demo mode (V3 Étape 7): banner whenever the backend has an active
  // demo anomaly; polls every 30 s and after any invalidation.
  const { data: juryDemoStatus } = useQuery({
    queryKey: ["demo-status"],
    queryFn: () => api.getDemoStatus(),
    refetchInterval: 30000,
  });
  const resetJuryDemo = useMutation({
    mutationFn: () => api.resetDemo(),
    onSuccess: (res) => {
      toast.success("Démo réinitialisée", { description: res.message });
      queryClient.invalidateQueries();
    },
    onError: (error: Error) =>
      toast.error("Réinitialisation impossible", { description: error.message }),
  });
  const location = useLocation();

  return (
    <div className={cn("flex h-screen w-full overflow-hidden app-canvas")}>
      {/* Sidebar: control-room rail, fixed width */}
      <aside className="hidden h-full w-[248px] flex-shrink-0 overflow-y-auto border-r border-sidebar-border bg-sidebar md:block">
        <Sidebar />
      </aside>

      {/* Main content area */}
      <div className="flex h-full flex-1 flex-col overflow-hidden">
        {ecoMode && (
          <div
            role="status"
            className="flex items-center justify-center gap-2 border-b border-eco/30 bg-eco/12 px-4 py-1.5 text-center text-[11px] font-semibold uppercase tracking-[0.12em] text-eco"
          >
            <Leaf className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>Mode Éco actif — effacement de charge en cours</span>
          </div>
        )}

        {demoMode && (
          <div
            role="status"
            className="flex items-center justify-center gap-2 border-b border-warning/30 bg-warning/12 px-4 py-1 text-center text-[11px] font-semibold uppercase tracking-[0.12em] text-warning"
          >
            <FlaskConical className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>Mode Démo — données simulées</span>
          </div>
        )}

        {juryDemoStatus?.active && (
          <div
            role="status"
            className="flex items-center justify-center gap-2 border-b border-destructive/30 bg-destructive/12 px-4 py-1.5 text-center text-[11px] font-semibold uppercase tracking-[0.12em] text-destructive"
          >
            <FlaskConical className="h-3.5 w-3.5 shrink-0 animate-pulse" aria-hidden="true" />
            <span>Mode Démo Actif — anomalie S102 injectée pour le jury</span>
            <button
              type="button"
              onClick={() => resetJuryDemo.mutate()}
              className="ml-2 cursor-pointer rounded-full border border-destructive/40 px-2 py-0.5 text-[10px] font-bold normal-case tracking-normal transition-colors hover:bg-destructive/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Réinitialiser le mode démo"
            >
              {resetJuryDemo.isPending ? "Réinitialisation…" : "Réinitialiser"}
            </button>
          </div>
        )}

        {!vacationLoading && vacationMode?.vacation_mode && (
          <VacationBanner
            vacationMode={true}
            onToggle={() => {
              api.toggleVacationMode(false);
            }}
          />
        )}

        {/*
         * Header: sticky top.
         * `relative z-40` is required: the backdrop blur creates a stacking
         * context, and without an explicit z-index the popovers opened here
         * (notifications, search) would paint underneath the dashboard cards.
         */}
        <header className="relative z-40 flex h-16 flex-shrink-0 items-center justify-between border-b border-border/80 bg-background/70 px-3 backdrop-blur-xl sm:px-6">
          <Header />
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="flex min-h-full flex-col">
            <div className="flex-1 p-3 sm:p-6 lg:p-8">
              <React.Suspense fallback={<PageSkeleton />}>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={location.pathname}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <Outlet />
                  </motion.div>
                </AnimatePresence>
              </React.Suspense>
            </div>
            <Footer />
          </div>
        </main>
      </div>

      <ChatWidget />

      <Toaster
        richColors
        position="top-right"
        closeButton
        toastOptions={{ className: "font-sans" }}
      />
    </div>
  );
}

export default App;
