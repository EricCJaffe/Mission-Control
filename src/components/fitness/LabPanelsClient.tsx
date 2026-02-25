'use client';

import { useState } from 'react';
import type { LabResultFlag } from '@/lib/fitness/types';

type PanelSummary = {
  id: string;
  panel_date: string;
  lab_name: string | null;
  ordering_provider: string | null;
  source_type: string;
  ai_extracted: boolean;
  ai_summary: string | null;
  fasting: boolean | null;
  notes: string | null;
  result_count?: number;
  flag_count?: number;
};

type LabResultRow = {
  id: string;
  test_name: string;
  test_category: string | null;
  value: number | null;
  value_text: string | null;
  unit: string | null;
  reference_low: number | null;
  reference_high: number | null;
  reference_range_text: string | null;
  flag: LabResultFlag;
  ai_interpretation: string | null;
  ai_trend_note: string | null;
};

type PanelDetail = PanelSummary & { results: LabResultRow[] };

const FLAG_BADGE: Record<string, string> = {
  normal: 'bg-green-100 text-green-700',
  low: 'bg-blue-100 text-blue-700',
  high: 'bg-amber-100 text-amber-700',
  critical_low: 'bg-red-100 text-red-700',
  critical_high: 'bg-red-100 text-red-700',
};

export default function LabPanelsClient({ panels: initial }: { panels: PanelSummary[] }) {
  const [panels, setPanels] = useState(initial);
  const [showAdd, setShowAdd] = useState(false);
  const [selectedPanel, setSelectedPanel] = useState<PanelDetail | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Add form
  const [panelDate, setPanelDate] = useState('');
  const [labName, setLabName] = useState('');
  const [provider, setProvider] = useState('');
  const [rawText, setRawText] = useState('');
  const [fasting, setFasting] = useState(false);
  const [notes, setNotes] = useState('');

  async function handleAdd() {
    if (!panelDate || !rawText) return;
    setSaving(true); setError(null);
    try {
      const res = await fetch('/api/fitness/labs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          panel_date: panelDate,
          lab_name: labName || null,
          ordering_provider: provider || null,
          raw_text: rawText,
          fasting: fasting || null,
          notes: notes || null,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setPanels(prev => [{ ...data.panel, result_count: data.panel.results?.length ?? 0, flag_count: data.panel.results?.filter((r: LabResultRow) => r.flag !== 'normal').length ?? 0 }, ...prev]);
        setSelectedPanel(data.panel);
        setShowAdd(false);
        setPanelDate(''); setLabName(''); setProvider(''); setRawText(''); setFasting(false); setNotes('');
      } else { setError(data.error || 'Failed to upload lab panel'); }
    } catch { setError('Network error — could not upload lab panel'); }
    setSaving(false);
  }

  async function handleViewPanel(panelId: string) {
    setLoadingDetail(true); setError(null);
    try {
      const res = await fetch(`/api/fitness/labs?panel_id=${panelId}`);
      const data = await res.json();
      if (data.panel) setSelectedPanel(data.panel);
      else setError('Failed to load panel details');
    } catch { setError('Network error — could not load panel'); }
    setLoadingDetail(false);
  }

  async function handleDeletePanel(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/fitness/labs?panel_id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.ok) {
        setPanels(prev => prev.filter(p => p.id !== id));
        if (selectedPanel?.id === id) setSelectedPanel(null);
        setConfirmDeleteId(null);
      } else { setError(data.error || 'Failed to delete panel'); }
    } catch { setError('Network error — could not delete panel'); }
  }

  const errorBanner = error ? (
    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-center justify-between">
      <p className="text-sm text-red-700">{error}</p>
      <button onClick={() => setError(null)} className="text-xs text-red-500 hover:text-red-700">Dismiss</button>
    </div>
  ) : null;

  // Detail view
  if (selectedPanel) {
    const abnormal = selectedPanel.results?.filter(r => r.flag !== 'normal') ?? [];
    return (
      <div className="space-y-4">
        {errorBanner}
        <button onClick={() => setSelectedPanel(null)} className="text-xs text-slate-400 hover:text-slate-600">← Back to panels</button>

        <div className="rounded-2xl border border-white/80 bg-white/70 p-5 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">
                {selectedPanel.lab_name || 'Lab Panel'}
              </h2>
              <p className="text-sm text-slate-500">
                {new Date(selectedPanel.panel_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                {selectedPanel.ordering_provider && ` · ${selectedPanel.ordering_provider}`}
                {selectedPanel.fasting && ' · Fasting'}
              </p>
            </div>
            <span className="text-xs font-medium rounded-full px-2.5 py-1 bg-slate-100 text-slate-600">
              {selectedPanel.results?.length ?? 0} tests
            </span>
          </div>
        </div>

        {/* AI Summary */}
        {selectedPanel.ai_summary && (
          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 shadow-sm">
            <h3 className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-1">AI Summary</h3>
            <p className="text-sm text-blue-800">{selectedPanel.ai_summary}</p>
          </div>
        )}

        {/* Flagged results */}
        {abnormal.length > 0 && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-amber-800 mb-2">Flagged Results ({abnormal.length})</h3>
            <div className="space-y-2">
              {abnormal.map(r => (
                <div key={r.id} className="flex items-center justify-between text-sm">
                  <div>
                    <span className="font-medium text-amber-900">{r.test_name}</span>
                    <span className="text-amber-700 ml-2">{r.value ?? r.value_text} {r.unit}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-amber-600">{r.reference_range_text}</span>
                    <span className={`text-xs font-medium rounded-full px-2 py-0.5 ${FLAG_BADGE[r.flag]}`}>{r.flag}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* All results table */}
        {selectedPanel.results && selectedPanel.results.length > 0 && (
          <div className="rounded-2xl border border-white/80 bg-white/70 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-700">All Results</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-500 border-b border-slate-100">
                    <th className="px-4 py-2 text-left font-medium">Test</th>
                    <th className="px-4 py-2 text-right font-medium">Value</th>
                    <th className="px-4 py-2 text-right font-medium">Ref Range</th>
                    <th className="px-4 py-2 text-center font-medium">Flag</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedPanel.results.map(r => (
                    <tr key={r.id}>
                      <td className="px-4 py-2">
                        <p className="text-slate-700 font-medium">{r.test_name}</p>
                        {r.ai_interpretation && <p className="text-xs text-slate-400 mt-0.5">{r.ai_interpretation}</p>}
                        {r.ai_trend_note && <p className="text-xs text-blue-500 mt-0.5">{r.ai_trend_note}</p>}
                      </td>
                      <td className="px-4 py-2 text-right font-mono tabular-nums">
                        {r.value ?? r.value_text} {r.unit && <span className="text-xs text-slate-400">{r.unit}</span>}
                      </td>
                      <td className="px-4 py-2 text-right text-xs text-slate-400">{r.reference_range_text ?? '—'}</td>
                      <td className="px-4 py-2 text-center">
                        <span className={`text-xs font-medium rounded-full px-2 py-0.5 ${FLAG_BADGE[r.flag] ?? FLAG_BADGE.normal}`}>
                          {r.flag}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Notes */}
        {selectedPanel.notes && (
          <div className="rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Notes</h3>
            <p className="text-sm text-slate-700">{selectedPanel.notes}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {errorBanner}

      {/* Add panel form */}
      {showAdd ? (
        <div className="rounded-2xl border border-white/80 bg-white/70 p-5 shadow-sm space-y-3">
          <h2 className="text-sm font-semibold text-slate-700">Upload Lab Results</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 block mb-1">Date</label>
              <input type="date" value={panelDate} onChange={e => setPanelDate(e.target.value)}
                className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm w-full" />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Lab Name</label>
              <input type="text" value={labName} onChange={e => setLabName(e.target.value)}
                placeholder="Quest Diagnostics" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm w-full" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 block mb-1">Ordering Provider</label>
              <input type="text" value={provider} onChange={e => setProvider(e.target.value)}
                placeholder="Dr. Smith" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm w-full" />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                <input type="checkbox" checked={fasting} onChange={e => setFasting(e.target.checked)}
                  className="rounded border-slate-200" />
                Fasting
              </label>
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Lab Results Text</label>
            <textarea value={rawText} onChange={e => setRawText(e.target.value)} rows={8}
              placeholder="Paste your lab results here. AI will extract individual test values, flag abnormal results, and provide context for your cardiac health."
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm w-full font-mono" />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Notes</label>
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Any additional context" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm w-full" />
          </div>
          <div className="flex gap-2">
            <button onClick={handleAdd} disabled={saving || !panelDate || !rawText}
              className="rounded-xl bg-slate-800 text-white text-sm font-semibold px-4 py-2.5 hover:bg-slate-700 disabled:opacity-50 min-h-[44px]">
              {saving ? 'Analyzing...' : 'Upload & Analyze'}
            </button>
            <button onClick={() => setShowAdd(false)}
              className="rounded-xl border border-slate-200 text-slate-600 text-sm px-4 py-2.5 hover:bg-slate-50 min-h-[44px]">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowAdd(true)}
          className="w-full rounded-2xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-400 hover:border-slate-400 transition-colors min-h-[44px]">
          + Upload Lab Results
        </button>
      )}

      {/* Panel list */}
      {panels.length === 0 ? (
        <div className="rounded-2xl border border-white/80 bg-white/70 p-8 text-center shadow-sm">
          <p className="text-slate-500 text-sm">No lab results yet. Upload your bloodwork to track trends over time and get AI-powered insights.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {panels.map(panel => (
            <div key={panel.id} className="rounded-2xl border border-white/80 bg-white/70 shadow-sm overflow-hidden">
              <button
                onClick={() => handleViewPanel(panel.id)}
                className="w-full text-left px-5 py-4 hover:bg-white/90 transition-colors"
                disabled={loadingDetail}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-700">
                      {panel.lab_name || 'Lab Panel'}
                      {panel.fasting && <span className="text-xs text-slate-400 ml-2">Fasting</span>}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {new Date(panel.panel_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      {panel.ordering_provider && ` · ${panel.ordering_provider}`}
                    </p>
                    {panel.ai_summary && <p className="text-xs text-slate-400 mt-1 line-clamp-1">{panel.ai_summary}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {(panel.flag_count ?? 0) > 0 && (
                      <span className="text-xs font-medium rounded-full px-2 py-0.5 bg-amber-100 text-amber-700">
                        {panel.flag_count} flagged
                      </span>
                    )}
                    <span className="text-xs text-slate-400">{panel.result_count ?? 0} tests</span>
                  </div>
                </div>
              </button>
              <div className="border-t border-slate-100 px-5 py-2 flex justify-end">
                {confirmDeleteId === panel.id ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-red-600">Delete this panel?</span>
                    <button onClick={() => handleDeletePanel(panel.id)} className="text-xs text-red-600 font-medium">Yes</button>
                    <button onClick={() => setConfirmDeleteId(null)} className="text-xs text-slate-400">No</button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmDeleteId(panel.id)} className="text-xs text-slate-400 hover:text-red-500">Delete</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
