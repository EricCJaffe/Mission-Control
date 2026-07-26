'use client';

import { useState } from 'react';
import { X, AlertTriangle, CheckCircle, Loader2, Search } from 'lucide-react';

type Props = {
  onClose: () => void;
  onAdd: (supplement: {
    name: string;
    type: string;
    dosage: string;
    purpose: string;
    ai_review?: ProposalReview;
  }) => void;
};

type ProposalReview = {
  overall_assessment: 'SAFE' | 'CAUTION' | 'CONCERN';
  summary: string;
  interactions: Array<{
    severity: 'HIGH' | 'MEDIUM' | 'LOW';
    description: string;
    recommendation: string;
  }>;
  warnings: Array<{
    type: string;
    message: string;
    action: string;
  }>;
  recommendations: Array<{
    category: string;
    item: string;
    reasoning: string;
    priority: 'HIGH' | 'MEDIUM' | 'LOW';
  }>;
};

type SearchResult = {
  supplement_name: string;
  category: string;
  common_ingredients: Array<{
    name: string;
    dosage: string;
    purpose: string;
  }>;
  brands: string[];
  notes: string;
};

export default function SupplementProposal({ onClose, onAdd }: Props) {
  const [name, setName] = useState('');
  const [itemType, setItemType] = useState<'supplement' | 'prescription' | 'otc'>('supplement');
  const [dosage, setDosage] = useState('');
  const [purpose, setPurpose] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [review, setReview] = useState<ProposalReview | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSearch() {
    if (!name.trim()) {
      setError('Supplement name is required');
      return;
    }

    setSearching(true);
    setError(null);
    setSearchResult(null);

    try {
      const res = await fetch('/api/fitness/medications/supplement-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplementName: name.trim(),
        }),
      });

      const data = await res.json();

      if (data.ok && data.result) {
        setSearchResult(data.result);
        // Auto-fill form with search results
        if (data.result.supplement_name) {
          setName(data.result.supplement_name);
        }
        // Build dosage from ingredients
        if (data.result.common_ingredients && data.result.common_ingredients.length > 0) {
          const ingredientList = data.result.common_ingredients
            .map((ing: any) => `${ing.name} ${ing.dosage}`)
            .join(', ');
          setDosage(ingredientList);
        }
        // Build purpose from ingredients
        if (data.result.common_ingredients && data.result.common_ingredients.length > 0) {
          const purposes = data.result.common_ingredients
            .map((ing: any) => ing.purpose)
            .filter(Boolean)
            .join('; ');
          setPurpose(purposes || data.result.category);
        }
      } else {
        setError(data.error || 'Failed to search supplement');
      }
    } catch (err) {
      setError('Network error during search');
    } finally {
      setSearching(false);
    }
  }

  async function handleAnalyze() {
    if (!name.trim()) {
      setError('Supplement name is required');
      return;
    }

    setAnalyzing(true);
    setError(null);
    setReview(null);

    try {
      const res = await fetch('/api/fitness/medications/ai-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proposedMedication: {
            name: name.trim(),
            type: itemType,
            dosage: dosage.trim() || 'Standard dose',
            purpose: purpose.trim() || 'General health',
          },
        }),
      });

      const data = await res.json();

      if (data.ok && data.review) {
        setReview(data.review);
      } else {
        setError(data.error || 'Failed to analyze');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setAnalyzing(false);
    }
  }

  function handleAddItem() {
    onAdd({
      name: name.trim(),
      type: itemType,
      dosage: dosage.trim() || '',
      purpose: purpose.trim() || '',
      ai_review: review || undefined,
    });
  }

  const assessmentColor = {
    SAFE: 'text-green-700 bg-green-50 border-green-200',
    CAUTION: 'text-yellow-700 bg-yellow-50 border-yellow-200',
    CONCERN: 'text-red-700 bg-red-50 border-red-200',
  };

  const severityColor = {
    HIGH: 'text-red-700 bg-red-50',
    MEDIUM: 'text-yellow-700 bg-yellow-50',
    LOW: 'text-blue-700 bg-blue-50',
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-900">Add New Medication or Supplement</h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Input Form */}
        <div className="space-y-4 mb-6">
          {/* Type Selector */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Type *
            </label>
            <div className="flex gap-2">
              {([
                { value: 'prescription', label: 'Prescription' },
                { value: 'otc', label: 'OTC' },
                { value: 'supplement', label: 'Supplement' },
              ] as const).map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setItemType(opt.value)}
                  className={`flex-1 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors min-h-[44px] ${
                    itemType === opt.value
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Name *
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Farxiga, Cortisol Manager, Multivitamin"
                className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
              <button
                onClick={handleSearch}
                disabled={searching || !name.trim()}
                className="rounded-lg bg-slate-600 text-white px-4 py-2 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] flex items-center gap-2"
                title="Search for ingredient information"
              >
                {searching ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Click the search button to look up ingredient and interaction details
            </p>
          </div>

          {/* Search Results */}
          {searchResult && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <h4 className="text-sm font-semibold text-blue-900 mb-2">
                📋 Found: {searchResult.supplement_name}
              </h4>
              <p className="text-xs text-blue-700 mb-3">
                <strong>Category:</strong> {searchResult.category}
              </p>

              {searchResult.common_ingredients && searchResult.common_ingredients.length > 0 && (
                <div className="space-y-2 mb-3">
                  <p className="text-xs font-semibold text-blue-900">Common Ingredients:</p>
                  {searchResult.common_ingredients.map((ing, i) => (
                    <div key={i} className="text-xs text-blue-700 pl-3 border-l-2 border-blue-300">
                      <span className="font-medium">{ing.name}</span> - {ing.dosage}
                      {ing.purpose && <p className="text-blue-600">{ing.purpose}</p>}
                    </div>
                  ))}
                </div>
              )}

              {searchResult.brands && searchResult.brands.length > 0 && (
                <p className="text-xs text-blue-600 mb-2">
                  <strong>Common brands:</strong> {searchResult.brands.join(', ')}
                </p>
              )}

              {searchResult.notes && (
                <p className="text-xs text-blue-600 italic">{searchResult.notes}</p>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Dosage (optional)
            </label>
            <input
              type="text"
              value={dosage}
              onChange={(e) => setDosage(e.target.value)}
              placeholder="e.g., 1000mg daily"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Purpose (optional)
            </label>
            <textarea
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="e.g., Reduce inflammation, support heart health"
              rows={2}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <button
            onClick={handleAnalyze}
            disabled={analyzing || !name.trim()}
            className="w-full rounded-lg bg-blue-600 text-white font-medium px-4 py-2.5 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] flex items-center justify-center gap-2"
          >
            {analyzing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Analyzing...
              </>
            ) : (
              'Analyze Safety & Interactions'
            )}
          </button>
        </div>

        {/* AI Review Results */}
        {review && (
          <div className="space-y-4 border-t border-slate-200 pt-4">
            <h4 className="font-semibold text-slate-900">Analysis Results</h4>

            {/* Overall Assessment */}
            <div className={`rounded-lg border p-4 ${assessmentColor[review.overall_assessment]}`}>
              <div className="flex items-start gap-3">
                {review.overall_assessment === 'SAFE' && <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />}
                {(review.overall_assessment === 'CAUTION' || review.overall_assessment === 'CONCERN') && (
                  <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1">
                  <p className="font-semibold mb-1">{review.overall_assessment}</p>
                  <p className="text-sm">{review.summary}</p>
                </div>
              </div>
            </div>

            {/* Warnings */}
            {review.warnings && review.warnings.length > 0 && (
              <div>
                <h5 className="text-sm font-semibold text-slate-700 mb-2">⚠️ Warnings</h5>
                <div className="space-y-2">
                  {review.warnings.map((warning, i) => (
                    <div key={i} className="rounded-lg border border-orange-200 bg-orange-50 p-3">
                      <p className="text-sm font-medium text-orange-900">{warning.type}</p>
                      <p className="text-sm text-orange-700 mt-1">{warning.message}</p>
                      <p className="text-xs text-orange-600 mt-1">→ {warning.action}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Interactions */}
            {review.interactions && review.interactions.length > 0 && (
              <div>
                <h5 className="text-sm font-semibold text-slate-700 mb-2">🔗 Interactions</h5>
                <div className="space-y-2">
                  {review.interactions.map((interaction, i) => (
                    <div key={i} className={`rounded-lg p-3 ${severityColor[interaction.severity]}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold uppercase">{interaction.severity}</span>
                      </div>
                      <p className="text-sm mb-1">{interaction.description}</p>
                      <p className="text-xs">→ {interaction.recommendation}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recommendations */}
            {review.recommendations && review.recommendations.length > 0 && (
              <div>
                <h5 className="text-sm font-semibold text-slate-700 mb-2">💡 Recommendations</h5>
                <div className="space-y-2">
                  {review.recommendations.map((rec, i) => (
                    <div key={i} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold text-slate-600">{rec.category}</span>
                        <span className={`text-xs px-2 py-0.5 rounded ${severityColor[rec.priority]}`}>
                          {rec.priority}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-slate-900">{rec.item}</p>
                      <p className="text-sm text-slate-600 mt-1">{rec.reasoning}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4 border-t border-slate-200">
              {review.overall_assessment === 'SAFE' && (
                <button
                  onClick={handleAddItem}
                  className="flex-1 rounded-lg bg-green-600 text-white font-medium px-4 py-2.5 hover:bg-green-700 min-h-[44px]"
                >
                  Add to My Regimen
                </button>
              )}
              {review.overall_assessment !== 'SAFE' && (
                <button
                  onClick={handleAddItem}
                  className="flex-1 rounded-lg bg-yellow-600 text-white font-medium px-4 py-2.5 hover:bg-yellow-700 min-h-[44px]"
                >
                  Add Anyway (Proceed with Caution)
                </button>
              )}
              <button
                onClick={onClose}
                className="px-4 py-2.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 min-h-[44px]"
              >
                Cancel
              </button>
            </div>

            {/* Disclaimer */}
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-600">
                ⚕️ <strong>Important:</strong> Discuss with your cardiologist before adding any new supplements.
                This analysis is for informational purposes only.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
