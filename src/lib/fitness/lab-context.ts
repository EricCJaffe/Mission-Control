/**
 * Selects and formats lab results for AI context.
 *
 * Written as its own module because the selection is the hard part, not the
 * query. A full history here runs to hundreds of results across years of
 * panels — pasting all of it would blow the context window and bury the
 * findings that matter under decades of normal chemistry.
 *
 * The rules:
 *  - Latest value per test, so a test drawn ten times appears once.
 *  - Everything the lab flagged is included, always.
 *  - Normal results are included only for tests that matter to this user's
 *    decisions (lipids, renal, glycaemic, inflammatory), because "LDL is 54"
 *    is exactly as informative as "LDL is 180" when deciding on a statin.
 *  - A prior value is attached where one exists, since direction is often
 *    more actionable than the number.
 */

export type LabResultRow = {
  test_name: string;
  test_category: string | null;
  value: number | null;
  value_text: string | null;
  unit: string | null;
  flag: string | null;
  reference_range_text?: string | null;
  panel_id: string;
};

export type LabPanelRow = {
  id: string;
  panel_date: string;
  lab_name: string | null;
  notes: string | null;
};

export type LabSummaryEntry = {
  test: string;
  value: string;
  unit: string | null;
  flag: string;
  date: string;
  previous: { value: string; date: string } | null;
  direction: 'up' | 'down' | 'flat' | null;
};

export type LabSummary = {
  latestPanelDate: string | null;
  panelCount: number;
  /** Flagged results drawn within STALE_AFTER_MONTHS. */
  abnormal: LabSummaryEntry[];
  /**
   * Flagged results older than that. Kept separate rather than dropped: a
   * historical abnormal is worth knowing about, but presenting a 2023
   * testosterone in the same list as this month's creatinine invites reading
   * it as current — which is the kind of error that changes a prescription.
   */
  historicalAbnormal: LabSummaryEntry[];
  keyNormals: LabSummaryEntry[];
  /** Tests present in the record but omitted from the prompt. */
  omittedCount: number;
};

/** Beyond this, a result describes the past rather than the present. */
export const STALE_AFTER_MONTHS = 12;

