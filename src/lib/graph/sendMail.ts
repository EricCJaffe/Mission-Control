/*
 * Sending one email through Microsoft Graph, app-only.
 *
 * Deliberately separate from scripts/sync/lib/graph.ts, which does the same
 * handshake for the harvester. That file runs on Node from a systemd timer
 * under its own tsconfig and module system; this one runs inside Next on
 * Vercel. Sharing them would mean one build's constraints deciding the other's,
 * and the shared part — post a form, read a token — is nine lines.
 *
 * `Mail.Send` is the one permission deliberately left off until the reads have
 * been verified (docs/m365-setup.md). Until it is granted this throws, and the
 * caller is expected to keep the brief it has already stored rather than lose
 * it. A brief that generated but did not send is a delivery problem; a brief
 * that was never written down is gone.
 */

export type SendMailResult = { sent: true } | { sent: false; reason: string };

type GraphConfig = {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  mailbox: string;
};

function readConfig(): GraphConfig | null {
  const tenantId = process.env.MS_TENANT_ID;
  const clientId = process.env.MS_CLIENT_ID;
  const clientSecret = process.env.MS_CLIENT_SECRET;
  const mailbox = process.env.MS_MAILBOX;
  if (!tenantId || !clientId || !clientSecret || !mailbox) return null;
  return { tenantId, clientId, clientSecret, mailbox };
}

async function token(config: GraphConfig): Promise<string> {
  const res = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        // `.default` is the only scope a client-credentials grant accepts; it
        // means "every application permission already consented for this app".
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      }),
    },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      res.status === 401
        ? 'Graph rejected the client credentials (401 invalid_client) — check MS_CLIENT_SECRET has not expired.'
        : `Graph token request failed (${res.status}): ${body.slice(0, 300)}`,
    );
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error('Graph returned no access_token.');
  return json.access_token;
}

/**
 * Send an HTML email as the configured mailbox.
 *
 * Returns rather than throws when Graph is simply not configured yet, because
 * that is the expected state until the app registration exists and it is not
 * an error worth failing a cron over.
 */
export async function sendMail(options: {
  to: string;
  subject: string;
  html: string;
}): Promise<SendMailResult> {
  const config = readConfig();
  if (!config) {
    return {
      sent: false,
      reason:
        'Graph is not configured (MS_TENANT_ID / MS_CLIENT_ID / MS_CLIENT_SECRET / MS_MAILBOX). See docs/m365-setup.md.',
    };
  }

  try {
    const accessToken = await token(config);
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(config.mailbox)}/sendMail`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            subject: options.subject,
            body: { contentType: 'HTML', content: options.html },
            toRecipients: [{ emailAddress: { address: options.to } }],
          },
          saveToSentItems: true,
        }),
      },
    );

    if (res.ok) return { sent: true };

    const body = await res.text();
    // The two failures worth naming, because the fix for each is in a
    // different place and the raw message does not say which.
    if (res.status === 403 && body.includes('ErrorAccessDenied')) {
      return {
        sent: false,
        reason:
          'Graph returned 403 ErrorAccessDenied — usually the Exchange application access policy does not include this mailbox. See docs/m365-setup.md §3.',
      };
    }
    if (res.status === 403) {
      return {
        sent: false,
        reason:
          'Graph returned 403 — Mail.Send may not be granted or admin consent is missing. See docs/m365-setup.md.',
      };
    }
    return { sent: false, reason: `Graph sendMail failed (${res.status}): ${body.slice(0, 300)}` };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : String(err) };
  }
}
