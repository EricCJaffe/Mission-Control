/*
 * Environment for the sync CLI.
 *
 * This runs headless from a systemd timer on ubuntu-dev, so it must work with
 * nothing but environment variables. It also has to be runnable by hand from
 * the repo, where .env.local already holds the service-role key — so the
 * caller loads that file with `node --env-file-if-exists=.env.local`, and
 * everything here reads plain process.env.
 *
 * Fails loudly and early. A sync that starts with a missing key and discovers
 * it three projects in has already written a partial run.
 */

export type SyncEnv = {
  supabaseUrl: string;
  serviceRoleKey: string;
  userId: string;
  devRoot: string;
  /** The chief-of-staff repo. Defaults to `<devRoot>/brain`; see lib/brain.ts. */
  brainRoot: string;
};

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. The sync needs SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL), ` +
        'SUPABASE_SERVICE_ROLE_KEY and MC_USER_ID. Run it with ' +
        '`node --env-file-if-exists=.env.local` from the repo, or set them in the timer unit.',
    );
  }
  return value;
}

/** `~/dev` expanded, with a trailing slash stripped. */
export function expandHome(p: string): string {
  const home = process.env.HOME ?? '';
  const expanded = p.startsWith('~/') ? `${home}/${p.slice(2)}` : p === '~' ? home : p;
  return expanded.replace(/\/+$/, '');
}

export function loadEnv(): SyncEnv {
  const supabaseUrl = process.env.SUPABASE_URL ?? required('NEXT_PUBLIC_SUPABASE_URL');
  const serviceRoleKey = required('SUPABASE_SERVICE_ROLE_KEY');
  const userId = required('MC_USER_ID');
  const devRoot = expandHome(process.env.DEV_ROOT ?? '~/dev');
  const brainRoot = expandHome(process.env.BRAIN_ROOT ?? `${devRoot}/brain`);

  // The service-role key bypasses RLS entirely, so pointing it at the wrong
  // project would write Mission Control's rows into someone else's database
  // without a single permission error to warn you.
  if (!supabaseUrl.includes('uivawtdmxqutqelwibra')) {
    console.warn(
      `[sync] warning: SUPABASE_URL is ${supabaseUrl}, which is not the shared project ` +
        'this app lives in. Continuing, but check that this is deliberate.',
    );
  }

  return { supabaseUrl, serviceRoleKey, userId, devRoot, brainRoot };
}
