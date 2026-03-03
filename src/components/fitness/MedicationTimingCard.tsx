'use client';

import { useState, useEffect } from 'react';
import { Pill, X, Clock } from 'lucide-react';

type MedInfo = {
  name: string;
  timing: string | null;
  type: string;
};

/**
 * Shows a medication timing reminder card in the workout logger.
 * Fetches the user's active medications and displays timing-relevant info
 * like beta-blocker effects on heart rate and pre/post-workout considerations.
 */
export default function MedicationTimingCard() {
  const [meds, setMeds] = useState<MedInfo[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/fitness/medications?active=true')
      .then(res => res.json())
      .then(data => {
        if (data.medications) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setMeds(data.medications.map((m: any) => ({
            name: m.name || m.medication_name,
            timing: m.timing,
            type: m.type || m.medication_type,
          })));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (dismissed || loading || meds.length === 0) return null;

  const hasBetaBlocker = meds.some(m =>
    m.name.toLowerCase().includes('carvedilol') ||
    m.name.toLowerCase().includes('metoprolol') ||
    m.name.toLowerCase().includes('atenolol')
  );

  const hasBloodThinner = meds.some(m =>
    m.name.toLowerCase().includes('aspirin') ||
    m.name.toLowerCase().includes('warfarin') ||
    m.name.toLowerCase().includes('eliquis')
  );

  const warnings: string[] = [];
  if (hasBetaBlocker) {
    warnings.push('Beta-blocker active: HR will be suppressed ~15-20 bpm. Use RPE over HR for intensity.');
  }
  if (hasBloodThinner) {
    warnings.push('Blood thinner active: Avoid exercises with high fall/impact risk.');
  }

  const prescriptions = meds.filter(m => m.type === 'prescription' || m.type === 'rx');

  return (
    <div className="rounded-2xl border border-purple-100 bg-purple-50 p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <Pill className="h-4 w-4 text-purple-600 flex-shrink-0" />
          <h3 className="text-sm font-semibold text-purple-800">Medication Awareness</h3>
        </div>
        <button onClick={() => setDismissed(true)} className="text-purple-400 hover:text-purple-600">
          <X className="h-4 w-4" />
        </button>
      </div>

      {warnings.length > 0 && (
        <div className="mt-2 space-y-1">
          {warnings.map((w, i) => (
            <p key={i} className="text-xs text-purple-700">{w}</p>
          ))}
        </div>
      )}

      {prescriptions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {prescriptions.map((m, i) => (
            <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-100 text-xs text-purple-700">
              <Clock className="h-3 w-3" />
              {m.name}{m.timing ? ` (${m.timing})` : ''}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
