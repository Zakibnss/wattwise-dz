import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, EcoModeResponse } from "@/lib/api";
import { toast } from "sonner";

export function useEcoMode() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<EcoModeResponse>({
    queryKey: ["eco-mode"],
    queryFn: () => api.getEcoMode(),
    refetchInterval: 10000,
  });

  const toggleMutation = useMutation({
    mutationFn: (enabled?: boolean) => api.toggleEcoMode(enabled),
    onSuccess: (res) => {
      queryClient.setQueryData(["eco-mode"], res);
      queryClient.invalidateQueries({ queryKey: ["alerts-active"] });
      if (res.eco_mode) {
        toast.success("Mode Éco activé", {
          description: "Mode Éco activé : réduction de consommation en cours.",
        });
      } else {
        toast.info("Mode Éco désactivé", {
          description: "Fonctionnement standard rétabli.",
        });
      }
    },
    onError: () => {
      toast.error("Impossible de modifier le Mode Éco");
    },
  });

  return {
    ecoMode: Boolean(data?.eco_mode),
    peakHours: data?.peak_hours || "18h - 20h",
    isLoading,
    toggleEcoMode: (enabled?: boolean) => toggleMutation.mutate(enabled),
    isToggling: toggleMutation.isPending,
  };
}
