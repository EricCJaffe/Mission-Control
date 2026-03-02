'use client';

import { useMemo } from 'react';
import { AlertTriangle, ShieldCheck, ShieldAlert, Info } from 'lucide-react';
import { checkInteractions, type DetectedInteraction, type InteractionSeverity } from '@/lib/fitness/interaction-rules';

type Props = {
  medications: Array<{ name: string; active?: boolean }>;
};

const SEVERITY_STYLES: Record<InteractionSeverity, { bg: string; border: string; text: string; badge: string }> = {
  CRITICAL: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800', badge: 'bg-red-100 text-red-700' },
  HIGH: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-800', badge: 'bg-orange-100 text-orange-700' },
  MEDIUM: { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-800', badge: 'bg-yellow-100 text-yellow-700' },
  LOW: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-800', badge: 'bg-blue-100 text-blue-700' },
};

export default function InteractionChecker({ medications }: Props) {
  const interactions = useMemo(() => checkInteractions(medications), [medications]);

  if (interactions.length === 0) {
    return (
      <div className="rounded-2xl border border-green-200 bg-green-50 p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-5 w-5 text-green-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-green-800">No Known Interactions Detected</p>
            <p className="text-xs text-green-600 mt-0.5">
              Your current regimen has no flagged hardcoded interactions. Use &quot;Analyze My Stack&quot; above for AI-powered deep analysis.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const criticalCount = interactions.filter(i => i.rule.severity === 'CRITICAL').length;
  const highCount = interactions.filter(i => i.rule.severity === 'HIGH').length;
  const beneficialIds = ['statin-coq10-depletion']; // Mark beneficial interactions

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-amber-600" />
          <h3 className="text-lg font-semibold text-slate-900">Interaction Alerts</h3>
        </div>
        <div className="flex gap-2">
          {criticalCount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
              {criticalCount} Critical
            </span>
          )}
          {highCount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
              {highCount} High
            </span>
          )}
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
            {interactions.length} Total
          </span>
        </div>
      </div>

      <p className="text-xs text-slate-500">
        Instant checks based on known cardiac medication rules. These supplement the AI analysis above.
      </p>

      {/* Interaction Cards */}
      <div className="space-y-3">
        {interactions.map((interaction: DetectedInteraction) => {
          const isBeneficial = beneficialIds.includes(interaction.rule.id);
          const styles = SEVERITY_STYLES[interaction.rule.severity];

          return (
            <div
              key={interaction.rule.id}
              className={`rounded-xl border p-4 ${isBeneficial ? 'border-green-200 bg-green-50' : `${styles.border} ${styles.bg}`}`}
            >
              <div className="flex items-start gap-3">
                {isBeneficial ? (
                  <Info className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                ) : (
                  <AlertTriangle className={`h-4 w-4 mt-0.5 flex-shrink-0 ${styles.text}`} />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={`text-sm font-semibold ${isBeneficial ? 'text-green-800' : styles.text}`}>
                      {interaction.rule.title}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isBeneficial ? 'bg-green-100 text-green-700' : styles.badge}`}>
                      {isBeneficial ? 'BENEFICIAL' : interaction.rule.severity}
                    </span>
                    <span className="text-xs text-slate-400">{interaction.rule.category}</span>
                  </div>
                  <p className="text-xs text-slate-500 mb-1">
                    {interaction.medicationA === interaction.medicationB
                      ? interaction.medicationA
                      : `${interaction.medicationA} + ${interaction.medicationB}`}
                  </p>
                  <p className={`text-xs ${isBeneficial ? 'text-green-700' : styles.text} mb-2`}>
                    {interaction.rule.description}
                  </p>
                  <p className="text-xs font-medium text-slate-700">
                    {interaction.rule.recommendation}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Disclaimer */}
      <p className="text-xs text-slate-400 text-center pt-1">
        Based on known cardiac medication interactions. Always consult your cardiologist for changes.
      </p>
    </div>
  );
}
