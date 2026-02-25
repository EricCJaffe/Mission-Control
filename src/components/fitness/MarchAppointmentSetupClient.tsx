'use client';

import { useState } from 'react';

interface MarchAppointmentSetupClientProps {
  appointmentExists: boolean;
  appointment: any;
  healthDocExists: boolean;
  medsCount: number;
}

export default function MarchAppointmentSetupClient({
  appointmentExists,
  appointment: initialAppointment,
  healthDocExists,
  medsCount,
}: MarchAppointmentSetupClientProps) {
  const [appointment, setAppointment] = useState(initialAppointment);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const createAppointment = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/fitness/appointments/seed-march', {
        method: 'POST',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create appointment');
      }

      setSuccess('March 13 appointment created successfully!');
      setTimeout(() => {
        window.location.reload();
      }, 1500);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const generatePrep = async () => {
    if (!appointment) return;

    setGenerating(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/fitness/appointments', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: appointment.id,
          generate_prep: true,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate prep');
      }

      setAppointment(data.appointment);
      setSuccess('Appointment prep generated! View questions below.');

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setGenerating(false);
    }
  };

  const prepGenerated = appointment?.prep_generated_at;

  return (
    <div className="space-y-6">
      {/* Prerequisites Check */}
      <div className="rounded-2xl border border-white/80 bg-white/70 p-6 shadow-sm">
        <h2 className="text-lg font-semibold mb-4">Prerequisites</h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700">Health Profile (health.md)</span>
            {healthDocExists ? (
              <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                ✓ Ready
              </span>
            ) : (
              <a
                href="/fitness/health/init"
                className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium hover:bg-red-200"
              >
                → Initialize
              </a>
            )}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700">Medications Seeded</span>
            {medsCount > 0 ? (
              <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                ✓ {medsCount} meds
              </span>
            ) : (
              <a
                href="/fitness/health/init"
                className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium hover:bg-red-200"
              >
                → Seed Meds
              </a>
            )}
          </div>
        </div>
        {(!healthDocExists || medsCount === 0) && (
          <div className="mt-4 p-3 bg-yellow-50 rounded-lg">
            <p className="text-sm text-yellow-800">
              ⚠️ Complete prerequisites before generating appointment prep.
            </p>
          </div>
        )}
      </div>

      {/* Create Appointment */}
      {!appointmentExists ? (
        <div className="rounded-2xl border border-white/80 bg-white/70 p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-2">Step 1: Create Appointment</h2>
          <p className="text-sm text-gray-600 mb-4">
            Create the March 13, 2026 cardiologist appointment in your system.
          </p>
          <button
            onClick={createAppointment}
            disabled={loading || !healthDocExists || medsCount === 0}
            className="w-full px-4 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Creating Appointment...' : 'Create March 13 Appointment'}
          </button>
        </div>
      ) : (
        <div className="rounded-2xl border border-green-200 bg-green-50 p-6">
          <h2 className="text-lg font-semibold text-green-900 mb-2">✓ Appointment Created</h2>
          <div className="space-y-2 text-sm text-green-800">
            <p><strong>Date:</strong> March 13, 2026</p>
            <p><strong>Doctor:</strong> {appointment.doctor_name}</p>
            <p><strong>Specialty:</strong> {appointment.doctor_specialty}</p>
            <p><strong>Status:</strong> {appointment.status}</p>
          </div>
        </div>
      )}

      {/* Generate Prep */}
      {appointmentExists && (
        <div className="rounded-2xl border border-white/80 bg-white/70 p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-2">
            Step 2: Generate Appointment Prep
          </h2>
          <p className="text-sm text-gray-600 mb-4">
            AI will analyze your health data and generate 5-8 prioritized questions to ask your cardiologist,
            along with changes since your last visit and proactive flags.
          </p>
          <button
            onClick={generatePrep}
            disabled={generating}
            className="w-full px-4 py-3 bg-purple-600 text-white rounded-xl font-medium hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {generating ? 'Generating Prep...' : prepGenerated ? 'Regenerate Prep' : 'Generate Appointment Prep'}
          </button>
          {prepGenerated && (
            <p className="mt-3 text-sm text-gray-600">
              Last generated: {new Date(prepGenerated).toLocaleString()}
            </p>
          )}
        </div>
      )}

      {/* View Prep */}
      {appointment && prepGenerated && (
        <div className="rounded-2xl border border-purple-200 bg-purple-50 p-6">
          <h2 className="text-lg font-semibold text-purple-900 mb-3">
            ✓ Prep Generated!
          </h2>
          <p className="text-sm text-purple-800 mb-4">
            Your appointment prep is ready. View the full details on the appointments page.
          </p>
          <a
            href="/fitness/appointments"
            className="inline-block px-6 py-3 bg-purple-600 text-white rounded-xl font-medium hover:bg-purple-700 transition-colors"
          >
            View Appointment Details
          </a>
        </div>
      )}

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
      {appointmentExists && prepGenerated && (
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-6">
          <h3 className="font-semibold text-gray-900 mb-3">Next Steps</h3>
          <ul className="space-y-2 text-sm text-gray-700">
            <li>✓ Appointment created for March 13, 2026</li>
            <li>✓ AI prep questions generated</li>
            <li>• Upload any pending lab reports (5 historical reports)</li>
            <li>• Review and customize the suggested questions</li>
            <li>• Build cardiologist report PDF (coming next!)</li>
            <li>• Print or save prep for appointment</li>
          </ul>
        </div>
      )}
    </div>
  );
}
