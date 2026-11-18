"use client";

import React, { useState } from "react";
import {
  BrainCircuit,
  ChevronDown,
  ChevronRight,
  Download,
  Search,
  CircleDot,
} from "lucide-react";
import { Button, cn } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import type { InvestigationResult } from "@/lib/api";

/** Confidence bar colour: green > 70 %, amber 40–70 %, red < 40 %. */
function confidenceTone(confidence: number): {
  bar: string;
  text: string;
  label: string;
} {
  if (confidence > 70)
    return { bar: "bg-eco", text: "text-eco", label: "Élevée" };
  if (confidence >= 40)
    return { bar: "bg-warning", text: "text-warning", label: "Moyenne" };
  return { bar: "bg-destructive", text: "text-destructive", label: "Faible" };
}

function CollapsibleSection({
  title,
  items,
  icon: Icon,
  emptyText,
}: {
  title: string;
  items: string[];
  icon: typeof CircleDot;
  emptyText: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-border/70 bg-background/40">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {open ? (
          <ChevronDown className="h-3 w-3" aria-hidden="true" />
        ) : (
          <ChevronRight className="h-3 w-3" aria-hidden="true" />
        )}
        <Icon className="h-3 w-3" aria-hidden="true" />
        {title}
        <span className="ml-auto font-mono text-[10px]">({items.length})</span>
      </button>
      {open && (
        <div className="space-y-1 border-t border-border/60 px-3 py-2">
          {items.length === 0 ? (
            <p className="text-[11px] italic text-muted-foreground">{emptyText}</p>
          ) : (
            items.map((item, idx) => (
              <p key={idx} className="text-[11px] leading-relaxed text-foreground/85">
                • {item}
              </p>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/** Builds and downloads a plain-text investigation report. */
export function downloadInvestigationReport(result: InvestigationResult) {
  const lines: string[] = [
    "RÉSUMÉ",
    result.summary ?? "",
    "",
    `Source : ${result.source === "llm" ? "WATTY (LLM)" : "Moteur de règles"}`,
    `Généré le : ${new Date(result.generated_at).toLocaleString("fr-FR")}`,
    "",
  ];
  result.hypotheses.forEach((h, i) => {
    lines.push(`HYPOTHÈSE ${i + 1} — confiance ${h.confidence} % (${confidenceTone(h.confidence).label})`);
    lines.push(`Cause : ${h.cause}`);
    lines.push("Preuves :");
    (h.evidence.length ? h.evidence : ["Aucune preuve disponible"]).forEach((e) =>
      lines.push(`  - ${e}`),
    );
    lines.push("Données manquantes :");
    (h.missing_data.length ? h.missing_data : ["Aucune"]).forEach((m) =>
      lines.push(`  - ${m}`),
    );
    lines.push(`Action recommandée : ${h.recommended_action}`);
    lines.push("");
  });
  lines.push("WATTWISE DZ © 2026 — SEM'INNOV Challenge");

  const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `wattwise-investigation-alerte-${result.alert_id}.txt`;
  link.click();
  URL.revokeObjectURL(url);
}

export function InvestigationBubble({
  result,
  className,
}: {
  result: InvestigationResult;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "w-[92%] max-w-[360px] rounded-2xl rounded-bl-sm border border-primary/25 bg-card p-3 shadow-sm",
        className,
      )}
      role="article"
      aria-label="Rapport d'investigation WATTY"
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/12 text-primary">
          <BrainCircuit className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-foreground">Enquête WATTY</p>
          <p className="text-[10px] text-muted-foreground">
            {result.source === "llm" ? "IA explicable (Groq)" : "Moteur de règles"} ·{" "}
            {result.hypotheses.length} hypothèses
          </p>
        </div>
        <Badge variant="volt">Alerte #{result.alert_id}</Badge>
      </div>

      <div className="space-y-2.5">
        {result.hypotheses.map((hyp, idx) => {
          const tone = confidenceTone(hyp.confidence);
          return (
            <div
              key={idx}
              className="rounded-lg border border-border/80 bg-background/50 p-2.5"
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[11px] font-semibold leading-snug text-foreground">
                  <span className="font-mono text-[10px] text-muted-foreground">
                    H{idx + 1} ·{" "}
                  </span>
                  {hyp.cause}
                </p>
                <span className={cn("shrink-0 font-mono text-[11px] font-bold", tone.text)}>
                  {hyp.confidence}%
                </span>
              </div>
              <div
                className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuenow={hyp.confidence}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Confiance hypothèse ${idx + 1} : ${hyp.confidence} %`}
              >
                <div
                  className={cn("h-full rounded-full transition-all", tone.bar)}
                  style={{ width: `${hyp.confidence}%` }}
                />
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Confiance {tone.label.toLowerCase()}
                {hyp.evidence.length > 0 && ` · ${hyp.evidence.length} preuve(s)`}
              </p>
              <div className="mt-2 space-y-1.5">
                <CollapsibleSection
                  title="Voir les preuves"
                  items={hyp.evidence}
                  icon={Search}
                  emptyText="Aucune preuve directe dans les données actuelles."
                />
                <CollapsibleSection
                  title="Données manquantes"
                  items={hyp.missing_data}
                  icon={CircleDot}
                  emptyText="Aucune donnée manquante identifiée."
                />
              </div>
              <p className="mt-2 rounded-md bg-primary/8 px-2 py-1.5 text-[11px] leading-relaxed text-foreground/90">
                <span className="font-semibold text-primary">Action : </span>
                {hyp.recommended_action}
              </p>
            </div>
          );
        })}
      </div>

      {result.summary && (
        <p className="mt-2.5 text-[11px] leading-relaxed text-muted-foreground">
          {result.summary}
        </p>
      )}

      <Button
        size="sm"
        variant="outline"
        className="mt-2.5 h-7 w-full cursor-pointer gap-1.5 text-[11px]"
        onClick={() => downloadInvestigationReport(result)}
        aria-label="Générer un rapport d'investigation"
      >
        <Download className="h-3 w-3" aria-hidden="true" />
        Générer un rapport d&apos;investigation
      </Button>
    </div>
  );
}
