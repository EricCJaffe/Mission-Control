# Microsoft 365 Setup (Outlook Mail and Calendar Sync)

Mission Control is gaining a sync that pulls Outlook mail and calendar for
`eric@foundationstoneadvisors.com` into Supabase. The sync is a headless Node
CLI. It runs from a systemd timer on `ubuntu-dev` — not in the browser, and not
on Vercel. This document is the setup Eric does once, in the Microsoft Entra
admin center and in Exchange Online PowerShell, before any of that code has
anything to talk to.

Read section 3 before you do anything in section 2. Application permissions in
Microsoft 365 are tenant-wide by default, and section 3 is the part that stops
this being a very bad idea.

## Leave Mail.Send off for the first run

Add `Mail.Read` and `Calendars.Read` now. **Do not add `Mail.Send` yet.**

The reads get verified first — a token, a message, a calendar event, all
confirmed with curl before a line of sync code runs. `Mail.Send` is only added
later, when the morning brief is actually ready to be delivered by email. Until
then, an app that can only read is an app that cannot embarrass you by sending
something.

This costs nothing to defer. Adding a permission later is the same three clicks
plus a fresh admin consent, and the token picks it up on the next request.

## 1. What is being created, and why app-only

| Piece | What it is |
| --- | --- |
| App registration | An identity in the Entra tenant that the CLI authenticates as |
| Application (client) ID | Public identifier for that identity |
| Directory (tenant) ID | Which Microsoft 365 tenant it belongs to |
| Client secret | The password the CLI presents to prove it is that identity |
| Application permissions | What the identity may do, granted by an admin, with no user in the loop |
| Application access policy | The Exchange-side restriction that limits it to one mailbox |

There are two ways to talk to Microsoft Graph, and the choice matters more than
it first appears.

**Delegated auth** acts *as a signed-in user*. Someone opens a browser, signs
in, consents, and the app receives an access token plus a refresh token. The
refresh token is then used to mint new access tokens as they expire. This is the
right model for a web app where a person is sitting there.

**App-only auth** — the OAuth2 client credentials flow — acts *as itself*. The
app sends its client ID and secret to the token endpoint and receives an access
token. There is no user, no browser, no consent screen at run time, and no
refresh token.

App-only is the right fit here for two plain reasons:

- **Nobody is present at 3am when the timer fires.** A delegated flow needs an
  interactive sign-in to bootstrap, and a device-code or browser prompt at any
  point after that stops the sync dead until someone notices.
- **There is no refresh-token rotation to babysit.** Refresh tokens expire, get
  revoked by a password change or a conditional access policy, and rotate on
  use — which means persisting the new one after every single call, and a
  crash mid-write can leave the stored token stale and unrecoverable. Client
  credentials has none of that. The CLI asks for a token, gets one good for
  about an hour, uses it, and throws it away.

The cost of app-only is exactly the thing section 3 fixes: application
permissions are granted against the tenant, not against a mailbox.

## 2. Register the application

The portal has been renamed. What used to be "Azure Active Directory" in the
Azure portal is now **Microsoft Entra ID**, and app registrations live in the
**Microsoft Entra admin center** at <https://entra.microsoft.com>. The old path
via <https://portal.azure.com> still works and redirects to the same blades —
either is fine, but the menu names below are the Entra admin center's.

### 2.1 Create the registration

1. Sign in to <https://entra.microsoft.com> as an account with at least the
   **Application Developer** role. Eric is tenant admin, so this is covered.
2. If the account can see more than one tenant, use the **Settings** (gear) icon
   in the top bar to switch to the `foundationstoneadvisors.com` tenant. Getting
   this wrong produces an app registration in the wrong directory that then
   fails authentication with a confusing "application not found" error.
3. Browse to **Entra ID** > **App registrations**, then select
   **New registration**.
4. **Name**: `Mission Control Sync`. This is only a label; it can be changed
   later and it appears in audit logs, so make it recognisable.
