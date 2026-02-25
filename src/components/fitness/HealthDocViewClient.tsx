'use client';

import { useState } from 'react';

interface HealthDocument {
  id: string;
  version: number;
  content: string;
  is_current: boolean;
  created_at: string;
  updated_at: string;
}

interface VersionHistoryItem {
  id: string;
  version: number;
  created_at: string;
}

interface HealthDocViewClientProps {
  healthDoc: HealthDocument | null;
  versionHistory: VersionHistoryItem[];
}

export default function HealthDocViewClient({
  healthDoc: initialDoc,
  versionHistory
}: HealthDocViewClientProps) {
  const [healthDoc, setHealthDoc] = useState(initialDoc);
  const [editMode, setEditMode] = useState(false);
  const [editContent, setEditContent] = useState(initialDoc?.content || '');
  const [changeNote, setChangeNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleEdit = () => {
    setEditMode(true);
    setEditContent(healthDoc?.content || '');
    setChangeNote('');
    setError(null);
    setSuccess(null);
  };

  const handleCancel = () => {
    setEditMode(false);
    setEditContent(healthDoc?.content || '');
    setChangeNote('');
    setError(null);
  };

  const handleSave = async () => {
    if (!editContent.trim()) {
      setError('Content cannot be empty');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/fitness/health/view', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: editContent,
          change_note: changeNote || 'Manual edit',
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save changes');
      }

      setHealthDoc(data.document);
      setEditMode(false);
      setSuccess('Health profile updated successfully!');

      setTimeout(() => {
        window.location.reload();
      }, 1500);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  const loadVersion = async (versionId: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/fitness/health/view?version_id=${versionId}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load version');
      }

      setEditMode(true);
      setEditContent(data.document.content);
      setChangeNote(`Restored from version ${data.document.version}`);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  if (!healthDoc) {
    return (
      <div className="rounded-2xl border border-white/80 bg-white/70 p-12 text-center shadow-sm">
        <p className="text-gray-600 mb-4">
          Health profile not initialized yet.
        </p>
        <a
          href="/fitness/health/init"
          className="inline-block px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
        >
          Initialize Health Profile
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Edit Mode */}
      {editMode ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/80 bg-white/70 p-6 shadow-sm">
            <h2 className="text-lg font-semibold mb-4">Edit Health Profile</h2>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Content (Markdown)
              </label>
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                rows={30}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Change Note (optional)
              </label>
              <input
                type="text"
                value={changeNote}
                onChange={(e) => setChangeNote(e.target.value)}
                placeholder="What did you change?"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                onClick={handleCancel}
                disabled={saving}
                className="px-6 py-3 bg-gray-600 text-white rounded-xl font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* View Mode */
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/80 bg-white/70 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold">Current Version</h2>
                <p className="text-sm text-gray-600">
                  Version {healthDoc.version} •
                  Updated {new Date(healthDoc.updated_at).toLocaleString()}
                </p>
              </div>
              <button
                onClick={handleEdit}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
              >
                Edit
              </button>
            </div>

            <div className="border-t border-gray-200 pt-4">
              <pre className="whitespace-pre-wrap font-mono text-sm text-gray-800 leading-relaxed">
                {healthDoc.content}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* Version History */}
      {versionHistory.length > 1 && (
        <div className="rounded-2xl border border-white/80 bg-white/70 p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-4">Version History</h2>
          <div className="space-y-2">
            {versionHistory.map((version) => (
              <div
                key={version.id}
                className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div>
                  <p className="font-medium text-gray-900">
                    Version {version.version}
                    {version.id === healthDoc.id && (
                      <span className="ml-2 px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                        Current
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-gray-600">
                    {new Date(version.created_at).toLocaleString()}
                  </p>
                </div>
                {version.id !== healthDoc.id && (
                  <button
                    onClick={() => loadVersion(version.id)}
                    disabled={loading}
                    className="px-4 py-2 bg-gray-600 text-white rounded-lg font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors text-sm"
                  >
                    View
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Info Box */}
      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-6">
        <h3 className="font-semibold text-gray-900 mb-2">About health.md</h3>
        <ul className="text-sm text-gray-700 space-y-2">
          <li>• Living document with your complete health context (medical history, medications, constraints)</li>
          <li>• Feeds all AI features: morning briefing, workout builder, appointment prep, lab analysis, etc.</li>
          <li>• Version controlled - every edit creates a new version with full audit trail</li>
          <li>• AI proposes updates based on lab results, medication changes, and significant health events</li>
          <li>• Keep it current for best AI recommendations and safety alerts</li>
        </ul>
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
