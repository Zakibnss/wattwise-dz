"use client";

import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Send, X, Sparkles, Check, Zap } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { api } from "@/lib/api";
import { useEcoMode } from "@/hooks/useEcoMode";
import { CarbonReportDialog } from "@/components/reports/CarbonReportDialog";
import { InvestigationBubble } from "@/components/chat/InvestigationBubble";
import { toast } from "sonner";
import type { InvestigationResult } from "@/lib/api";

interface ChatAction {
  type: string;
  label: string;
}

interface MessageItem {
  role: "user" | "assistant";
  content: string;
  action?: ChatAction | null;
  actionExecuted?: boolean;
  investigation?: InvestigationResult | null;
}

const SUGGESTIONS = [
  "Pourquoi j'ai des alertes ?",
  "Bilan carbone",
  "Active le mode éco",
  "Je pars en vacances",
];

export function ChatWidget() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toggleEcoMode } = useEcoMode();

  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<MessageItem[]>([
    {
      role: "assistant",
      content:
        "Bonjour ! Je suis WATTY, votre assistant IA en gestion énergétique. Je peux vous aider à piloter le Mode Éco, analyser vos alertes FDD, suivre le solaire, simuler vos économies ou afficher votre Bilan Carbone.",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [carbonModalOpen, setCarbonModalOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      const timer = window.setTimeout(() => inputRef.current?.focus(), 150);
      return () => window.clearTimeout(timer);
    }
  }, [isOpen]);

  /**
   * Global "investigate" bus: any page can dispatch
   * `new CustomEvent("watty:investigate", { detail: { alertId } })` and the
   * chat opens with an inline InvestigationBubble (Étape 5.2).
   */
  useEffect(() => {
    const onInvestigate = (event: Event) => {
      const detail = (event as CustomEvent<{ alertId?: number }>).detail;
      const alertId = detail?.alertId;
      if (!alertId) return;
      setIsOpen(true);
      setMessages((prev) => [
        ...prev,
        { role: "user", content: `Enquêter sur l'alerte #${alertId}` },
      ]);
      api
        .investigate(alertId)
        .then((result) => {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: result.summary ?? "Voici les résultats de mon enquête.",
              investigation: result,
            },
          ]);
        })
        .catch(() => {
          toast.error("L'enquête WATTY a échoué");
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: "Désolé, l'enquête n'a pas abouti. Vérifiez la connexion puis réessayez.",
            },
          ]);
        });
    };
    window.addEventListener("watty:investigate", onInvestigate);
    return () => window.removeEventListener("watty:investigate", onInvestigate);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isLoading]);

  const executeAction = async (action: ChatAction, msgIndex: number) => {
    setMessages((prev) =>
      prev.map((m, idx) => (idx === msgIndex ? { ...m, actionExecuted: true } : m)),
    );

    try {
      if (action.type === "RESOLVE_ALERTS") {
        const res = await api.resolveAllAlerts("SALLE1");
        queryClient.invalidateQueries({ queryKey: ["alerts-active"] });
        toast.success(res.message || "Toutes les alertes ont été résolues");
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `✅ ${res.message || "Alertes résolues avec succès."}` },
        ]);
      } else if (action.type === "TOGGLE_ECO_MODE") {
        toggleEcoMode();
        queryClient.invalidateQueries({ queryKey: ["eco-mode"] });
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "⚡ Le Mode Éco a été basculé avec succès." },
        ]);
      } else if (action.type === "TOGGLE_VACATION_MODE") {
        api.toggleVacationMode().then(() => {
          queryClient.invalidateQueries({ queryKey: ["vacation-mode"] });
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: "🏖️ Le Mode Vacances a été activé. Votre maison est maintenant en surveillance autonome." },
          ]);
          toast.success("Mode Vacances activé");
        }).catch((err: any) => {
          toast.error(`Échec: ${err.message}`);
        });
      } else if (action.type === "SHOW_CARBON_REPORT" || action.type === "OPEN_CARBON_REPORT") {
        setCarbonModalOpen(true);
        toast.info("Affichage du Bilan Carbone");
      } else if (action.type === "OPEN_SIMULATOR") {
        navigate("/simulateur");
        setIsOpen(false);
        toast.info("Navigation vers le simulateur ROI");
      } else if (action.type === "SHOW_SOLAR") {
        navigate("/solar");
        setIsOpen(false);
        toast.info("Navigation vers la production solaire");
      } else if (action.type === "SHOW_SAVINGS") {
        navigate("/savings");
        setIsOpen(false);
        toast.info("Navigation vers les économies");
      } else if (action.type === "SHOW_FORECAST") {
        navigate("/forecast");
        setIsOpen(false);
        toast.info("Navigation vers les prévisions");
      } else {
        toast.info(`Action ${action.type} déclenchée`);
      }
    } catch (err: any) {
      toast.error(`Échec de l'action: ${err.message}`);
    }
  };

  const sendText = async (raw: string) => {
    const userMessage = raw.trim();
    if (!userMessage || isLoading) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setIsLoading(true);

    try {
      const response = await api.sendChatMessage(userMessage, "SALLE1");
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: response.reply, action: response.action },
      ]);
    } catch {
      toast.error("Erreur de communication avec WATTY");
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "Désolé, une erreur est survenue lors du traitement de votre demande. Veuillez vérifier la connexion ou réessayer.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    void sendText(input);
  };

  return (
    <>
      {/* Floating toggle button */}
      <Button
        onClick={() => setIsOpen((prev) => !prev)}
        className="fixed bottom-6 right-6 z-[60] flex h-auto items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-primary-foreground shadow-lg transition-all hover:bg-primary/90"
        aria-label={isOpen ? "Fermer l'assistant WATTY" : "Ouvrir l'assistant WATTY"}
        aria-expanded={isOpen}
      >
        <Sparkles className="h-4 w-4" aria-hidden="true" />
        <span className="text-sm font-semibold">WATTY IA</span>
      </Button>

      {/* Chat window */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="Assistant WATTY"
          aria-modal="false"
          className="fixed bottom-20 right-3 z-[70] flex h-[520px] max-h-[calc(100vh-6.5rem)] w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-250 sm:right-6 sm:w-[420px]"
        >
          {/* Header */}
          <div className="flex items-center justify-between bg-primary px-4 py-3 text-primary-foreground">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/20">
                <Sparkles className="h-4 w-4" aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-sm font-bold leading-tight">WATTY - Assistant IA</h3>
                <p className="text-[10px] text-primary-foreground/80">
                  Efficacité énergétique • WATTWISE DZ
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="rounded-md p-1 transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              aria-label="Fermer l'assistant WATTY"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Messages Area */}
          <div
            ref={scrollRef}
            role="log"
            aria-live="polite"
            aria-relevant="additions"
            aria-label="Conversation avec WATTY"
            className="flex-1 space-y-3.5 overflow-y-auto bg-background/50 p-4"
          >
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex max-w-[85%] flex-col gap-1.5 ${
                  msg.role === "user" ? "ml-auto items-end" : "mr-auto items-start"
                }`}
              >
                {msg.investigation ? (
                  <InvestigationBubble result={msg.investigation} />
                ) : (
                  <div
                    className={`rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed sm:text-sm ${
                      msg.role === "user"
                        ? "rounded-br-sm bg-primary text-primary-foreground"
                        : "rounded-bl-sm border border-border bg-muted text-foreground shadow-sm"
                    }`}
                  >
                    {msg.content}
                  </div>
                )}

                {/* Interactive Action Button from WATTY */}
                {msg.action && (
                  <div className="animate-in fade-in pt-0.5">
                    <Button
                      size="sm"
                      variant={msg.actionExecuted ? "outline" : "default"}
                      disabled={msg.actionExecuted}
                      onClick={() => executeAction(msg.action!, idx)}
                      aria-label={msg.action.label}
                      className={`h-8 cursor-pointer gap-1.5 text-xs shadow-sm ${
                        !msg.actionExecuted
                          ? "bg-eco font-medium text-white hover:bg-eco"
                          : "text-muted-foreground opacity-70"
                      }`}
                    >
                      {msg.actionExecuted ? (
                        <>
                          <Check className="h-3 w-3 text-eco" aria-hidden="true" />
                          Action effectuée
                        </>
                      ) : (
                        <>
                          <Zap className="h-3 w-3 fill-white" aria-hidden="true" />
                          {msg.action.label}
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            ))}

            {/* Typing indicator (3 bouncing dots) */}
            {isLoading && (
              <div
                className="mr-auto flex items-center gap-2 rounded-2xl rounded-bl-sm border border-border bg-muted px-3.5 py-2.5 text-xs text-muted-foreground"
                role="status"
                aria-label="WATTY est en train d'écrire"
              >
                <span className="flex items-end gap-1" aria-hidden="true">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:-0.3s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:-0.15s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary" />
                </span>
                <span>WATTY écrit…</span>
              </div>
            )}
          </div>

          {/* Suggestions */}
          <div className="border-t border-border bg-card px-3 pt-2">
            <div className="flex flex-wrap gap-1.5" aria-label="Suggestions de questions">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => void sendText(suggestion)}
                  disabled={isLoading}
                  aria-label={`Envoyer la suggestion : ${suggestion}`}
                  className="rounded-full border border-border bg-muted/60 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>

          {/* Input Bar */}
          <form onSubmit={sendMessage} className="border-t border-border bg-card p-3">
            <div className="flex gap-2">
              <Input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Posez une question ou demandez une action..."
                aria-label="Votre message pour WATTY"
                className="h-9 flex-1 text-xs sm:text-sm"
                disabled={isLoading}
              />
              <Button
                type="submit"
                disabled={!input.trim() || isLoading}
                size="sm"
                aria-label="Envoyer le message"
                className="h-9 gap-1 bg-primary px-3 text-primary-foreground"
              >
                <Send className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </div>
          </form>
        </div>
      )}

      <CarbonReportDialog open={carbonModalOpen} onOpenChange={setCarbonModalOpen} />
    </>
  );
}