5. **Supported account types**: **Single tenant only —
   Foundation Stone Advisors**. There is no reason for anything wider.
6. **Redirect URI**: leave it blank. Client credentials never redirects
   anywhere; a redirect URI here is a delegated-flow artefact.
7. Select **Register**.

### 2.2 Record the two IDs

The **Overview** page appears immediately after registering. Two values on it
are needed:

| Field on the Overview page | Environment variable |
| --- | --- |
| **Application (client) ID** | `MS_CLIENT_ID` |
| **Directory (tenant) ID** | `MS_TENANT_ID` |

Both are GUIDs. Neither is secret — they are identifiers, not credentials — so
they are safe in a systemd unit or a shared note. Copy them somewhere now; you
will come back to this page anyway, but it saves a trip.

### 2.3 Create a client secret

1. In the app registration, select **Certificates & secrets** under **Manage**.
2. Select the **Client secrets** tab, then **New client secret**.
3. **Description**: something that will still make sense in a year, e.g.
   `ubuntu-dev sync CLI 2026-09`.
4. **Expires**: pick a lifetime. The dropdown offers preset periods and a
   **Custom** option; the hard ceiling is **24 months**, and Microsoft's own
   recommendation is under 12. See section 7 before choosing.
5. Select **Add**.

**The secret's Value is shown exactly once.** After the page is left or
refreshed, the **Value** column shows a masked stub and there is no way to
retrieve it — the only recovery is to delete the secret and create a new one.
The **Secret ID** shown next to it is *not* the secret; it is a GUID that
identifies the credential entry. `MS_CLIENT_SECRET` is the **Value**, and it
generally looks like a ~40-character string of letters, digits, `~`, `.`, `-`
and `_`.

Copy it straight into `.env.local` (section 4) before doing anything else in the
portal.

Microsoft prefers certificates over secrets for production workloads, and they
are right in general. A secret is being used here because the consumer is a
single CLI on one box, the secret never leaves that box, and certificate
rotation is a heavier ceremony than this sync justifies. If the sync ever moves
somewhere less private, revisit that.

### 2.4 Add application permissions

This is the step people get wrong, and the mistake is silent until the first
call returns 403.

1. Select **API permissions** under **Manage**, then **Add a permission**.
2. Choose **Microsoft Graph**.
3. Choose **Application permissions** — **not** *Delegated permissions*.
   Delegated permissions are the ones that require a signed-in user, and a
   client-credentials token will simply not carry them. The screen offers both
   and defaults to Delegated, so read the two tiles before clicking.
4. Search for and tick:

   | Permission | Type | Why |
   | --- | --- | --- |
   | `Mail.Read` | Application | Read messages in the target mailbox |
   | `Calendars.Read` | Application | Read events and the calendar view |
   | `Mail.Send` | Application | **Add later.** See the note at the top. |

5. Select **Add permissions**.

The default `User.Read` delegated permission that Entra adds on registration is
harmless and unused by this flow. It can be removed for tidiness; it makes no
practical difference.

### 2.5 Grant admin consent, and confirm it took

Application permissions do nothing at all until an admin consents to them. The
permission list will show each new row with a **Status** of "Not granted for
Foundation Stone Advisors", usually with a warning triangle.

1. On the **API permissions** page, select
   **Grant admin consent for Foundation Stone Advisors**.
2. Confirm with **Yes**.
3. Select **Refresh**.
4. Check the **Status** column. Each application permission must read
   **Granted for Foundation Stone Advisors** with a green tick.

If the button is greyed out, the signed-in account lacks the Privileged Role
Administrator, Cloud Application Administrator, or Global Administrator role.
If the status stays "Not granted" after a refresh, consent did not apply —
re-run it rather than assuming propagation delay, because consent itself is
effectively immediate even though token caches lag it.

The green tick is the only reliable confirmation. A permission that is listed
but not consented looks almost identical at a glance, and produces
`Authorization_RequestDenied` at run time (section 6).

## 3. Scope the app to one mailbox — do not skip this

