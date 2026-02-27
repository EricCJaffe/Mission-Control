'use client';

import { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle, Info, Lightbulb, RefreshCw, TestTube, Eye } from 'lucide-react';
import RegimenDetailsModal from './RegimenDetailsModal';

type AIReview = {
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
  lab_correlations: Array<{
    lab_marker: string;
    current_value?: string;
    assessment: string;
    suggestion: string;
  }>;
};

type Props = {
  onTestNewSupplement: () => void;
  savedReview?: AIReview | null;
  lastReviewedAt?: string | null;
  triggerRefresh?: number; // Incrementing this prop triggers a refresh
};

export default function MedicationAIInsights({
  onTestNewSupplement,
  savedReview,
  lastReviewedAt,
  triggerRefresh = 0,
}: Props) {
  const [review, setReview] = useState<AIReview | null>(savedReview || null);
  const [reviewedAt, setReviewedAt] = useState<string | null>(lastReviewedAt || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  // Auto-refresh when triggerRefresh changes
  useEffect(() => {
    if (triggerRefresh > 0) {
      loadReview();
    }
  }, [triggerRefresh]);

  // Update local state when props change
  useEffect(() => {
    setReview(savedReview || null);
    setReviewedAt(lastReviewedAt || null);
  }, [savedReview, lastReviewedAt]);

  async function loadReview() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/fitness/medications/ai-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullReview: true }),
      });

      const data = await res.json();

      if (data.ok && data.review) {
        setReview(data.review);
        setReviewedAt(new Date().toISOString());
        setExpanded(false); // Show summary view after refresh
      } else {
        setError(data.error || 'Failed to load review');
        console.error('AI review error:', data);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Network error';
      setError(errorMsg);
      console.error('AI review exception:', err);
    } finally {
      setLoading(false);
    }
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
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Lightbulb className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-slate-900">AI Medications & Supplements</h3>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onTestNewSupplement}
            className="px-4 py-2 rounded-lg border border-blue-200 text-sm font-medium text-blue-600 hover:bg-blue-50 min-h-[40px]"
          >
            Test New Supplement
          </button>
          <button
            onClick={loadReview}
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 min-h-[40px] flex items-center gap-2"
          >
            {loading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4" />
                {review ? 'Refresh Analysis' : 'Analyze My Stack'}
              </>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 mb-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {!review && !loading && (
        <div className="text-center py-8 text-slate-500 text-sm">
          <Info className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>Click "Analyze My Stack" to get AI-powered insights about your</p>
          <p>medication and supplement regimen.</p>
        </div>
      )}

      {review && (
        <div className="space-y-4">
          {/* Summary View */}
          <div className={`rounded-lg border p-4 ${assessmentColor[review.overall_assessment]}`}>
            <div className="flex items-start gap-3">
              {review.overall_assessment === 'SAFE' && <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />}
              {review.overall_assessment === 'CAUTION' && <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />}
              {review.overall_assessment === 'CONCERN' && <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />}
              <div className="flex-1">
                <p className="font-semibold mb-1">Overall Assessment: {review.overall_assessment}</p>
                <p className="text-sm">{review.summary}</p>
              </div>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-3 gap-3 text-center">
            {review.interactions && review.interactions.length > 0 && (
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-2xl font-bold text-slate-700">{review.interactions.length}</p>
                <p className="text-xs text-slate-500">Interactions</p>
              </div>
            )}
            {review.warnings && review.warnings.length > 0 && (
              <div className="rounded-lg bg-orange-50 p-3">
                <p className="text-2xl font-bold text-orange-700">{review.warnings.length}</p>
                <p className="text-xs text-orange-600">Warnings</p>
              </div>
            )}
            {review.recommendations && review.recommendations.length > 0 && (
              <div className="rounded-lg bg-blue-50 p-3">
                <p className="text-2xl font-bold text-blue-700">{review.recommendations.length}</p>
                <p className="text-xs text-blue-600">Recommendations</p>
              </div>
            )}
          </div>

          {/* View Details Button */}
          <button
            onClick={() => setShowDetailsModal(true)}
            className="w-full rounded-lg border border-blue-200 bg-blue-50 text-blue-600 font-medium px-4 py-3 hover:bg-blue-100 min-h-[44px] flex items-center justify-center gap-2"
          >
            <Eye className="w-4 h-4" />
            View Complete Analysis
          </button>

          {reviewedAt && (
            <p className="text-xs text-slate-500 text-center">
              Last analyzed: {new Date(reviewedAt).toLocaleString()}
            </p>
          )}

        </div>
      )}

      {/* Regimen Details Modal */}
      {showDetailsModal && review && (
        <RegimenDetailsModal
          review={review}
          lastReviewedAt={reviewedAt}
          onClose={() => setShowDetailsModal(false)}
        />
      )}
    </div>
  );
}
