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
  /**
   * Monthly Alignment review (/reviews/new, dashboard "Alignment Status").
   * Retired 2026-08-02 — it overlapped the Flourishing survey by ~70% and had
   * never been completed. Its one distinctive contribution, the priority
   * weighting, now lives in DOMAIN_WEIGHTS in flourishing/spirit-soul-body.ts,
   * so nothing was lost by hiding it. Past reviews remain in monthly_reviews.
   */
  monthlyAlignment: false,
  /**
   * Standalone /metrics page. Hidden 2026-08-02 — everything it showed now
   * lives on the dashboard, so it was a second place to look for the same
   * numbers. Route and data are untouched.
   */
  metricsPage: false,
} as const;

export type FeatureName = keyof typeof FEATURES;

export function isEnabled(feature: FeatureName): boolean {
  return FEATURES[feature];
}