**Application permissions apply to every mailbox in the tenant.** That is not a
misconfiguration; it is how they are defined. `Mail.Read` as an application
permission means "read email in *all* mailboxes without a signed-in user", and
Graph will honour that against any address in `foundationstoneadvisors.com` that
the app cares to name in the URL.

Stated plainly: if you stop after section 2, you have put a password on a
development machine that reads the whole company's email. Not Eric's email —
everyone's. The secret sits in a file on a box that also runs eight other
projects, several browser sessions, and a lot of `npm install`. That is a
credential worth stealing, and there is nothing about the app registration
itself that limits the blast radius.

The fix is an **application access policy** in Exchange Online. It restricts a
named app to a named set of mailboxes, and it is enforced by Exchange on every
Graph and EWS request — not by the app's own good manners.

### 3.1 Connect to Exchange Online PowerShell

The Exchange Online module runs on PowerShell 7, which is available on Linux, so
this can be done from `ubuntu-dev`. It is often simpler on a Windows machine or
in Azure Cloud Shell, where the interactive sign-in is less fiddly.

```powershell
Install-Module -Name ExchangeOnlineManagement -Scope CurrentUser
Import-Module ExchangeOnlineManagement

Connect-ExchangeOnline -UserPrincipalName eric@foundationstoneadvisors.com
```

On Linux, or anywhere a browser cannot pop, add `-Device` and complete the
device-code sign-in at <https://microsoft.com/devicelogin>:

```powershell
Connect-ExchangeOnline -UserPrincipalName eric@foundationstoneadvisors.com -Device
```

Creating an access policy requires membership of the **Organization Management**
role group, or the Exchange Administrator role in Entra. Tenant admin covers it.

### 3.2 Create the scoping group (optional but preferred)

A policy can point straight at a single mailbox. It can also point at a
**mail-enabled security group**, which is the better shape: adding a second
mailbox later becomes a group membership change rather than a policy rewrite,
and the group's name documents intent in a way a bare address does not.

```powershell
New-DistributionGroup `
  -Name "Mission Control Sync Mailboxes" `
  -Alias mc-sync-scope `
  -PrimarySmtpAddress mc-sync-scope@foundationstoneadvisors.com `
  -Type Security `
  -Members eric@foundationstoneadvisors.com
```

`-Type Security` is load-bearing. It produces a `MailUniversalSecurityGroup`,
which is a security principal. A plain distribution group is **not** a security
principal and `New-ApplicationAccessPolicy` will reject it. Verify:

```powershell
Get-Recipient -Identity mc-sync-scope@foundationstoneadvisors.com |
  Select-Object Name, RecipientTypeDetails, IsValidSecurityPrincipal
```

`IsValidSecurityPrincipal` must be `True`. Shared mailboxes and resource
mailboxes are not valid principals either, which is precisely why the group
approach exists — put them in the group instead.

Group creation propagates through the directory; give it a few minutes before
the next step if the policy cmdlet cannot find it.

### 3.3 Create the access policy

```powershell
New-ApplicationAccessPolicy `
  -AccessRight RestrictAccess `
  -AppId "<Application (client) ID from section 2.2>" `
  -PolicyScopeGroupId mc-sync-scope@foundationstoneadvisors.com `
  -Description "Mission Control sync CLI: Eric's mailbox only."
```

To scope to the single mailbox with no group at all, pass the mailbox as the
scope instead:

```powershell
New-ApplicationAccessPolicy `
  -AccessRight RestrictAccess `
  -AppId "<Application (client) ID>" `
  -PolicyScopeGroupId eric@foundationstoneadvisors.com `
  -Description "Mission Control sync CLI: Eric's mailbox only."
