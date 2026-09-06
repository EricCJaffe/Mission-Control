/*
 * Microsoft Graph, app-only.
 *
 * Client credentials rather than a delegated flow, because nobody is awake
 * when the timer fires and a delegated flow needs an interactive sign-in to
 * bootstrap plus a refresh token to babysit for ever afterwards. The full
 * reasoning — and the Exchange application access policy that stops a
 * tenant-wide `Mail.Read` from meaning "read the whole company's email" —
 * is in docs/m365-setup.md. Read section 3 of it before trusting this file.
 *
 * Read-only on purpose. `Mail.Send` has not been consented, so there is no
 * send helper here to be tempted by, and a token minted from this app cannot
 * put anything in anybody's outbox.
 */

const LOGIN_HOST = 'https://login.microsoftonline.com';
const GRAPH_HOST = 'https://graph.microsoft.com';

/*
 * Client credentials cannot ask for individual scopes. `.default` means "every
 * application permission this app has already been consented for" — naming
 * `Mail.Read` here is an `invalid_scope` error, not a narrowing.
 */
const SCOPE = `${GRAPH_HOST}/.default`;

/** Renew this far before the stated expiry, so a long run cannot age out mid-page. */
const TOKEN_SKEW_MS = 60_000;

/** Graph throttles per-app and per-mailbox; five tries is generous and still ends. */
const MAX_ATTEMPTS = 5;
const MAX_BACKOFF_MS = 60_000;

/** Runaway guard on @odata.nextLink. A fortnight of Inbox is a handful of pages. */
const MAX_PAGES = 50;

export type GraphEnv = {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  /** The mailbox named in the Graph URL. The access policy, not this, decides reach. */
  mailbox: string;
};

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. The Microsoft 365 sync needs MS_TENANT_ID, MS_CLIENT_ID, ` +
        'MS_CLIENT_SECRET and MS_MAILBOX. See docs/m365-setup.md — section 2 creates them, ' +
        'section 3 scopes them to one mailbox, and section 4 says where to put them. ' +
        'Run this with `node --env-file-if-exists=.env.local` from the repo, or set them ' +
        'in the timer unit.',
    );
  }
  return value;
}

export function loadGraphEnv(): GraphEnv {
  return {
    tenantId: required('MS_TENANT_ID'),
    clientId: required('MS_CLIENT_ID'),
    clientSecret: required('MS_CLIENT_SECRET'),
    mailbox: required('MS_MAILBOX'),
  };
}

/*
 * The token endpoint answers with an `AADSTS` code inside `error_description`,
 * and the codes point at four completely different mistakes. Turning them into
 * sentences here is what stops "invalid_client" sending someone to re-grant
 * consent when the real problem is that they pasted the secret's ID instead of
 * its Value — a mistake the portal invites, because the two sit side by side.
 */
function tokenErrorMessage(status: number, body: string): string {
  const parsed = safeJson(body);
  const code = typeof parsed?.error === 'string' ? parsed.error : `HTTP ${status}`;
  const detail = typeof parsed?.error_description === 'string' ? parsed.error_description : body.slice(0, 400);

  if (detail.includes('AADSTS7000215')) {
    return 'Microsoft rejected the client secret (AADSTS7000215). MS_CLIENT_SECRET must be the ' +
      'secret Value, not the Secret ID beside it, and it is only shown once — if it has been ' +
      'lost, issue a new one. docs/m365-setup.md section 2.3.';
  }
  if (detail.includes('AADSTS7000222')) {
    return 'The client secret has expired (AADSTS7000222). Rotate it: create the new secret ' +
      'before deleting the old one. docs/m365-setup.md section 7.';
  }
  if (detail.includes('AADSTS700016')) {
    return 'Microsoft cannot find this application in this tenant (AADSTS700016). MS_TENANT_ID ' +
      'and MS_CLIENT_ID almost certainly came from different directories — re-read both off the ' +
      'same registration Overview page. docs/m365-setup.md section 2.2.';
  }
  if (code === 'invalid_scope') {
    return `The token request asked for a scope Microsoft would not issue. It must be exactly ${SCOPE}.`;
  }
  return `Token request failed (${code}): ${detail}`;
}

/*
 * Graph's HTTP statuses are coarse and its error codes are precise, so the code
 * inside the body is the only thing separating the two 403s — and they have
 * nothing in common but the number.
 *
 * `Authorization_RequestDenied` is Entra's: the permission was added as
 * Delegated rather than Application, or admin consent was never granted.
 * `ErrorAccessDenied` is Exchange's: the token is valid and carries the role,
 * and the access policy simply does not admit this mailbox. Once consent has
 * been confirmed once, the second is what a 403 nearly always means.
 */
function graphErrorMessage(status: number, url: string, body: string): string {
  const parsed = safeJson(body);
  const err = parsed?.error;
  const code = err && typeof err.code === 'string' ? err.code : '';
  const message = err && typeof err.message === 'string' ? err.message : body.slice(0, 400);
  const where = url.replace(GRAPH_HOST, '');

  if (status === 401) {
    return `Graph rejected the access token on ${where}. It expired or was issued for the wrong ` +
      'audience; check the `aud` and `roles` claims. docs/m365-setup.md section 5.2.';
  }
  if (status === 403 && code === 'ErrorAccessDenied') {
    return `Exchange refused ${where}. The token is valid and carries the permission — the ` +
      'application access policy does not admit this mailbox. Run Test-ApplicationAccessPolicy ' +
      'against it, and allow for the permission cache. docs/m365-setup.md sections 3.4 and 3.5.';
  }
  if (status === 403 && code === 'Authorization_RequestDenied') {
    return `Entra refused ${where}. Admin consent has not been granted, or the permission was ` +
      'added as Delegated instead of Application — a client-credentials token cannot carry a ' +
      'delegated permission. docs/m365-setup.md section 2.5.';
  }
  if (status === 403) {
    return `Graph returned 403 ${code} on ${where}: ${message}`;
  }
  if (status === 404) {
    return `Graph could not find ${where}. MS_MAILBOX must be the full user principal name, ` +
      'not an alias. docs/m365-setup.md section 6.';
  }
  if (status === 400 && code === 'MailboxNotEnabledForRESTAPI') {
    return `The account behind ${where} has no cloud Exchange mailbox, so Graph will not serve ` +
      'it. Confirm it is hosted and licensed in Exchange Online.';
  }
  return `Graph returned ${status} ${code} on ${where}: ${message}`;
}

function safeJson(text: string): Record<string, any> | null {
  try {
    const value = JSON.parse(text);
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}

type CachedToken = { key: string; token: string; expiresAt: number };
let cached: CachedToken | null = null;

/*
 * One token per process, reused until it is nearly stale.
 *
 * A token is good for about an hour and a whole sync is seconds, so this is
 * effectively "fetch once" — but the cache is keyed on tenant and client so
 * that pointing the CLI at a second registration in the same process cannot
 * silently reuse the first one's token.
 */
export async function getAccessToken(env: GraphEnv): Promise<string> {
  const key = `${env.tenantId}|${env.clientId}`;
  if (cached && cached.key === key && Date.now() < cached.expiresAt - TOKEN_SKEW_MS) {
    return cached.token;
  }

  const body = new URLSearchParams({
    client_id: env.clientId,
    client_secret: env.clientSecret,
    scope: SCOPE,
    grant_type: 'client_credentials',
  });

  const res = await fetch(`${LOGIN_HOST}/${encodeURIComponent(env.tenantId)}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(tokenErrorMessage(res.status, text));

  const parsed = safeJson(text);
  const token = parsed && typeof parsed.access_token === 'string' ? parsed.access_token : null;
  if (!token) throw new Error(`Token endpoint returned 200 with no access_token: ${text.slice(0, 200)}`);

  const expiresIn = parsed && typeof parsed.expires_in === 'number' ? parsed.expires_in : 3600;
  cached = { key, token, expiresAt: Date.now() + expiresIn * 1000 };
  return token;
}