function monthsBetween(fromIso: string, toIso: string): number {
  const [fy, fm] = fromIso.split('-').map(Number);
  const [ty, tm] = toIso.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

/**
 * Tests worth reporting even when normal, because treatment decisions turn on
 * the actual number rather than on whether it cleared a reference range.
 */
const DECISION_RELEVANT = [
  /ldl/i,
  /hdl/i,
  /cholesterol/i,
  /triglyceride/i,
  /lipoprotein|lp\(a\)/i,
  /apolipoprotein|apo ?b/i,
  /creatinine/i,
  /egfr|gfr/i,
  /potassium/i,
  /sodium/i,
  /glucose/i,
  /a1c|hemoglobin a1c/i,
  /crp|c-reactive/i,
  /bnp|nt-probnp/i,
  /troponin/i,
  /tsh/i,
  /vitamin d|25-oh/i,
  /ferritin/i,
  /alt|ast|alkaline phosphatase/i,
  /hemoglobin$/i,
  /hematocrit/i,
  /platelet/i,
];

function isDecisionRelevant(testName: string): boolean {
  return DECISION_RELEVANT.some((re) => re.test(testName));
}

function displayValue(r: LabResultRow): string {
  if (r.value !== null && r.value !== undefined) return String(r.value);
  return r.value_text ?? '—';
}

/**
 * @param panels newest-first or any order; sorted internally
 * @param results all results for those panels
 */
export function summariseLabs(
  panels: LabPanelRow[],
  results: LabResultRow[],
  today: string = new Date().toISOString().slice(0, 10)
): LabSummary {
  if (panels.length === 0 || results.length === 0) {
    return {
      latestPanelDate: null,
      panelCount: 0,
      abnormal: [],
      historicalAbnormal: [],
      keyNormals: [],
      omittedCount: 0,
    };
  }

  const dateByPanel = new Map(panels.map((p) => [p.id, p.panel_date]));
  const sorted = [...panels].sort((a, b) => b.panel_date.localeCompare(a.panel_date));

  // test name -> occurrences newest-first
  const byTest = new Map<string, Array<{ row: LabResultRow; date: string }>>();
  for (const r of results) {
    const date = dateByPanel.get(r.panel_id);
    if (!date) continue;
    const key = r.test_name.trim().toLowerCase();
    const list = byTest.get(key) ?? [];
    list.push({ row: r, date });
    byTest.set(key, list);
  }
  for (const list of byTest.values()) list.sort((a, b) => b.date.localeCompare(a.date));

  const abnormal: LabSummaryEntry[] = [];
  const historicalAbnormal: LabSummaryEntry[] = [];
  const keyNormals: LabSummaryEntry[] = [];
  let omitted = 0;

  for (const list of byTest.values()) {
    const latest = list[0];
    const prior = list[1] ?? null;
    const flag = (latest.row.flag ?? 'normal').toLowerCase();
    const isAbnormal = flag !== 'normal';

    if (!isAbnormal && !isDecisionRelevant(latest.row.test_name)) {
      omitted += 1;
      continue;
    }

    let direction: LabSummaryEntry['direction'] = null;
    if (prior && latest.row.value !== null && prior.row.value !== null) {
      const delta = latest.row.value - prior.row.value;
      const scale = Math.abs(prior.row.value) || 1;
      direction = Math.abs(delta) / scale < 0.05 ? 'flat' : delta > 0 ? 'up' : 'down';
    }

    const entry: LabSummaryEntry = {
      test: latest.row.test_name,
      value: displayValue(latest.row),
      unit: latest.row.unit,
      flag,
      date: latest.date,
      previous: prior ? { value: displayValue(prior.row), date: prior.date } : null,
      direction,
    };

    if (isAbnormal) {
      if (monthsBetween(entry.date, today) > STALE_AFTER_MONTHS) historicalAbnormal.push(entry);
      else abnormal.push(entry);
    } else if (monthsBetween(entry.date, today) <= STALE_AFTER_MONTHS) {
      keyNormals.push(entry);
    } else {
      // A stale normal is the least useful thing here — drop it entirely.
      omitted += 1;
    }
  }

  const byDateThenName = (a: LabSummaryEntry, b: LabSummaryEntry) =>
    b.date.localeCompare(a.date) || a.test.localeCompare(b.test);
  abnormal.sort(byDateThenName);
  historicalAbnormal.sort(byDateThenName);
  keyNormals.sort(byDateThenName);

  return {
    latestPanelDate: sorted[0]?.panel_date ?? null,
    panelCount: panels.length,
    abnormal,
    historicalAbnormal,
    keyNormals,
    omittedCount: omitted,
  };
}

function line(e: LabSummaryEntry): string {
  const unit = e.unit ? ` ${e.unit}` : '';
  const flag = e.flag !== 'normal' ? ` [${e.flag.toUpperCase()}]` : '';
  const arrow = e.direction === 'up' ? ' ↑' : e.direction === 'down' ? ' ↓' : '';
  const prev = e.previous ? ` (was ${e.previous.value}${unit} on ${e.previous.date}${arrow})` : '';
  return `- ${e.test}: ${e.value}${unit}${flag} — ${e.date}${prev}`;
}

/** Renders the summary for inclusion in an AI system prompt. */
export function formatLabsForPrompt(summary: LabSummary): string {
  if (!summary.latestPanelDate) return '';

  let out = `━━━ LAB RESULTS ━━━\n`;
  out += `Most recent panel: ${summary.latestPanelDate} (${summary.panelCount} panels on record)\n\n`;

  if (summary.abnormal.length > 0) {
    out += `Out of range, current (drawn within ${STALE_AFTER_MONTHS} months):\n`;
    out += summary.abnormal.map(line).join('\n');
    out += `\n\n`;
  } else {
    out += `Nothing flagged out of range in the last ${STALE_AFTER_MONTHS} months.\n\n`;
  }

  if (summary.historicalAbnormal.length > 0) {
    out += `Out of range HISTORICALLY — older than ${STALE_AFTER_MONTHS} months, `;
    out += `not necessarily still true and not re-tested since:\n`;
    out += summary.historicalAbnormal.map(line).join('\n');
    out += `\n\n`;
  }

  if (summary.keyNormals.length > 0) {
    out += `In range, decision-relevant:\n`;
    out += summary.keyNormals.map(line).join('\n');
    out += `\n\n`;
  }

  if (summary.omittedCount > 0) {
    out += `(${summary.omittedCount} further in-range results omitted for brevity.)\n\n`;
  }

  out += `Use these actual values when assessing medication or supplement changes. `;
  out += `Do not describe a baseline as unknown when a value appears above. `;
  out += `Treat anything under the HISTORICAL heading as a past finding needing `;
  out += `re-testing before it informs a decision, not as the current state.\n\n`;

  return out;
}
