/*
 * PORTED BY HAND from honeylakeos src/lib/tableView.ts on 2026-09-26.
 * Mission Control is not a BusinessOS descendant and takes no template merges,
 * so this copy does not update itself: when the fleet copy changes, port the
 * change here by hand.
 */

/**
 * Sorting, filtering and searching a submissions list.
 *
 * Kept out of the component because the fiddly parts are all decisions rather
 * than rendering: what "empty" sorts as, whether a filter reads the displayed
 * text or the underlying value, and what a third click on a column header
 * does.
 */

export type SortDirection = "asc" | "desc";

export interface SortState {
  key: string;
  direction: SortDirection;
}

/**
 * `multiselect` is `select` that accepts more than one choice at a time. It is
 * a separate kind rather than a flag on `select` because a caller has to opt
 * in: the stored value becomes an array, and a server-mode hook that does
 * `.eq()` on it would match nothing at all (see `toQueryFilters`).
 */
export type FilterKind = "text" | "select" | "multiselect" | "none";

/**
 * What one column's filter is set to. A string for text and single select; an
 * array for multiselect, where an empty array means "not filtering" exactly as
 * an empty string does.
 */
export type FilterValue = string | string[];

/** True when this filter would actually exclude something. */
export const isFilterSet = (v: FilterValue | undefined): boolean =>
  Array.isArray(v) ? v.length > 0 : !!v && v.trim() !== "";

export interface ColumnView<T> {
  key: string;
  header: string;
  sortable?: boolean;
  filter?: FilterKind;
  /** The comparable, filterable value. Falls back to the raw field. */
  value?: (row: T) => string | number | null | undefined;
}

const rawValue = <T,>(row: T, col: ColumnView<T>): string | number | null | undefined => {
  if (col.value) return col.value(row);
  const v: unknown = (row as Record<string, unknown>)[col.key];
  if (v === null || v === undefined) return v as null | undefined;
  return typeof v === "number" ? v : String(v);
};

export const asText = (v: string | number | null | undefined): string =>
  v === null || v === undefined ? "" : String(v);

/**
 * Click a header: unsorted becomes ascending, ascending becomes descending,
 * and a third click clears it rather than cycling back to ascending. Being
 * able to get back to the list's own order matters — for these registers that
 * order is "soonest coverage first", which no column reproduces.
 */
export function nextSort(current: SortState | null, key: string): SortState | null {
  if (!current || current.key !== key) return { key, direction: "asc" };
  if (current.direction === "asc") return { key, direction: "desc" };
  return null;
}

/**
 * Sort, with blanks always last.
 *
 * A missing value is not smaller than every other value, it is unknown, and
 * floating unknowns to the top of an ascending sort buries the rows somebody
 * asked to see.
 */
export function applySort<T>(rows: T[], sort: SortState | null, columns: ColumnView<T>[]): T[] {
  if (!sort) return rows;
  const col = columns.find((c) => c.key === sort.key);
  if (!col) return rows;

  const dir = sort.direction === "asc" ? 1 : -1;

  return [...rows].sort((a, b) => {
    const av = rawValue(a, col);
    const bv = rawValue(b, col);
    const aEmpty = av === null || av === undefined || av === "";
    const bEmpty = bv === null || bv === undefined || bv === "";
    if (aEmpty && bEmpty) return 0;
    if (aEmpty) return 1;
    if (bEmpty) return -1;

    if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
    // localeCompare so "Ålesund" files where a reader expects it, and
    // numeric so "Item 10" sorts after "Item 9".
    return String(av).localeCompare(String(bv), undefined, { numeric: true }) * dir;
  });
}

