'use client';

import { useState } from 'react';

interface HealthInitClientProps {
  healthDocExists: boolean;
  medsCount: number;
  healthDoc: {
    id: string;
    version: number;
    createdAt: string;
  } | null;
}

export default function HealthInitClient({ healthDocExists, medsCount, healthDoc }: HealthInitClientProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const initializeHealthDoc = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/fitness/health/init', {
        method: 'POST',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to initialize health document');
      }

      setSuccess('Health profile initialized successfully!');
      setTimeout(() => {
        window.location.reload();
      }, 1500);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const seedMedications = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/fitness/medications/seed', {
        method: 'POST',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to seed medications');
      }

      setSuccess(`Successfully seeded ${data.count} medications and supplements!`);
      setTimeout(() => {
        window.location.reload();
      }, 1500);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Health Document Card */}
      <div className="rounded-2xl border border-white/80 bg-white/70 p-6 shadow-sm">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold mb-1">Health Profile (health.md)</h2>
            <p className="text-sm text-gray-600">
              Comprehensive medical profile that feeds all AI features
            </p>
          </div>
          {healthDocExists && (
            <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
              ✓ Initialized
            </span>
          )}
        </div>

        {healthDocExists && healthDoc ? (
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Document ID:</span>
              <span className="font-mono text-xs">{healthDoc.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Version:</span>
              <span className="font-medium">{healthDoc.version}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Created:</span>
              <span className="font-medium">
                {new Date(healthDoc.createdAt).toLocaleDateString()}
              </span>
            </div>
            <div className="mt-4 p-3 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-800">
                ✓ Health profile is active. All AI features have access to your medical context.
              </p>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-sm text-gray-600 mb-4">
              Creates your health profile with:
            </p>
            <ul className="text-sm text-gray-700 space-y-1 mb-4">
              <li>• Medical history (CABG, EF, eGFR)</li>
              <li>• Training constraints (HR zones, safety rules)</li>
              <li>• Vital baselines & targets</li>
              <li>• Nutrition context & fasting protocol</li>
              <li>• Health priorities & update triggers</li>
            </ul>
            <button
              onClick={initializeHealthDoc}
              disabled={loading}
              className="w-full px-4 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Initializing...' : 'Initialize Health Profile'}
            </button>
          </div>
        )}
      </div>

      {/* Medications Card */}
      <div className="rounded-2xl border border-white/80 bg-white/70 p-6 shadow-sm">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold mb-1">Medications & Supplements</h2>
            <p className="text-sm text-gray-600">
              Seed your current medication regimen
            </p>
          </div>
          {medsCount > 0 && (
            <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
              ✓ Seeded ({medsCount})
            </span>
          )}
        </div>

        {medsCount > 0 ? (
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Total medications:</span>
              <span className="font-medium">{medsCount}</span>
            </div>
            <div className="mt-4 p-3 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-800">
                ✓ Medications seeded. View and manage at <a href="/fitness/medications" className="underline">/fitness/medications</a>
              </p>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-sm text-gray-600 mb-4">
              Seeds your current regimen:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4 text-sm">
              <div>
                <p className="font-medium text-gray-700 mb-1">Prescriptions (5):</p>
                <ul className="text-gray-600 space-y-0.5">
                  <li>• Carvedilol 25mg</li>
                  <li>• Losartan 50mg</li>
                  <li>• Rosuvastatin 20mg</li>
                  <li>• Repatha 140mg</li>
                  <li>• Baby Aspirin 81mg</li>
                </ul>
              </div>
              <div>
                <p className="font-medium text-gray-700 mb-1">Supplements (4):</p>
                <ul className="text-gray-600 space-y-0.5">
                  <li>• Fish Oil (Omega-3)</li>
                  <li>• CoQ10 (Ubiquinol)</li>
                  <li>• Magnesium Glycinate</li>
                  <li>• Vitamin D3</li>
                </ul>
              </div>
            </div>
            <button
              onClick={seedMedications}
              disabled={loading}
              className="w-full px-4 py-3 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Seeding...' : 'Seed Medications'}
            </button>
          </div>
        )}
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

      {/* Next Steps */}
      {healthDocExists && medsCount > 0 && (
        <div className="rounded-2xl border border-purple-200 bg-purple-50 p-6">
          <h3 className="font-semibold text-purple-900 mb-3">🎉 Setup Complete!</h3>
          <p className="text-sm text-purple-800 mb-4">
            Your health intelligence system is operational. All AI features now have access to your complete medical context.
          </p>
          <div className="space-y-2 text-sm text-purple-700">
            <p className="font-medium">Next steps:</p>
            <ul className="space-y-1 ml-4">
              <li>• Upload historical lab reports (5 reports pending)</li>
              <li>• Create March 13 cardiologist appointment</li>
              <li>• Generate appointment prep questions</li>
              <li>• Test morning briefing with health context</li>
            </ul>
          </div>
          <a
            href="/fitness"
            className="mt-4 inline-block px-6 py-3 bg-purple-600 text-white rounded-xl font-medium hover:bg-purple-700 transition-colors"
          >
            Go to Fitness Dashboard
          </a>
        </div>
      )}

      {/* Info Box */}
      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-6">
        <h3 className="font-semibold text-gray-900 mb-2">What This Does</h3>
        <p className="text-sm text-gray-700 mb-3">
          The health intelligence system ensures ALL AI features have complete medical context:
        </p>
        <ul className="text-sm text-gray-600 space-y-2">
          <li>
            <strong className="text-gray-800">Safety-first:</strong> AI knows about your medications (Carvedilol, Losartan, Rosuvastatin, Repatha, Aspirin)
            and will NEVER recommend contraindicated supplements (NSAIDs, potassium, decongestants, grapefruit)
          </li>
          <li>
            <strong className="text-gray-800">Constraint-aware:</strong> All workout recommendations respect your HR ceiling (155 bpm),
            beta-blocker effects, post-CABG warm-up requirements, and heat precautions
          </li>
          <li>
            <strong className="text-gray-800">Kidney-safe:</strong> Recommendations consider your eGFR 60 status
            (Stage 2/3a CKD) and avoid nephrotoxic substances
          </li>
          <li>
            <strong className="text-gray-800">Context-aware:</strong> AI cross-references training data with BP trends, lab results,
            and medication effectiveness
          </li>
        </ul>
      </div>
    </div>
  );
}
