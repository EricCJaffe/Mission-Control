/**
 * The public application form, validated. Pure, so it is tested; the route
 * does the I/O. Limits are generous for a person and tight for a script.
 */

export type Application = {
  name: string;
  phone: string;
  email: string | null;
  drivers_license: boolean;
  experience: string | null;
  availability: string | null;
  heard_from: string | null;
};

const MAX = { name: 100, phone: 30, email: 200, text: 2000, short: 200 };

function str(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

/* The honeypot: a field real people never see. A value means a bot. */
export const HONEYPOT = 'website';

export function validateApplication(body: Record<string, unknown>): { ok: true; value: Application } | { ok: false; error: string } {
  const name = str(body.name, MAX.name);
  const phone = str(body.phone, MAX.phone);
  const email = str(body.email, MAX.email);
  if (!name) return { ok: false, error: 'Please add your name.' };
  if (!phone || phone.replace(/\D/g, '').length < 10) return { ok: false, error: 'Please add a phone number we can call or text.' };
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: 'That email does not look right.' };
  if (body.drivers_license !== 'yes' && body.drivers_license !== 'no') return { ok: false, error: 'Please answer the driver’s license question.' };
  return {
    ok: true,
    value: {
      name,
      phone,
      email,
      drivers_license: body.drivers_license === 'yes',
      experience: str(body.experience, MAX.text),
      availability: str(body.availability, MAX.short),
      heard_from: str(body.heard_from, MAX.short),
    },
  };
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
