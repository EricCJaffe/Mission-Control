'use client';

import { useState } from 'react';

interface LabPanel {
  id: string;
  file_id: string;
  lab_name: string;
  panel_date: string;
  provider_name: string | null;
  fasting: boolean;
  status: string;
  ai_summary: string | null;
  created_at: string;
}

interface LabResult {
  id: string;
  test_name: string;
  normalized_test_name: string;
  value: string;
  unit: string;
  reference_range: string;
  flag: 'normal' | 'low' | 'high' | 'critical';
  test_category: string;
}

interface HealthLabReviewClientProps {
  pendingPanels: LabPanel[];
  confirmedPanels: LabPanel[];
}

export default function HealthLabReviewClient({
  pendingPanels: initialPending,
  confirmedPanels: initialConfirmed
}: HealthLabReviewClientProps) {
  const [pendingPanels, setPendingPanels] = useState(initialPending);
  const [confirmedPanels, setConfirmedPanels] = useState(initialConfirmed);
  const [selectedPanel, setSelectedPanel] = useState<LabPanel | null>(null);
  const [results, setResults] = useState<LabResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Editable fields
  const [editLabName, setEditLabName] = useState('');
  const [editPanelDate, setEditPanelDate] = useState('');
  const [editProviderName, setEditProviderName] = useState('');
  const [editFasting, setEditFasting] = useState(false);

  const loadPanelDetails = async (panel: LabPanel) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/fitness/health/labs?panel_id=${panel.id}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load panel details');
      }

      setSelectedPanel(panel);
      setResults(data.results || []);
      setEditLabName(panel.lab_name);
      setEditPanelDate(panel.panel_date);
      setEditProviderName(panel.provider_name || '');
      setEditFasting(panel.fasting);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const confirmPanel = async () => {
    if (!selectedPanel) return;

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/fitness/health/labs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          panel_id: selectedPanel.id,
          lab_name: editLabName,
          panel_date: editPanelDate,
          provider_name: editProviderName || null,
          fasting: editFasting,
          confirm: true,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to confirm panel');
      }

      setSuccess('Panel confirmed! Analysis generated.');
      setPendingPanels(prev => prev.filter(p => p.id !== selectedPanel.id));
      setConfirmedPanels(prev => [data.panel, ...prev]);
      setSelectedPanel(data.panel); // Update with confirmed panel (includes ai_summary)

      // Keep panel open to view AI summary, don't auto-close
      setTimeout(() => {
        setSuccess(null);
      }, 3000);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const deletePanel = async (panelId: string) => {
    if (!confirm('Delete this lab panel? This cannot be undone.')) return;

    setError(null);

    try {
      const response = await fetch(`/api/fitness/health/labs?panel_id=${panelId}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete panel');
      }

      setPendingPanels(prev => prev.filter(p => p.id !== panelId));
      setConfirmedPanels(prev => prev.filter(p => p.id !== panelId));

      if (selectedPanel?.id === panelId) {
        setSelectedPanel(null);
        setResults([]);
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const getFlagColor = (flag: string) => {
    switch (flag) {
      case 'normal': return 'bg-green-100 text-green-700';
      case 'low': return 'bg-blue-100 text-blue-700';
      case 'high': return 'bg-yellow-100 text-yellow-700';
      case 'critical': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  // Detail view
  if (selectedPanel) {
    const flaggedResults = results.filter(r => r.flag !== 'normal');

    return (
      <div className="space-y-6">
        <button
          onClick={() => {
            setSelectedPanel(null);
            setResults([]);
            setError(null);
            setSuccess(null);
          }}
          className="text-sm text-gray-600 hover:text-gray-800"
        >
          ← Back to list
        </button>

        {/* Panel Metadata - Editable */}
        <div className="rounded-2xl border border-white/80 bg-white/70 p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-4">Panel Information</h2>
          <p className="text-sm text-gray-600 mb-4">
            Review and edit the auto-extracted metadata below. AI extracted this from your PDF.
          </p>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Lab Name
              </label>
              <input
                type="text"
                value={editLabName}
                onChange={(e) => setEditLabName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Quest Diagnostics"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Panel Date
              </label>
              <input
                type="date"
                value={editPanelDate}
                onChange={(e) => setEditPanelDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Provider Name
              </label>
              <input
                type="text"
                value={editProviderName}
                onChange={(e) => setEditProviderName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Dr. Smith"
              />
            </div>

            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={editFasting}
                  onChange={(e) => setEditFasting(e.target.checked)}
                  className="rounded border-gray-300"
                />
                Fasting Test
              </label>
            </div>
          </div>
        </div>

        {/* AI Summary (if confirmed) */}
        {selectedPanel.ai_summary && selectedPanel.status === 'confirmed' && (
          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-6">
            <h3 className="text-lg font-semibold text-blue-900 mb-3">
              🤖 AI Comprehensive Analysis
            </h3>
            <div className="prose prose-sm max-w-none">
              <p className="text-gray-800 whitespace-pre-wrap leading-relaxed">
                {selectedPanel.ai_summary}
              </p>
            </div>
          </div>
        )}

        {/* Flagged Results */}
        {flaggedResults.length > 0 && (
          <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-6">
            <h3 className="text-lg font-semibold text-yellow-900 mb-3">
              ⚠️ Flagged Results ({flaggedResults.length})
            </h3>
            <div className="space-y-2">
              {flaggedResults.map(result => (
                <div key={result.id} className="flex items-center justify-between p-3 bg-white rounded-lg">
                  <div>
                    <p className="font-medium text-gray-900">{result.test_name}</p>
                    <p className="text-sm text-gray-600">{result.test_category}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-gray-900">
                      {result.value} {result.unit}
                    </p>
                    <p className="text-xs text-gray-500">Ref: {result.reference_range}</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${getFlagColor(result.flag)}`}>
                    {result.flag}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* All Results */}
        <div className="rounded-2xl border border-white/80 bg-white/70 p-6 shadow-sm">
          <h3 className="text-lg font-semibold mb-3">
            All Test Results ({results.length})
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-3 font-medium text-gray-700">Test</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-700">Category</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-700">Value</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-700">Reference</th>
                  <th className="text-center py-2 px-3 font-medium text-gray-700">Flag</th>
                </tr>
              </thead>
              <tbody>
                {results.map(result => (
                  <tr key={result.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-2 px-3 font-medium text-gray-900">{result.test_name}</td>
                    <td className="py-2 px-3 text-gray-600">{result.test_category}</td>
                    <td className="py-2 px-3 text-right font-mono">
                      {result.value} {result.unit}
                    </td>
                    <td className="py-2 px-3 text-right text-gray-500 text-xs">
                      {result.reference_range}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getFlagColor(result.flag)}`}>
                        {result.flag}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Actions */}
        <div className="rounded-2xl border border-white/80 bg-white/70 p-6 shadow-sm">
          <h3 className="text-lg font-semibold mb-3">Confirm Panel</h3>
          <p className="text-sm text-gray-600 mb-4">
            Once confirmed, AI will generate trend analysis and propose health.md updates.
          </p>
          <div className="flex gap-3">
            <button
              onClick={confirmPanel}
              disabled={loading}
              className="px-6 py-3 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Confirming...' : 'Confirm & Generate Analysis'}
            </button>
            <button
              onClick={() => deletePanel(selectedPanel.id)}
              className="px-6 py-3 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 transition-colors"
            >
              Delete Panel
            </button>
          </div>
        </div>

        {/* Status Messages */}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-800">
              <strong>Error:</strong> {error}
            </p>
          </div>
        )}

        {success && (
          <div className="rounded-xl border border-green-200 bg-green-50 p-4">
            <p className="text-sm text-green-800">
              <strong>Success:</strong> {success}
            </p>
          </div>
        )}
      </div>
    );
  }

  // List view
  return (
    <div className="space-y-6">
      {/* Pending Panels */}
      {pendingPanels.length > 0 && (
        <div className="rounded-2xl border border-white/80 bg-white/70 p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-4">
            Pending Review ({pendingPanels.length})
          </h2>
          <p className="text-sm text-gray-600 mb-4">
            These panels have been auto-extracted from PDFs and are waiting for your confirmation.
          </p>
          <div className="space-y-3">
            {pendingPanels.map(panel => (
              <button
                key={panel.id}
                onClick={() => loadPanelDetails(panel)}
                disabled={loading}
                className="w-full text-left p-4 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">{panel.lab_name}</p>
                    <p className="text-sm text-gray-600">
                      {new Date(panel.panel_date).toLocaleDateString()} •
                      {panel.provider_name ? ` ${panel.provider_name} • ` : ' '}
                      {panel.fasting ? 'Fasting' : 'Not fasting'}
                    </p>
                  </div>
                  <span className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium">
                    Needs Review
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Confirmed Panels */}
      {confirmedPanels.length > 0 && (
        <div className="rounded-2xl border border-white/80 bg-white/70 p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-4">
            Confirmed Panels (Recent 10)
          </h2>
          <div className="space-y-3">
            {confirmedPanels.map(panel => (
              <button
                key={panel.id}
                onClick={() => loadPanelDetails(panel)}
                disabled={loading}
                className="w-full text-left p-4 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">{panel.lab_name}</p>
                    <p className="text-sm text-gray-600">
                      {new Date(panel.panel_date).toLocaleDateString()} •
                      {panel.provider_name ? ` ${panel.provider_name} • ` : ' '}
                      {panel.fasting ? 'Fasting' : 'Not fasting'}
                    </p>
                    {panel.ai_summary && (
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                        {panel.ai_summary}
                      </p>
                    )}
                  </div>
                  <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                    Confirmed
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {pendingPanels.length === 0 && confirmedPanels.length === 0 && (
        <div className="rounded-2xl border border-white/80 bg-white/70 p-12 text-center shadow-sm">
          <p className="text-gray-600">
            No lab panels yet. Upload PDFs at{' '}
            <a href="/fitness/health/upload" className="text-blue-600 hover:underline">
              Health File Upload
            </a>
            .
          </p>
        </div>
      )}

      {/* Info */}
      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-6">
        <h3 className="font-semibold text-gray-900 mb-2">How Lab Review Works</h3>
        <ul className="text-sm text-gray-700 space-y-2">
          <li>• AI auto-extracts panel metadata (lab, date, provider) and all test results from PDFs</li>
          <li>• Review the extracted data and edit if needed (typos, missing fields, etc.)</li>
          <li>• Once confirmed, AI generates trend analysis comparing to historical panels</li>
          <li>• AI proposes updates to your health.md based on significant changes</li>
          <li>• All confirmed panels are available for appointment prep and health queries</li>
        </ul>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-800">
            <strong>Error:</strong> {error}
          </p>
        </div>
      )}
    </div>
  );
}