/** The choices a select filter offers, taken from the rows actually present. */
export function filterOptions<T>(rows: T[], col: ColumnView<T>): string[] {
  const seen = new Set<string>();
  for (const row of rows) {
    const v = asText(rawValue(row, col)).trim();
    if (v) seen.add(v);
  }
  return [...seen].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

/**
 * Apply the per-column filters.
 *
 * A select matches exactly; a text filter matches anywhere, case-insensitively.
 * An empty filter is not a filter — it must not exclude rows whose value is
 * blank, or clearing a box would quietly keep hiding things.
 */
export function applyFilters<T>(
  rows: T[],
  filters: Record<string, FilterValue>,
  columns: ColumnView<T>[],
): T[] {
  const active = Object.entries(filters).filter(([, v]) => isFilterSet(v));
  if (!active.length) return rows;

  return rows.filter((row) =>
    // AND across columns, OR within one. Picking two members of staff means
    // "either of these", not "both at once", which no row could satisfy.
    active.every(([key, needle]) => {
      const col = columns.find((c) => c.key === key);
      if (!col) return true;
      const hay = asText(rawValue(row, col));
      if (Array.isArray(needle)) return needle.includes(hay);
      return col.filter === "select" || col.filter === "multiselect"
        ? hay === needle
        : hay.toLowerCase().includes(needle.trim().toLowerCase());
    }),
  );
}

/** Free-text search across every column that has a value. */
export function applySearch<T>(rows: T[], term: string, columns: ColumnView<T>[]): T[] {
  const needle = term.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((row) =>
    columns.some((col) => asText(rawValue(row, col)).toLowerCase().includes(needle)),
  );
}

/** Search, then filter, then sort — the order a reader expects. */
export function applyView<T>(
  rows: T[],
  columns: ColumnView<T>[],
  opts: { search?: string; filters?: Record<string, FilterValue>; sort?: SortState | null },
): T[] {
  let out = rows;
  if (opts.search) out = applySearch(out, opts.search, columns);
  if (opts.filters) out = applyFilters(out, opts.filters, columns);
  return applySort(out, opts.sort ?? null, columns);
}

/**
 * How many columns are filtered — not how many values are selected. Three
 * members of staff picked in one column is one filter, because that is what the
 * reader has to clear to see everything again.
 */
export const activeFilterCount = (filters: Record<string, FilterValue>): number =>
  Object.values(filters).filter(isFilterSet).length;


/**
 * Everything a table's controls are currently set to.
 *
 * Lifted into its own shape so a table can either apply it here, over rows it
 * already holds, or hand it to a query. The controls in the header look and
 * behave the same either way — which is the point: a screen should not have
 * two different filter experiences depending on how many rows it happens to
 * hold.
 */
export interface ViewState {
  search: string;
  filters: Record<string, FilterValue>;
  sort: SortState | null;
  page: number;
}

export const emptyView = (): ViewState => ({ search: "", filters: {}, sort: null, page: 1 });

export const isViewClean = (v: ViewState): boolean =>
  !v.search.trim() && activeFilterCount(v.filters) === 0 && v.sort === null;

/**
 * The view as query parameters, in the shape the intranet list hooks take.
 *
 * A cleared filter becomes "all" rather than being dropped: these hooks read
 * a missing key as "no opinion" and default it, so omitting it would leave the
 * previous value in force.
 */
export function toQueryFilters(
  view: ViewState,
  opts: { pageSize?: number } = {},
): Record<string, string | number | undefined> {
  const out: Record<string, string | number | undefined> = {
    search: view.search.trim() || undefined,
    page: view.page,
    pageSize: opts.pageSize,
    sortCol: view.sort?.key,
    sortDir: view.sort?.direction,
  };
  for (const [key, value] of Object.entries(view.filters)) {
    if (!isFilterSet(value)) {
      out[key] = "all";
    } else if (Array.isArray(value)) {
      // ⚠️ Comma-joined, and no server-mode hook splits it yet. The two tables
      // in server mode — Maintenance and IT Ticket — filter with `.eq()`, so a
      // joined value would match nothing and read as "no results" rather than
      // as a bug. No server-mode column declares `multiselect` for that reason;
      // wiring one up means teaching its hook to `.in()` on the split value.
      out[key] = value.join(",");
    } else {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Changing what is shown must return to page one.
 *
 * Filtering while on page 7 of 9 otherwise lands on a page that no longer
 * exists, and an empty table is read as "no matches" rather than "wrong page".
 */
export function updateView(view: ViewState, patch: Partial<ViewState>): ViewState {
  const changesResults =
    patch.search !== undefined || patch.filters !== undefined || patch.sort !== undefined;
  return { ...view, ...patch, page: patch.page ?? (changesResults ? 1 : view.page) };
}

/* ------------------------------------------------------------------------- *
 * Grouping
 *
 * Added 2026-09-21. Filtering answers "show me only these"; grouping answers
 * "show me all of it, arranged" — and for a list that rolls several clients up
 * into one view they are not the same question. Picking one client hides the
 * other eleven; grouping by client keeps every count on screen and lets you
 * open the one you care about.
 *
 * Kept here rather than in the table component for the same reason the sort is
 * here: what an ungrouped row is called, and where that bucket sorts, are
 * decisions rather than rendering.
 * ------------------------------------------------------------------------- */

/**
 * One way of arranging a list.
 *
 * `of` returns the bucket a row belongs in. Returning `null` means the row has
 * no value for this grouping — it lands in a single trailing bucket rather
 * than being dropped, because a task with no client is still a task somebody
 * has to do, and a grouping that quietly loses rows is worse than no grouping.
 *
 * `rank` orders the buckets when their labels do not. Due-date buckets are the
 * case that needs it: "Past due" before "Today" before "Later" is the whole
 * point, and alphabetically it is Later, Past due, Today.
 */
export interface GroupDef<T> {
  key: string;
  /** What the group-by control calls this arrangement: "Client", "Category". */
  label: string;
  of: (row: T) => { id: string; label: string } | null;
  rank?: (id: string) => number;
  /** What the trailing bucket is called. Defaults to "Ungrouped". */
  emptyLabel?: string;
}

export interface RowGroup<T> {
  id: string;
  label: string;
  rows: T[];
}

/** The id of the bucket that holds rows with no value for this grouping. */
export const UNGROUPED = "__ungrouped__";

/**
 * Split rows into buckets, in the order they should be shown.
 *
 * A row may only be in one bucket. Multi-valued fields — a task's categories
 * are a jsonb array — pick their first value in `of`; showing one task under
 * three headings makes the counts lie, and the counts are what a grouped list
 * is for.
 */
export function groupRows<T>(rows: T[], group: GroupDef<T> | null): RowGroup<T>[] | null {
  if (!group) return null;

  const buckets = new Map<string, RowGroup<T>>();
  for (const row of rows) {
    const g = group.of(row);
    const id = g?.id ?? UNGROUPED;
    const label = g?.label ?? group.emptyLabel ?? "Ungrouped";
    const bucket = buckets.get(id);
    if (bucket) bucket.rows.push(row);
    else buckets.set(id, { id, label, rows: [row] });
  }

  const ordered = [...buckets.values()].sort((a, b) => {
    // The unvalued bucket is always last, whatever it is called and whatever
    // the ranker says — it is the leftovers, not a peer of the real groups.
    if (a.id === UNGROUPED) return 1;
    if (b.id === UNGROUPED) return -1;
    if (group.rank) return group.rank(a.id) - group.rank(b.id);
    return a.label.localeCompare(b.label, undefined, { numeric: true });
  });

  return ordered;
}