```

The two `-AccessRight` values behave as follows:

| Value | Effect |
| --- | --- |
| `RestrictAccess` | The app may access **only** the mailboxes in scope. This is what we want. |
| `DenyAccess` | The app may access everything **except** the mailboxes in scope. A blocklist, and the wrong default posture here. |

`RestrictAccess` is the allowlist. Use it. Where both kinds of policy match the
same app and mailbox, `DenyAccess` wins.

### 3.4 Test it, including the negative case

`Test-ApplicationAccessPolicy` asks Exchange the same question the API will ask,
and it bypasses the permission cache, so it answers immediately rather than
after propagation.

```powershell
# Should return Granted
Test-ApplicationAccessPolicy `
  -Identity eric@foundationstoneadvisors.com `
  -AppId "<Application (client) ID>"

# Should return Denied — this is the test that actually proves the policy works
Test-ApplicationAccessPolicy `
  -Identity someone.else@foundationstoneadvisors.com `
  -AppId "<Application (client) ID>"
```

Look at `AccessCheckResult` in the output. The first must be `Granted`; the
second must be `Denied`. **Run the second one.** A policy that grants access to
the intended mailbox proves nothing on its own — an unscoped app grants that
too. Only the denial proves the scope exists.

List what is in place at any time with:

```powershell
Get-ApplicationAccessPolicy
```

### 3.5 Propagation, and why a passing curl can still be wrong

The policy is authoritative in `Test-ApplicationAccessPolicy` straight away, but
Graph caches an app's effective permissions for roughly 30 minutes to 2 hours
depending on how recently the app has been active. Access tokens are also valid
for about an hour regardless.

Practically: after creating or tightening a policy, a curl test against a
mailbox that should now be denied may still succeed for up to a couple of hours.
That is cache, not failure. Trust the `Test-` cmdlet, wait, and re-test.

### 3.6 A note on the newer mechanism

Microsoft now positions **RBAC for Applications** in Exchange Online as the
replacement for application access policies, and the
`New-ApplicationAccessPolicy` reference carries a notice advising against new
policies. Application access policies still work, are not yet formally
deprecated, and are considerably less ceremony for a one-mailbox scope, which is
why they are what this document uses.

The RBAC equivalent, for when this eventually has to migrate:

```powershell
New-ServicePrincipal -AppId <client id> -ObjectId <enterprise app object id> -DisplayName "Mission Control Sync"
New-ManagementScope -Name "Mission Control scope" -RecipientRestrictionFilter "MemberOfGroup -eq '<group DN>'"
New-ManagementRoleAssignment -App <service principal object id> -Role "Application Mail.Read" -CustomResourceScope "Mission Control scope"
Test-ServicePrincipalAuthorization -Identity "Mission Control Sync" -Resource eric@foundationstoneadvisors.com
```

One trap worth recording now, because it silently defeats the whole exercise:
Entra grants and Exchange RBAC grants are a **union**. If the app keeps an
unscoped `Mail.Read` in Entra *and* gains a scoped `Mail.Read` via RBAC, the
result is unscoped. Migrating means removing the Entra consent, not just adding
the RBAC assignment.

## 4. Environment variables

The CLI reads four variables:

| Variable | Value | Secret? |
| --- | --- | --- |
| `MS_TENANT_ID` | Directory (tenant) ID GUID (section 2.2) | No |
| `MS_CLIENT_ID` | Application (client) ID GUID (section 2.2) | No |
| `MS_CLIENT_SECRET` | The secret **Value** from section 2.3 | **Yes** |
| `MS_MAILBOX` | `eric@foundationstoneadvisors.com` | No |

`MS_MAILBOX` is the mailbox the CLI targets in the Graph URL. It is deliberately
a variable rather than a hardcoded address so the same code can be pointed at a
different mailbox without an edit — but note that changing it does **not** widen
access, because the access policy in section 3 decides that independently. A
mistyped `MS_MAILBOX` produces a 403 or a 404, not a leak.

### 4.1 For hand runs — `.env.local`

```bash
# /home/admxn/dev/mission-control/.env.local
MS_TENANT_ID=00000000-0000-0000-0000-000000000000
MS_CLIENT_ID=00000000-0000-0000-0000-000000000000
MS_CLIENT_SECRET=your~secret~value~here
MS_MAILBOX=eric@foundationstoneadvisors.com
```

`.env.local` is gitignored — the repo's `.gitignore` excludes `.env*` wholesale
— and **`MS_CLIENT_SECRET` must never be committed**. A client secret in git
history is not fixed by a later commit; it is fixed by deleting the secret in
the portal and issuing a new one, which is section 7's procedure done under
pressure.

The other three values are not secrets and committing them would be untidy
rather than dangerous, but keep all four together so there is one place to look.

Tighten the file mode while you are there:

```bash
chmod 600 /home/admxn/dev/mission-control/.env.local
```

### 4.2 For the timer — systemd `EnvironmentFile`

The timer runs outside any shell that would source `.env.local`, so it needs its
own copy. Put it somewhere the unit can read and the rest of the box cannot:

```bash
sudo install -d -m 700 /etc/mission-control
sudo install -m 600 /dev/null /etc/mission-control/m365.env
sudo tee /etc/mission-control/m365.env >/dev/null <<'EOF'
MS_TENANT_ID=00000000-0000-0000-0000-000000000000
MS_CLIENT_ID=00000000-0000-0000-0000-000000000000
MS_CLIENT_SECRET=your~secret~value~here
MS_MAILBOX=eric@foundationstoneadvisors.com
EOF
```

`/etc/systemd/system/mission-control-m365-sync.service`:

```ini
[Unit]
Description=Mission Control — pull Outlook mail and calendar into Supabase
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=admxn
WorkingDirectory=/home/admxn/dev/mission-control
EnvironmentFile=/etc/mission-control/m365.env
EnvironmentFile=/etc/mission-control/supabase.env
ExecStart=/home/admxn/.local/share/fnm/aliases/default/bin/node scripts/m365-sync.mjs
```

`/etc/systemd/system/mission-control-m365-sync.timer`:

```ini
[Unit]
Description=Run the Mission Control M365 sync every 30 minutes

