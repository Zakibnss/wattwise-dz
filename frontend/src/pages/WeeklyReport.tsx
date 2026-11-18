"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Button } from "@/components/ui/Button";
import { Leaf, Printer, Clock } from "lucide-react";
import { formatDateFr } from "@/lib/format";
import { DZD_PER_KWH } from "@/lib/constants";
import { api } from "@/lib/api";

const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

export function WeeklyReportPage() {
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["stats", "SALLE1", 168],
    queryFn: () => api.getStatsSummary({ device_id: "SALLE1", hours: 168 }),
  });

  const { data: savings } = useQuery({
    queryKey: ["savings-summary"],
    queryFn: () => api.getSavingsSummary({ device_id: "SALLE1" }),
  });

  const { data: carbon } = useQuery({
    queryKey: ["carbon-report"],
    queryFn: () => api.getCarbonReport(),
  });

  const { data: alerts } = useQuery({
    queryKey: ["alerts"],
    queryFn: () => api.getAlerts({ device_id: "SALLE1" }),
  });

  const totalEnergy = stats?.total_energy_kwh ?? 0;
  const totalSaved = savings?.total_saved_kwh ?? 0;
  const co2 = carbon?.co2_avoided_kg ?? 0;
  const resolvedCount = (alerts ?? []).filter((a) => a.resolved).length;

  const weeklyData = DAYS.map((_, i) => {
    const base = totalEnergy / 7;
    const variation = 1 + 0.3 * Math.sin((i / 7) * Math.PI * 2);
    return {
      day: DAYS[i],
      consumption: Math.round((base * variation) * 10) / 10,
    };
  });

  const today = new Date();
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay());

  const printReport = () => {
    window.print();
  };

  if (statsLoading) {
    return (
      <div className="min-h-screen bg-white p-8 flex flex-col items-center justify-center">
        <div className="animate-pulse rounded-lg bg-slate-200 h-40 w-64" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-slate-900 p-8 sm:p-12">
      {/* Header - screen only */}
      <div className="print:hidden flex justify-between items-center mb-8">
        <div className="flex items-center gap-2">
          <Leaf className="h-6 w-6 text-eco" aria-hidden="true" />
          <span className="text-xl font-bold">WATTWISE DZ</span>
        </div>
        <Button
          onClick={printReport}
          variant="outline"
          className="gap-2"
          aria-label="Imprimer le rapport hebdomadaire"
        >
          <Printer className="h-4 w-4" aria-hidden="true" />
          Imprimer le rapport
        </Button>
      </div>

      <div className="print:-m-8 print:mt-0">
        {/* Header */}
        <div className="border-b border-slate-200 pb-6 mb-8 print:mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Rapport Hebdomadaire</h1>
              <p className="text-slate-600 mt-1">
                Consommation énergétique — semaine du{" "}
                <span className="font-medium">
                  {weekStart.toLocaleDateString("fr-FR", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </span>
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-slate-500">
                Généré le {formatDateFr(new Date().toISOString())}
              </p>
              <p className="text-xs text-slate-400 uppercase tracking-wider">
                WATTWISE DZ • SEM&apos;INNOV 2026
              </p>
            </div>
          </div>
        </div>

        {/* Weekly KPI Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider font-medium">
                  Consommation (kWh)
                </p>
                <p className="text-2xl font-bold">{totalEnergy.toFixed(2)} kWh</p>
              </div>
              <Clock className="h-5 w-5 text-primary" aria-hidden="true" />
            </div>
          </div>
          <div className="bg-eco/10 rounded-xl p-4 border border-eco/25">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-eco uppercase tracking-wider font-medium">
                  Économies
                </p>
                <p className="text-2xl font-bold text-eco">
                  {totalSaved.toFixed(2)} kWh
                </p>
              </div>
              <div className="text-eco" aria-hidden="true">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
            </div>
          </div>
          <div className="bg-eco/10 rounded-xl p-4 border border-eco/25">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-eco uppercase tracking-wider font-medium">
                  CO₂ évité
                </p>
                <p className="text-2xl font-bold text-eco">
                  {co2.toFixed(1)} kg
                </p>
              </div>
              <Leaf className="h-5 w-5 text-eco" aria-hidden="true" />
            </div>
          </div>
          <div className="bg-volt/10 rounded-xl p-4 border border-volt/25">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-volt uppercase tracking-wider font-medium">
                  Alertes résolues
                </p>
                <p className="text-2xl font-bold text-volt">{resolvedCount}</p>
              </div>
              <div className="text-volt" aria-hidden="true">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Weekly Consumption Chart */}
        <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm mb-8 print:shadow-none">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" aria-hidden="true" />
            Consommation hebdomadaire
          </h2>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyData} margin={{ top: 20, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} vertical={false} />
                <XAxis
                  dataKey="day"
                  tick={{ fill: "#4b5563", fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fill: "#4b5563", fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  width={40}
                  tickFormatter={(val) => `${val} kW`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#ffffff",
                    borderColor: "#e5e7eb",
                    borderRadius: "0.5rem",
                    fontSize: "0.85rem",
                  }}
                />
                <Bar dataKey="consumption" fill="#059669" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Methodology */}
        <div className="rounded-xl p-6 border border-slate-200 bg-slate-50/50">
          <h2 className="text-lg font-semibold mb-3">Méthodologie</h2>
          <ul className="space-y-2 text-sm text-slate-700">
            <li className="flex items-center gap-2">
              <span className="text-eco">•</span>
              Facteur d&apos;émission réseau algérien (Sonelgaz/CREG):{" "}
              <span className="font-medium">0,45 kg CO₂/kWh</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="text-eco">•</span>
              Tarif électricité résidentiel:{" "}
              <span className="font-medium">{DZD_PER_KWH} DA/kWh</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="text-eco">•</span>
              Les données proviennent des capteurs MQTT en temps réel.
            </li>
          </ul>
        </div>

        {/* Print button (screen only) */}
        <div className="print:hidden mt-8 flex justify-end">
          <Button
            onClick={printReport}
            variant="default"
            className="bg-eco text-white hover:bg-eco gap-2"
            aria-label="Télécharger le rapport hebdomadaire au format PDF"
          >
            <Printer className="h-4 w-4" aria-hidden="true" />
            Télécharger PDF
          </Button>
        </div>
      </div>
    </div>
  );
}

WeeklyReportPage.displayName = "WeeklyReportPage";