/** Only for tests and for a process that has just rotated the secret under itself. */
export function clearTokenCache(): void {
  cached = null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/*
 * Retry-After is in seconds here, but the header is also allowed to carry an
 * HTTP date, and Graph has been seen to send one. Parsing both costs three
 * lines and the alternative is a NaN that turns a polite wait into a tight
 * loop against a service that is already asking us to stop.
 */
function retryDelayMs(header: string | null, attempt: number): number {
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, MAX_BACKOFF_MS);
    const at = Date.parse(header);
    if (Number.isFinite(at)) return Math.min(Math.max(at - Date.now(), 0), MAX_BACKOFF_MS);
  }
  return Math.min(2 ** attempt * 1000, MAX_BACKOFF_MS);
}

async function fetchWithBackoff(url: string, env: GraphEnv): Promise<Response> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    let res: Response;
    try {
      const token = await getAccessToken(env);
      res = await fetch(url, { headers: { authorization: `Bearer ${token}`, accept: 'application/json' } });
    } catch (err) {
      // A dropped connection on a box that also runs eight other projects is
      // not a Graph problem, and it is the one failure worth simply repeating.
      lastError = err;
      if (attempt === MAX_ATTEMPTS - 1) break;
      await sleep(retryDelayMs(null, attempt));
      continue;
    }

    if (res.status !== 429 && res.status !== 503) return res;
    if (attempt === MAX_ATTEMPTS - 1) return res;
    await sleep(retryDelayMs(res.headers.get('retry-after'), attempt));
  }

  throw new Error(
    `Could not reach Microsoft Graph after ${MAX_ATTEMPTS} attempts: ` +
      (lastError instanceof Error ? lastError.message : String(lastError)),
  );
}

/*
 * GET a Graph collection, following @odata.nextLink to the end.
 *
 * Returns the concatenated `value` arrays. Paging is not optional even for
 * small windows: Graph caps a page well below `$top` whenever the rows are
 * fat, and a caller that reads only the first page gets a plausible-looking
 * result that is quietly short — the same failure shape as section 6's last
 * row, where an honest empty answer gets mistaken for a permissions problem.
 */
export async function graphGet<T>(
  env: GraphEnv,
  path: string,
  params: Record<string, string> = {},
): Promise<T[]> {
  const url = new URL(`${GRAPH_HOST}${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  const out: T[] = [];
  let next: string | null = url.toString();

  for (let page = 0; next && page < MAX_PAGES; page += 1) {
    const res = await fetchWithBackoff(next, env);
    const text = await res.text();
    if (!res.ok) throw new Error(graphErrorMessage(res.status, next, text));

    const parsed = safeJson(text);
    const value = parsed && Array.isArray(parsed.value) ? (parsed.value as T[]) : [];
    out.push(...value);

    const link = parsed ? parsed['@odata.nextLink'] : null;
    next = typeof link === 'string' && link ? link : null;
  }

  return out;
}

/** `/v1.0/users/<mailbox>` with the address escaped, since it goes in a path segment. */
export function mailboxPath(env: GraphEnv, suffix: string): string {
  return `/v1.0/users/${encodeURIComponent(env.mailbox)}${suffix}`;
}
