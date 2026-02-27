'use client';

import { useState, useEffect } from 'react';
import { AlertCircle, FileText, ChevronRight } from 'lucide-react';
import Link from 'next/link';

type PendingUpdate = {
  id: string;
  section_number: number;
  section_name: string;
  reason: string;
  confidence: 'high' | 'medium' | 'low';
  priority: number;
  created_at: string;
};

type Props = {
  showFullList?: boolean; // If true, shows all pending updates; if false, shows count only
};

export default function HealthDocPendingUpdates({ showFullList = false }: Props) {
  const [updates, setUpdates] = useState<PendingUpdate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPendingUpdates();
  }, []);

  async function loadPendingUpdates() {
    setLoading(true);
    try {
      const res = await fetch('/api/fitness/health/pending-updates');
      const data = await res.json();

      if (data.ok) {
        setUpdates(data.pending_updates || []);
      }
    } catch (error) {
      console.error('Failed to load pending updates:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-slate-400 animate-pulse" />
          <p className="text-sm text-slate-500">Loading updates...</p>
        </div>
      </div>
    );
  }

  if (updates.length === 0) {
    return null; // Don't show widget if no updates
  }

  const confidenceColor = {
    high: 'text-green-700 bg-green-50',
    medium: 'text-yellow-700 bg-yellow-50',
    low: 'text-blue-700 bg-blue-50',
  };

  const priorityLabel = (priority: number) => {
    if (priority >= 9) return 'Urgent';
    if (priority >= 7) return 'High';
    if (priority >= 5) return 'Medium';
    return 'Low';
  };

  const priorityColor = (priority: number) => {
    if (priority >= 9) return 'text-red-700 bg-red-50';
    if (priority >= 7) return 'text-orange-700 bg-orange-50';
    if (priority >= 5) return 'text-yellow-700 bg-yellow-50';
    return 'text-blue-700 bg-blue-50';
  };

  if (!showFullList) {
    // Compact notification view (for dashboard)
    return (
      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-semibold text-blue-900 mb-1">
              Health.md Updates Pending ({updates.length})
            </h3>
            <p className="text-sm text-blue-700 mb-3">
              {updates.length === 1
                ? 'One section needs review to keep your health profile current.'
                : `${updates.length} sections need review to keep your health profile current.`}
            </p>
            <Link
              href="/fitness/health/review-updates"
              className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-800"
            >
              Review Updates
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Full list view (for health view page)
  return (
    <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-blue-900">
            Pending Updates ({updates.length})
          </h3>
        </div>
        <Link
          href="/fitness/health/review-updates"
          className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 min-h-[40px]"
        >
          Review All
        </Link>
      </div>

      <div className="space-y-2">
        {updates.slice(0, 5).map((update) => (
          <div
            key={update.id}
            className="rounded-lg border border-blue-200 bg-white p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-semibold text-slate-900">
                    §{update.section_number} {update.section_name}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded ${priorityColor(update.priority)}`}>
                    {priorityLabel(update.priority)}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded ${confidenceColor[update.confidence]}`}>
                    {update.confidence}
                  </span>
                </div>
                <p className="text-sm text-slate-600">{update.reason}</p>
                <p className="text-xs text-slate-400 mt-1">
                  {new Date(update.created_at).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </p>
              </div>
            </div>
          </div>
        ))}

        {updates.length > 5 && (
          <p className="text-sm text-blue-700 text-center pt-2">
            + {updates.length - 5} more update{updates.length - 5 !== 1 ? 's' : ''}
          </p>
        )}
      </div>
    </div>
  );
}
