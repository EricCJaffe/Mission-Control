/**
 * Feature flags for hiding modules without removing them.
 *
 * Flipping one of these to `false` hides the module's navigation entry. The
 * routes, components, API handlers and data are all left intact, so the module
 * is still reachable by direct URL and comes back by flipping the flag — no
 * migration, no restore, nothing to rebuild.
 */
export const FEATURES = {
  /** Book writing module (/books) — hidden 2026-08-02, may return. */
  books: false,
  /** Sermon prep module (/sermons) — hidden 2026-08-02, may return. */
  sermons: false,
} as const;

export type FeatureName = keyof typeof FEATURES;

export function isEnabled(feature: FeatureName): boolean {
  return FEATURES[feature];
}
