/**
 * Feature flags for hiding modules without removing them.
 *
 * Flipping one of these to `false` hides the module's navigation entry. The
 * routes, components, API handlers and data are all left intact, so the module
 * is still reachable by direct URL and comes back by flipping the flag — no
 * migration, no restore, nothing to rebuild.
 */
export const FEATURES = {
  /**
   * Book writing module (/books). Hidden 2026-08-02, re-enabled 2026-09-17 —
   * it still holds 4 books, 13 chapters and 92 saved versions. Refinement is
   * tracked in docs/TASKS.md; the module is February-era and predates the
   * Vitality Evolution UI pass.
   */
  books: true,
  /**
   * Sermon prep module (/sermons). Hidden 2026-08-02, re-enabled 2026-09-17.
   * Never carried real content — 0 series, 0 sermons — so it comes back as a
   * working shell rather than a restore. Refinement tracked in docs/TASKS.md.
   */
  sermons: true,
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
