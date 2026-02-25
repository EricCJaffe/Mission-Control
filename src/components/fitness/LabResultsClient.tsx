'use client';

import { useState } from 'react';

type LabResult = {
  id: string;
  lab_date: string;
  lab_type: string;
  provider: string | null;
  file_name: string | null;
  ai_analysis: string | null;
  ai_flags: { flag: string; severity: 'info' | 'warning' | 'critical' }[] | null;
  parsed_results: Record<string, unknown> | null;
  notes: string | null;
  created_at: string;
};

const LAB_TYPES = [
  { value: 'bloodwork', label: 'General Bloodwork' },
  { value: 'lipid_panel', label: 'Lipid Panel' },
  { value: 'cbc', label: 'CBC (Complete Blood Count)' },
  { value: 'cmp', label: 'CMP (Comprehensive Metabolic)' },
  { value: 'thyroid', label: 'Thyroid Panel' },
  { value: 'a1c', label: 'Hemoglobin A1C' },
  { value: 'cardiac_markers', label: 'Cardiac Markers (Troponin, BNP)' },
  { value: 'imaging', label: 'Imaging (X-ray, CT, MRI)' },
  { value: 'stress_test', label: 'Stress Test' },
  { value: 'ecg', label: 'ECG / EKG' },
  { value: 'echo', label: 'Echocardiogram' },
  { value: 'other', label: 'Other' },
];

export default function LabResultsClient({ results }: { results: LabResult[] }) {
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedResult, setSelectedResult] = useState<LabResult | null>(null);

  // Form state
  const [labDate, setLabDate] = useState(new Date().toISOString().slice(0, 10));
  const [labType, setLabType] = useState('bloodwork');
  const [provider, setProvider] = useState('');
  const [rawText, setRawText] = useState('');
  const [notes, setNotes] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      const res = await fetch('/api/fitness/labs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lab_date: labDate, lab_type: labType, provider: provider || null, raw_text: rawText, notes: notes || null }),
      });

      if (res.ok) {
        setShowForm(false);
        setRawText('');
        setNotes('');
        window.location.reload();
      }
    } catch { /* handled by UI */ }
    setSaving(false);
  }

  const severityClasses = {
    info: 'text-blue-700 bg-blue-50',
    warning: 'text-amber-700 bg-amber-50',
    critical: 'text-red-700 bg-red-50',
  };

  return (
    <div className="space-y-4">
      {/* Action Bar */}
      <div className="flex gap-2">
        <button onClick={() => setShowForm(!showForm)} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          {showForm ? 'Cancel' : 'Upload Lab Results'}
        </button>
      </div>

      {/* Upload Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Lab Date</label>
              <input type="date" value={labDate} onChange={e => setLabDate(e.target.value)} required className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Type</label>
              <select value={labType} onChange={e => setLabType(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm">
                {LAB_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Provider / Lab</label>
            <input type="text" value={provider} onChange={e => setProvider(e.target.value)} placeholder="e.g., Quest Diagnostics" className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Results Text <span className="text-slate-400">(paste or type your lab values)</span>
            </label>
            <textarea value={rawText} onChange={e => setRawText(e.target.value)} required rows={8} placeholder="Paste your lab results here. Include test names, values, units, and reference ranges if available.&#10;&#10;Example:&#10;Total Cholesterol: 185 mg/dL (Ref: <200)&#10;LDL: 110 mg/dL (Ref: <100)&#10;HDL: 52 mg/dL (Ref: >40)&#10;Triglycerides: 120 mg/dL (Ref: <150)" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Notes (optional)</label>
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g., Fasting blood draw" className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm" />
          </div>
          <button type="submit" disabled={saving || !rawText.trim()} className="w-full rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Analyzing...' : 'Upload & Analyze'}
          </button>
        </form>
      )}

      {/* Detail View */}
      {selectedResult && (
        <div className="rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">{LAB_TYPES.find(t => t.value === selectedResult.lab_type)?.label ?? selectedResult.lab_type}</h2>
            <button onClick={() => setSelectedResult(null)} className="text-xs text-slate-400 hover:text-slate-600">Close</button>
          </div>
          <p className="text-xs text-slate-500">{selectedResult.lab_date} {selectedResult.provider ? `— ${selectedResult.provider}` : ''}</p>

          {/* AI Flags */}
          {selectedResult.ai_flags && selectedResult.ai_flags.length > 0 && (
            <div className="space-y-1">
              {selectedResult.ai_flags.map((f, i) => (
                <div key={i} className={`rounded-lg px-3 py-1.5 text-xs ${severityClasses[f.severity]}`}>
                  {f.flag}
                </div>
              ))}
            </div>
          )}

          {/* Parsed Results Table */}
          {selectedResult.parsed_results && Object.keys(selectedResult.parsed_results).length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-left text-slate-500">
                    <th className="py-1 pr-3">Test</th>
                    <th className="py-1 pr-3">Value</th>
                    <th className="py-1 pr-3">Reference</th>
                    <th className="py-1">Flag</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(selectedResult.parsed_results).map(([name, data]) => {
                    const d = data as { value: unknown; unit?: string; reference_range?: string; flag?: string };
                    return (
                      <tr key={name} className="border-b border-slate-50">
                        <td className="py-1 pr-3 font-medium">{name}</td>
                        <td className="py-1 pr-3">{String(d.value)} {d.unit ?? ''}</td>
                        <td className="py-1 pr-3 text-slate-400">{d.reference_range ?? '—'}</td>
                        <td className="py-1">
                          {d.flag && d.flag !== 'normal' && (
                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${d.flag === 'critical' ? 'bg-red-100 text-red-700' : d.flag === 'high' || d.flag === 'low' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                              {d.flag}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* AI Analysis */}
          {selectedResult.ai_analysis && (
            <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
              {selectedResult.ai_analysis}
            </div>
          )}
        </div>
      )}

      {/* Results List */}
      {results.length === 0 && !showForm && (
        <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">
          No lab results yet. Upload your bloodwork to get AI-powered analysis in context of your cardiac health.
        </div>
      )}

      {results.length > 0 && !selectedResult && (
        <div className="space-y-2">
          {results.map((r) => (
            <button key={r.id} onClick={() => setSelectedResult(r)} className="w-full text-left rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm hover:shadow transition">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">{LAB_TYPES.find(t => t.value === r.lab_type)?.label ?? r.lab_type}</p>
                  <p className="text-xs text-slate-500">{r.lab_date} {r.provider ? `— ${r.provider}` : ''}</p>
                </div>
                <div className="flex gap-1">
                  {r.ai_flags?.filter(f => f.severity !== 'info').map((f, i) => (
                    <span key={i} className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${severityClasses[f.severity]}`}>
                      {f.severity}
                    </span>
                  ))}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