[Timer]
OnBootSec=5min
OnUnitActiveSec=30min
Persistent=true

[Install]
WantedBy=timers.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now mission-control-m365-sync.timer
systemctl list-timers mission-control-m365-sync.timer
journalctl -u mission-control-m365-sync.service -n 50
```

Three things that bite here:

- **`EnvironmentFile` is not a shell script.** No `export`, no `$VAR`
  interpolation, no command substitution, and no inline comment after a value on
  the same line. `.env.local` and this file happen to look alike; they are not
  the same format, so do not symlink one to the other and assume it works.
- **`Persistent=true` matters.** The dev box is not always on. Without it, a
  timer whose window passed while the machine was down simply skips.
- **The node path must be absolute.** systemd does not source `~/.profile`, so
  the fnm-managed toolchain is invisible to it — the same trap the Paperclip
  user service hits. Confirm the real path with `readlink -f "$(which node)"`
  and use that, or wrap the command in `/bin/bash -lc`.

A user-level unit under `~/.config/systemd/user/` is a reasonable alternative
and keeps the secret out of `/etc`, but it requires `loginctl enable-linger
admxn` (already set on this box) or the timer dies when nobody is logged in.

## 5. Verify with curl, before writing any code

Do the whole loop by hand first. If these three commands work, the remaining
problem is code; if they do not, no amount of code will help.

Load the values into the shell:

```bash
set -a; . /home/admxn/dev/mission-control/.env.local; set +a
```

### 5.1 Fetch a token

```bash
TOKEN=$(curl -s -X POST \
  "https://login.microsoftonline.com/${MS_TENANT_ID}/oauth2/v2.0/token" \
  --data-urlencode "client_id=${MS_CLIENT_ID}" \
  --data-urlencode "client_secret=${MS_CLIENT_SECRET}" \
  --data-urlencode "scope=https://graph.microsoft.com/.default" \
  --data-urlencode "grant_type=client_credentials" \
  | jq -r .access_token)

