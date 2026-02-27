'use client';

import { useState, useEffect } from 'react';
import { ArrowLeft, CheckCircle, XCircle, AlertCircle, Loader2 } from 'lucide-react';
import Link from 'next/link';

type PendingUpdate = {
  id: string;
  section_number: number;
  section_name: string;
  current_content: string;
  proposed_content: string;
  diff_html: string;
  trigger_type: string;
  trigger_data: any;
  reason: string;
  confidence: 'high' | 'medium' | 'low';
  priority: number;
  created_at: string;
};

export default function ReviewUpdatesPage() {
  const [updates, setUpdates] = useState<PendingUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [selectedUpdates, setSelectedUpdates] = useState<Set<string>>(new Set());

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
        // Select all by default
        setSelectedUpdates(new Set(data.pending_updates?.map((u: PendingUpdate) => u.id) || []));
      }
    } catch (error) {
      console.error('Failed to load pending updates:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove(updateIds: string[]) {
    setProcessing('approve');
    try {
      const res = await fetch('/api/fitness/health/approve-updates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ update_ids: updateIds, action: 'approve' }),
      });

      const data = await res.json();

      if (data.ok) {
        // Remove approved updates from list
        setUpdates(prev => prev.filter(u => !updateIds.includes(u.id)));
        setSelectedUpdates(prev => {
          const next = new Set(prev);
          updateIds.forEach(id => next.delete(id));
          return next;
        });
      } else {
        alert(`Failed to approve updates: ${data.error}`);
      }
    } catch (error) {
      console.error('Failed to approve updates:', error);
      alert('Failed to approve updates');
    } finally {
      setProcessing(null);
    }
  }

  async function handleReject(updateIds: string[]) {
    setProcessing('reject');
    try {
      const res = await fetch('/api/fitness/health/approve-updates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ update_ids: updateIds, action: 'reject' }),
      });

      const data = await res.json();

      if (data.ok) {
        // Remove rejected updates from list
        setUpdates(prev => prev.filter(u => !updateIds.includes(u.id)));
        setSelectedUpdates(prev => {
          const next = new Set(prev);
          updateIds.forEach(id => next.delete(id));
          return next;
        });
      } else {
        alert(`Failed to reject updates: ${data.error}`);
      }
    } catch (error) {
      console.error('Failed to reject updates:', error);
      alert('Failed to reject updates');
    } finally {
      setProcessing(null);
    }
  }

  function toggleSelection(id: string) {
    setSelectedUpdates(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedUpdates.size === updates.length) {
      setSelectedUpdates(new Set());
    } else {
      setSelectedUpdates(new Set(updates.map(u => u.id)));
    }
  }

  const confidenceColor = {
    high: 'text-green-700 bg-green-50 border-green-200',
    medium: 'text-yellow-700 bg-yellow-50 border-yellow-200',
    low: 'text-blue-700 bg-blue-50 border-blue-200',
  };

  const priorityLabel = (priority: number) => {
    if (priority >= 9) return 'Urgent';
    if (priority >= 7) return 'High';
    if (priority >= 5) return 'Medium';
    return 'Low';
  };

  const priorityColor = (priority: number) => {
    if (priority >= 9) return 'text-red-700 bg-red-50 border-red-200';
    if (priority >= 7) return 'text-orange-700 bg-orange-50 border-orange-200';
    if (priority >= 5) return 'text-yellow-700 bg-yellow-50 border-yellow-200';
    return 'text-blue-700 bg-blue-50 border-blue-200';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            <p className="text-slate-600">Loading pending updates...</p>
          </div>
        </div>
      </div>
    );
  }

  if (updates.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <Link
              href="/fitness/health/view"
              className="flex items-center gap-2 text-slate-600 hover:text-slate-900 min-h-[44px]"
            >
              <ArrowLeft className="w-5 h-5" />
              Back to Health.md
            </Link>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white p-8 shadow-sm text-center">
            <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-slate-900 mb-2">All Caught Up!</h2>
            <p className="text-slate-600">
              No pending updates for your health.md. All sections are current.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link
              href="/fitness/health/view"
              className="flex items-center gap-2 text-slate-600 hover:text-slate-900 min-h-[44px]"
            >
              <ArrowLeft className="w-5 h-5" />
              Back
            </Link>
            <h1 className="text-2xl font-bold text-slate-900">
              Review Health.md Updates ({updates.length})
            </h1>
          </div>

          {/* Batch Actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={toggleSelectAll}
              className="px-4 py-2 text-sm text-slate-700 hover:text-slate-900 min-h-[44px]"
            >
              {selectedUpdates.size === updates.length ? 'Deselect All' : 'Select All'}
            </button>

            <button
              onClick={() => handleReject(Array.from(selectedUpdates))}
              disabled={selectedUpdates.size === 0 || !!processing}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
            >
              {processing === 'reject' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <XCircle className="w-4 h-4" />
              )}
              Reject Selected ({selectedUpdates.size})
            </button>

            <button
              onClick={() => handleApprove(Array.from(selectedUpdates))}
              disabled={selectedUpdates.size === 0 || !!processing}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
            >
              {processing === 'approve' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle className="w-4 h-4" />
              )}
              Approve Selected ({selectedUpdates.size})
            </button>
          </div>
        </div>

        {/* Updates List */}
        <div className="space-y-6">
          {updates.map((update) => (
            <div
              key={update.id}
              className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden"
            >
              {/* Update Header */}
              <div className="border-b border-slate-100 bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1">
                    <input
                      type="checkbox"
                      checked={selectedUpdates.has(update.id)}
                      onChange={() => toggleSelection(update.id)}
                      className="mt-1 w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-lg font-semibold text-slate-900">
                          §{update.section_number} {update.section_name}
                        </h3>
                        <span
                          className={`text-xs px-2 py-1 rounded border ${priorityColor(update.priority)}`}
                        >
                          {priorityLabel(update.priority)}
                        </span>
                        <span
                          className={`text-xs px-2 py-1 rounded border ${confidenceColor[update.confidence]}`}
                        >
                          {update.confidence} confidence
                        </span>
                      </div>

                      <div className="flex items-start gap-2 text-sm text-slate-600 mb-2">
                        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        <p>{update.reason}</p>
                      </div>

                      <div className="text-xs text-slate-500">
                        Triggered by: {update.trigger_type.replace('_', ' ')} •{' '}
                        {new Date(update.created_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Individual Actions */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleReject([update.id])}
                      disabled={!!processing}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 min-h-[44px]"
                    >
                      <XCircle className="w-4 h-4" />
                      Reject
                    </button>
                    <button
                      onClick={() => handleApprove([update.id])}
                      disabled={!!processing}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 min-h-[44px]"
                    >
                      <CheckCircle className="w-4 h-4" />
                      Approve
                    </button>
                  </div>
                </div>
              </div>

              {/* Diff Viewer */}
              <div className="p-4">
                <h4 className="text-sm font-semibold text-slate-700 mb-3">Changes:</h4>
                <div
                  className="rounded-lg border border-slate-200 bg-slate-50 p-4 overflow-x-auto text-sm font-mono"
                  dangerouslySetInnerHTML={{ __html: update.diff_html }}
                  style={{
                    // Style for diff display
                    lineHeight: '1.5',
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <style jsx>{`
        :global(.diff-line-added) {
          background-color: #d4f4dd;
          color: #0f5132;
          display: block;
          padding: 2px 4px;
        }
        :global(.diff-line-removed) {
          background-color: #f8d7da;
          color: #842029;
          display: block;
          padding: 2px 4px;
        }
        :global(.diff-line-unchanged) {
          display: block;
          padding: 2px 4px;
        }
      `}</style>
    </div>
  );
}