echo "${TOKEN:0:24}..."
```

`--data-urlencode` rather than `-d` is deliberate: client secrets contain
characters such as `~` and `.` that are fine, but historically also `+` and `/`,
and a raw `+` in a form body decodes as a space. That failure presents as
`invalid_client`, which sends you hunting for the wrong problem.

The scope is literally `https://graph.microsoft.com/.default`. Client
credentials cannot request individual scopes — `.default` means "every
application permission this app has been consented for". Asking for
`Mail.Read` by name here returns an error.

If `$TOKEN` is empty, drop the `| jq` and read the raw JSON; the `error` and
`error_description` fields name the exact `AADSTS` code (section 6).

### 5.2 Check what the token actually carries

Worth doing once. The `roles` claim lists the application permissions the token
was issued with, which distinguishes "consent never happened" from "the mailbox
is out of scope" before you make a single Graph call.

```bash
python3 - "$TOKEN" <<'PY'
import base64, json, sys
p = sys.argv[1].split('.')[1]
p += '=' * (-len(p) % 4)
c = json.loads(base64.urlsafe_b64decode(p))
print(json.dumps({k: c.get(k) for k in ("aud", "tid", "app_displayname", "roles")}, indent=2))
PY
```

Expect `aud` of `https://graph.microsoft.com` and `roles` containing
`Mail.Read` and `Calendars.Read`. If `roles` is missing entirely, admin consent
did not take — go back to section 2.5.

### 5.3 Read one message

```bash
curl -s -H "Authorization: Bearer ${TOKEN}" \
  "https://graph.microsoft.com/v1.0/users/${MS_MAILBOX}/messages?\$top=1&\$select=subject,receivedDateTime,from" \
  | jq
```

The `$` in `$top` and `$select` must be escaped inside double quotes, or bash
expands it to nothing and Graph returns every field of every message.

### 5.4 Read the calendar

`calendarView` **requires** `startDateTime` and `endDateTime`. Omitting them is
a 400, not a default range. Unlike `/events`, it expands recurring series into
their individual occurrences, which is what a sync wants.

```bash
curl -s -G -H "Authorization: Bearer ${TOKEN}" \
  -H 'Prefer: outlook.timezone="America/New_York"' \
  --data-urlencode "startDateTime=$(date -u +%Y-%m-%dT00:00:00Z)" \
  --data-urlencode "endDateTime=$(date -u -d '+7 days' +%Y-%m-%dT00:00:00Z)" \
  --data-urlencode '$top=10' \
  --data-urlencode '$select=subject,start,end,organizer,isAllDay' \
  "https://graph.microsoft.com/v1.0/users/${MS_MAILBOX}/calendarView" \
  | jq
```

The `Prefer: outlook.timezone` header controls the timezone the *response* times
are rendered in; it does not affect how `startDateTime` and `endDateTime` are
interpreted. Those are read from their own offset, or treated as UTC when they
carry none. Given the rest of Mission Control settles times in
`America/New_York`, request them in ET and store UTC.

### 5.5 Prove the scope holds

The last verification is the one section 3.4 already did in PowerShell, repeated
through the real API:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer ${TOKEN}" \
  "https://graph.microsoft.com/v1.0/users/someone.else@foundationstoneadvisors.com/messages?\$top=1"
```

A `403` is the correct and desired answer. A `200` means the access policy is
absent, wrong, or still inside its cache window (section 3.5).

## 6. Troubleshooting

| Status and code | What it means | Fix |
| --- | --- | --- |
| `401` `invalid_client`, `AADSTS7000215` | Invalid client secret. Wrong value, a truncated paste, or the Secret **ID** copied instead of the **Value**. | Re-copy the Value; if it has been lost, delete the secret and create a new one (section 2.3). |
| `401` `invalid_client`, `AADSTS7000222` | The secret has expired. | Rotate it — section 7. |
| `401` `unauthorized_client`, `AADSTS700016` | The application was not found in this tenant. Usually `MS_TENANT_ID` and `MS_CLIENT_ID` come from different directories. | Re-read both GUIDs off the Overview page of the same registration. |
| `400` `invalid_scope` | A named scope was requested instead of `.default`. | Use `https://graph.microsoft.com/.default` exactly. |
| `403` `Authorization_RequestDenied` — "Insufficient privileges to complete the operation." | Entra-side. The permission was never added, was added as *Delegated* rather than *Application*, or admin consent was not granted. | Check the token's `roles` claim (5.2). Then check **API permissions** shows **Granted for Foundation Stone Advisors** with a green tick (2.5). |
| `403` `ErrorAccessDenied` — "Access is denied. Check credentials and try again." | Exchange-side. The token is valid and carries the right role, but the access policy does not admit this mailbox. **This is the usual meaning of a 403 once consent is confirmed.** | `Test-ApplicationAccessPolicy` against that mailbox (3.4). Add the mailbox to the scoping group, or correct the policy. Allow for cache (3.5). |
| `404` `ResourceNotFound` / `Request_ResourceNotFound` | `MS_MAILBOX` does not resolve to a user in this tenant. Typo, or an alias where the UPN was needed. | Use the full user principal name. |
| `400` `MailboxNotEnabledForRESTAPI` | The account exists but has no Exchange Online mailbox, or it is on-premises. | Confirm the mailbox is cloud-hosted and licensed. |
| `400` on `calendarView` | `startDateTime` or `endDateTime` missing. | Both are required query parameters (5.4). |
| `429` with a `Retry-After` header | Graph throttling. | Honour `Retry-After`. Back off; do not retry in a tight loop. |
| `200` with `{"value": []}` | **Not an error.** The call succeeded and the mailbox or window genuinely holds nothing matching. An empty calendar week and a fresh Inbox filter both look like this. | Widen the window or drop the filter before assuming a fault. Distinguish this from a 403 by the status code, never by the emptiness of the result. |

That last row is worth dwelling on. The most common way to waste an afternoon
here is to read an empty `value` array as a permissions problem and start
re-granting consent, when the request was fine and the range was simply wrong.
Check the HTTP status first, every time.

## 7. Secret rotation

Client secrets expire. Entra offers preset lifetimes plus a **Custom** option,
capped at **24 months**; the values in common use are 6, 12 and 24 months, and
Microsoft recommends under 12.

Twelve months is the sensible choice here: long enough not to be a chore, short
enough that a leaked secret has a bounded life.

**Where to see the expiry.** App registration > **Certificates & secrets** >
**Client secrets**. The **Expires** column shows the date for each secret. From
the command line:

```powershell
Get-MgApplication -Filter "appId eq '<client id>'" |
  Select-Object -ExpandProperty PasswordCredentials |
  Select-Object DisplayName, StartDateTime, EndDateTime
```

**Set a calendar reminder for two weeks before the date**, in the Outlook
calendar this sync reads. This is not optional bookkeeping. The failure mode is
silent: the timer fires, the token request returns `AADSTS7000222`, the CLI
exits non-zero, and nothing tells anyone. Mission Control simply shows mail and
calendar data that quietly stops advancing, and the gap is only noticed when
some downstream view looks stale — by which point the sync has been dead for
days.

**Rotating without downtime.** An app registration can hold more than one valid
secret at once, so there is no need for a break:

1. Create the new secret (section 2.3) while the old one is still valid.
2. Update `MS_CLIENT_SECRET` in both `.env.local` and
   `/etc/mission-control/m365.env`.
3. Run the section 5.1 curl to confirm the new value mints a token.
4. `sudo systemctl start mission-control-m365-sync.service` and check
   `journalctl` for a clean run.
5. Only then delete the old secret in the portal.

Deleting first and creating second inverts steps 1 and 5 and guarantees an
outage, so resist it even though the portal makes deletion the easier click.

Rotating the secret does **not** disturb the app registration, its permissions,
the admin consent, or the access policy. Those are attached to the application,
not to the credential. A rotation is a four-line edit and a restart.
