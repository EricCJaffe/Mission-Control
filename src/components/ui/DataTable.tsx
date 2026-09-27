'use client';

/**
 * One table for every list of records in the app.
 *
 * PORTED BY HAND from honeylakeos `src/components/ui/DataTable.tsx` on
 * 2026-09-26 (the fleet's most advanced copy: it has `pinRight` and page
 * counts). Mission Control is in the bibleos.app family, not a BusinessOS
 * descendant, and takes no template merges — so this file does NOT update
 * itself. When the fleet copy changes, port the change here by hand.
 *
 * The one real difference from the original: honeylakeos builds on shadcn
 * (Radix popover, select, checkbox), and this app has none of it, so those are
 * plain elements here. The behavior and the three rules are the same:
 *
 *   · **One line per row.** A card per row means four rows fill the screen;
 *     the point of a list is to see its shape. Detail goes behind a click.
 *   · **The filter lives in the column header**, under its name — not in a bar
 *     above the table where you have to work out which control is which.
 *   · **Sort clears on a third click.** These lists have a meaningful default
 *     order that no column reproduces, so there has to be a way back to it.
 *
 * And the fleet standard (~/dev/brain/docs/STANDARD-table-views.md): on a
 * phone the table scrolls sideways inside its own box — it never becomes
 * cards — with the action column pinned so the button stays under the thumb.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, ChevronDown, ChevronRight, ArrowUp, ArrowDown, ArrowUpDown, X, Filter, Layers } from 'lucide-react';
import {
  applyView,
  filterOptions,
  nextSort,
  activeFilterCount,
  emptyView,
  updateView,
  isFilterSet,
  groupRows,
  type ColumnView,
  type FilterValue,
  type GroupDef,
  type ViewState,
} from '@/lib/table/tableView';

export type { GroupDef } from '@/lib/table/tableView';

/**
 * A choice in a select filter. A bare string is both value and label; a pair
 * is for a stored value that is not the word to show.
 */
export type FilterOption = string | { value: string; label: string };

const optionValue = (o: FilterOption): string => (typeof o === 'string' ? o : o.value);
const optionLabel = (o: FilterOption): string => (typeof o === 'string' ? o : o.label);

export interface DataColumn<T> extends ColumnView<T> {
  /** What the cell shows. Defaults to the sortable value. */
  render?: (row: T) => React.ReactNode;
  className?: string;
  width?: string;
  /**
   * Keep this column on screen while the table scrolls sideways — the action
   * column. A single-line table cannot fit a phone; it scrolls, and the button
   * a person came to press must not sit off the right-hand edge. Both the <th>
   * and every <td> are sticky: a header pinned without its cells detaches.
   */
  pinRight?: boolean;
  /**
   * Keep this column on screen at the left — the identifier — so a sideways
   * scroll never leaves a row of values with no name.
   */
  pinLeft?: boolean;
}

/* Sticky cell classes. Opaque, so the scrolled cells do not show through. */
const PIN_RIGHT = 'sticky right-0 z-10 bg-white shadow-[-6px_0_6px_-6px_rgba(0,0,0,0.12)]';
const PIN_LEFT = 'sticky left-0 z-10 bg-white shadow-[6px_0_6px_-6px_rgba(0,0,0,0.10)]';
/* The LAYOUT is Trellis's mother list, which Eric sent as the reference on
   2026-09-26: a band behind small tracked capitals, hairline rules, compact
   single-line rows, outlined pills. The COLORS are this app's own slate and
   blue, not Trellis's: Eric, same day, "it should have kept the color scheme
   of the site and template". */
const HEAD_BG = 'bg-slate-50';
const RULE = 'border-slate-100';

interface DataTableProps<T extends { id: string }> {
  rows: T[];
  columns: DataColumn<T>[];
  isLoading?: boolean;
  /** Shown when a row is opened. Without it, rows do not expand. */
  renderExpanded?: (row: T) => React.ReactNode;
  searchPlaceholder?: string;
  emptyState?: React.ReactNode;
  /** Rendered to the right of the search box. */
  actions?: React.ReactNode;
  /** Open the row somewhere else instead of expanding it. Ignored with renderExpanded. */
  onRowClick?: (row: T) => void;
  /** Names the thing being counted: "12 tasks". */
  noun?: [singular: string, plural: string];
  pageSize?: number;
  /** Arrangements the group-by control offers. Omitted: a flat list. */
  groups?: GroupDef<T>[];
  /** Which arrangement to open on. `null` — the default — means flat. */
  defaultGroup?: string | null;
  /** Whether groups start shut. */
  groupsCollapsed?: boolean;
  /** A count shown in red beside a group's heading — past due, usually. */
  groupAlert?: (rows: T[]) => { count: number; label: string } | null;
  /** Hide the search box, for a short list where it is noise. */
  hideSearch?: boolean;
  /** Extra classes per row: a done row greyed, an overdue one tinted. */
  rowClassName?: (row: T) => string;
  /**
   * Extra text the search box matches, beyond the visible columns — a task's
   * description, say. Without it, search only sees what the columns show.
   */
  searchText?: (row: T) => string;
}

const NO_GROUP = '__flat__';

/**
 * One column's filter, behind a funnel. The funnel is filled when its column
 * is filtered, so a filter somebody left on is still discoverable: a list
 * quietly showing a subset reads as a list that is empty.
 */
function ColumnFilter<T>({
  column,
  value,
  options,
  onSet,
  onToggle,
}: {
  column: DataColumn<T>;
  value: FilterValue | undefined;
  options: FilterOption[];
  onSet: (value: FilterValue) => void;
  onToggle: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [needle, setNeedle] = useState('');
  const box = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  // Fixed to the window, not absolute to the cell: the table scrolls inside an
  // overflow box, and an absolute popover would be clipped by it.
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);
  const place = () => {
    const r = button.current?.getBoundingClientRect();
    if (r) setAt({ top: r.bottom + 4, left: Math.max(8, Math.min(r.left, window.innerWidth - 232)) });
  };
  const set = isFilterSet(value);
  const selected = Array.isArray(value) ? value : value ? [value] : [];
  const multi = column.filter === 'multiselect';
  const searchable = options.length > 8;
  const shown = needle.trim()
    ? options.filter((o) => optionLabel(o).toLowerCase().includes(needle.trim().toLowerCase()))
    : options;

  // Close on a tap anywhere else, and on Escape.
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent | TouchEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) {
        setOpen(false);
        setNeedle('');
      }
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    // The anchor moves when anything scrolls; closing is simpler than chasing it.
    const moved = (e: Event) => {
      if (box.current && e.target instanceof Node && box.current.contains(e.target)) return;
      setOpen(false);
    };
    window.addEventListener('scroll', moved, true);
    window.addEventListener('resize', moved);
    document.addEventListener('mousedown', away);
    document.addEventListener('touchstart', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('touchstart', away);
      document.removeEventListener('keydown', esc);
      window.removeEventListener('scroll', moved, true);
      window.removeEventListener('resize', moved);
    };
  }, [open]);

  return (
    <span ref={box} className="relative inline-flex">
      <button
        ref={button}
        type="button"
        onClick={() => {
          place();
          setOpen((o) => !o);
        }}
        className={`ml-0.5 rounded p-1.5 hover:bg-slate-200 ${set ? 'text-blue-700' : 'text-slate-300 hover:text-slate-600'}`}
        aria-label={set ? `Filter on ${column.header} (active)` : `Filter by ${column.header}`}
        aria-expanded={open}
      >
        <Filter className={`h-3.5 w-3.5 ${set ? 'fill-current' : ''}`} aria-hidden="true" />
      </button>
      {open && at && (
        <div
          style={{ position: 'fixed', top: at.top, left: at.left }}
          className="z-50 w-56 rounded-xl border border-slate-200 bg-white p-2 text-left normal-case tracking-normal shadow-lg"
        >
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-700">{column.header}</span>
            {set && (
              <button
                type="button"
                className="text-xs text-slate-500 underline hover:text-slate-800"
                onClick={() => {
                  onSet(multi ? [] : '');
                  setOpen(false);
                }}
              >
                Clear
              </button>
            )}
          </div>
          {column.filter === 'text' ? (
            <input
              autoFocus
              className="h-9 w-full rounded-lg border border-slate-300 px-2 text-sm font-normal"
              placeholder={`Filter ${column.header.toLowerCase()}…`}
              value={typeof value === 'string' ? value : ''}
              onChange={(e) => onSet(e.target.value)}
            />
          ) : (
            <>
              {searchable && (
                <input
                  autoFocus
                  className="mb-1.5 h-9 w-full rounded-lg border border-slate-300 px-2 text-sm font-normal"
                  placeholder="Search…"
                  value={needle}
                  onChange={(e) => setNeedle(e.target.value)}
                />
              )}
              <div className="max-h-64 space-y-0.5 overflow-y-auto">
                {!multi && (
                  <button
                    type="button"
                    className={`w-full rounded-lg px-2 py-1.5 text-left text-sm font-normal hover:bg-slate-100 ${!set ? 'font-semibold' : ''}`}
                    onClick={() => {
                      onSet('');
                      setOpen(false);
                    }}
                  >
                    All
                  </button>
                )}
                {shown.map((o) => {
                  const v = optionValue(o);
                  const on = selected.includes(v);
                  return multi ? (
                    <label key={v} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-normal hover:bg-slate-100">
                      <input type="checkbox" checked={on} onChange={() => onToggle(v)} />
                      <span className="truncate">{optionLabel(o)}</span>
                    </label>
                  ) : (
                    <button
                      key={v}
                      type="button"
                      className={`w-full truncate rounded-lg px-2 py-1.5 text-left text-sm font-normal hover:bg-slate-100 ${on ? 'bg-slate-100 font-semibold' : ''}`}
                      onClick={() => {
                        onSet(v);
                        setOpen(false);
                      }}
                    >
                      {optionLabel(o)}
                    </button>
                  );
                })}
                {shown.length === 0 && <p className="px-2 py-1 text-sm font-normal text-slate-500">Nothing matches.</p>}
              </div>
              {multi && selected.length > 0 && (
                <p className="mt-1.5 border-t pt-1.5 text-xs font-normal text-slate-500">{selected.length} selected — any of them matches</p>
              )}
            </>
          )}
        </div>
      )}
    </span>
  );
}

/**
 * A row's details, opened by clicking the row. A box over the page rather than
 * a row that grows inside the table: the list stays one line per row, and the
 * details get the room to wrap. Closes on Escape, the X, or a click outside.
 */
function RowDetails({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[90vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:max-w-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="text-sm text-slate-700">{children}</div>
      </div>
    </div>
  );
}

export function DataTable<T extends { id: string }>({
  rows,
  columns,
  isLoading = false,
  renderExpanded,
  searchPlaceholder = 'Search…',
  emptyState,
  actions,
  noun = ['record', 'records'],
  pageSize = 50,
  onRowClick,
  groups,
  defaultGroup = null,
  groupsCollapsed = false,
  groupAlert,
  hideSearch = false,
  rowClassName,
  searchText,
}: DataTableProps<T>) {
  const [state, setLocal] = useState<ViewState>(emptyView);
  const [openId, setOpenId] = useState<string | null>(null);
  // `undefined` until the reader picks an arrangement; until then the default
  // applies, including a default that resolves after the first render.
  const [chosenGroup, setChosenGroup] = useState<string | null | undefined>(undefined);
  const groupKey = chosenGroup === undefined ? defaultGroup : chosenGroup;
  const [groupToggles, setGroupToggles] = useState<Record<string, boolean>>({});
  const [groupsShowingAll, setGroupsShowingAll] = useState<Record<string, boolean>>({});

  const setState = (patch: Partial<ViewState>) => setLocal((s) => updateView(s, patch));
  const { search, filters, sort, page } = state;

  const view = useMemo(() => {
    if (!searchText || !search.trim()) return applyView(rows, columns, { search, filters, sort });
    // A row matches when its columns do OR its extra text does.
    const needle = search.trim().toLowerCase();
    const byColumns = new Set(applyView(rows, columns, { search }).map((r) => r.id));
    const matched = rows.filter((r) => byColumns.has(r.id) || searchText(r).toLowerCase().includes(needle));
    return applyView(matched, columns, { filters, sort });
  }, [rows, columns, search, filters, sort, searchText]);

  // Options come from everything loaded, not what is shown, or narrowing one
  // filter would empty the choices in the next.
  const optionsFor = useMemo(() => {
    const map = new Map<string, FilterOption[]>();
    for (const col of columns) {
      if (col.filter === 'select' || col.filter === 'multiselect') map.set(col.key, filterOptions(rows, col));
    }
    return map;
  }, [rows, columns]);

  const activeGroup = useMemo(() => groups?.find((g) => g.key === groupKey) ?? null, [groups, groupKey]);

  const filterCount = activeFilterCount(filters);
  const total = view.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  // Grouped lists are not paginated: the groups are the navigation.
  const shown = activeGroup ? view : view.slice((page - 1) * pageSize, page * pageSize);
  const grouped = useMemo(() => groupRows(shown, activeGroup), [shown, activeGroup]);

  const isGroupOpen = (id: string) => groupToggles[id] ?? !groupsCollapsed;
  const toggleGroup = (id: string) => setGroupToggles((t) => ({ ...t, [id]: !(t[id] ?? !groupsCollapsed) }));

  const setFilter = (key: string, value: FilterValue) => setState({ filters: { ...filters, [key]: value } });
  const toggleFilterValue = (key: string, value: string) => {
    const current = filters[key];
    const list = Array.isArray(current) ? current : current ? [current] : [];
    setFilter(key, list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  };
  const clearAll = () => setState({ filters: {}, search: '', sort: null });

  const colCount = columns.length;
  const pinClass = (col: DataColumn<T>) => (col.pinRight ? PIN_RIGHT : col.pinLeft ? PIN_LEFT : '');
  // Header cells pin the same way but keep the band's color, not the body's white.
  const headPinClass = (col: DataColumn<T>) =>
    col.pinRight
      ? `sticky right-0 z-10 ${HEAD_BG} shadow-[-6px_0_6px_-6px_rgba(0,0,0,0.12)]`
      : col.pinLeft
        ? `sticky left-0 z-10 ${HEAD_BG} shadow-[6px_0_6px_-6px_rgba(0,0,0,0.10)]`
        : '';

  const renderRow = (row: T) => {
    const open = openId === row.id;
    const clickable = Boolean(renderExpanded || onRowClick);
    return [
      <tr
        key={row.id}
        className={`group border-b ${RULE} last:border-0 ${clickable ? 'cursor-pointer hover:bg-slate-50' : ''} ${open ? 'bg-slate-50' : ''} ${rowClassName?.(row) ?? ''}`}
        onClick={() => (renderExpanded ? setOpenId(row.id) : onRowClick?.(row))}
      >
        {columns.map((col, i) => (
          <td
            key={col.key}
            className={`max-w-[22rem] truncate whitespace-nowrap px-4 py-2 align-middle text-sm ${i === 0 ? 'font-medium text-slate-900' : 'text-slate-700'} ${pinClass(col)} ${col.pinRight || col.pinLeft ? 'group-hover:bg-slate-50' : ''} ${col.className ?? ''}`}
          >
            {col.render ? col.render(row) : ((col.value ? col.value(row) : ((row as Record<string, unknown>)[col.key] as React.ReactNode)) ?? '—')}
          </td>
        ))}
      </tr>,
    ];
  };

  const openRow = renderExpanded && openId ? rows.find((r) => r.id === openId) ?? null : null;
  const firstCol = columns[0];

  return (
    /* A one-column grid of minmax(0, 1fr): the table's natural width then
       counts as zero toward whatever contains it, so a card or grid cell stays
       the width of the screen and the table scrolls inside it. Without this,
       a wide table stretched its card past the right edge (/helpers, 9/26). */
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
      {openRow && renderExpanded && (
        <RowDetails
          title={firstCol ? String((firstCol.value ? firstCol.value(openRow) : (openRow as Record<string, unknown>)[firstCol.key]) ?? '') : ''}
          onClose={() => setOpenId(null)}
        >
          {renderExpanded(openRow)}
        </RowDetails>
      )}
      {(!hideSearch || groups?.length || actions) && (
        <div className="flex flex-wrap items-center gap-2">
          {!hideSearch && (
            <div className="relative min-w-48 flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <input
                className="h-9 w-full rounded-lg border border-slate-300 bg-white pl-8 pr-3 text-sm"
                placeholder={searchPlaceholder}
                value={search}
                onChange={(e) => setState({ search: e.target.value })}
              />
            </div>
          )}
          {(filterCount > 0 || search || sort) && (
            <button type="button" onClick={clearAll} className="flex h-9 shrink-0 items-center rounded-lg px-2 text-sm text-slate-600 hover:bg-slate-100">
              <X className="mr-1 h-3.5 w-3.5" />
              Clear
              {filterCount > 0 && <span className="ml-1.5 rounded-full bg-slate-200 px-1.5 text-xs">{filterCount}</span>}
            </button>
          )}
          {groups && groups.length > 0 && (
            <label className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2 text-sm">
              <Layers className="h-4 w-4 text-slate-400" aria-hidden="true" />
              <span className="sr-only">Group by</span>
              <select
                className="bg-transparent text-sm outline-none"
                value={groupKey ?? NO_GROUP}
                onChange={(e) => {
                  setChosenGroup(e.target.value === NO_GROUP ? null : e.target.value);
                  setGroupToggles({});
                  setGroupsShowingAll({});
                }}
              >
                <option value={NO_GROUP}>No grouping</option>
                {groups.map((g) => (
                  <option key={g.key} value={g.key}>
                    {g.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {actions}
        </div>
      )}

      {/* The table scrolls inside this box; the page never scrolls sideways. */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className={`border-b border-slate-200 ${HEAD_BG}`}>
              {columns.map((col) => {
                const sorted = sort?.key === col.key ? sort.direction : null;
                return (
                  <th
                    key={col.key}
                    className={`whitespace-nowrap px-4 py-2 text-left align-middle text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500 ${headPinClass(col)}`}
                    style={col.width ? { width: col.width } : undefined}
                    aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined}
                  >
                    {/* Name and its filter on the left, the sort control at the
                        right edge of the cell: the reference's layout. */}
                    <span className="flex items-center justify-between gap-3">
                      <span className="inline-flex items-center gap-0.5">
                        {col.sortable ? (
                          <button
                            type="button"
                            className={`py-1 uppercase tracking-[0.1em] hover:text-slate-800 ${sorted ? 'text-slate-800' : ''}`}
                            onClick={() => setState({ sort: nextSort(sort, col.key) })}
                          >
                            {col.header}
                          </button>
                        ) : (
                          <span>{col.header}</span>
                        )}
                        {col.filter && col.filter !== 'none' && (
                          <ColumnFilter
                            column={col}
                            value={filters[col.key]}
                            options={optionsFor.get(col.key) ?? []}
                            onSet={(v) => setFilter(col.key, v)}
                            onToggle={(v) => toggleFilterValue(col.key, v)}
                          />
                        )}
                      </span>
                      {col.sortable && (
                        <button
                          type="button"
                          className={`rounded p-1 ${sorted ? 'text-slate-800' : 'text-slate-300 hover:text-slate-600'}`}
                          onClick={() => setState({ sort: nextSort(sort, col.key) })}
                          aria-label={`Sort by ${col.header}`}
                        >
                          {sorted === 'asc' ? (
                            <ArrowUp className="h-4 w-4" />
                          ) : sorted === 'desc' ? (
                            <ArrowDown className="h-4 w-4" />
                          ) : (
                            <ArrowUpDown className="h-3.5 w-3.5" />
                          )}
                        </button>
                      )}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className={`border-b ${RULE}`}>
                  <td colSpan={colCount} className="px-3 py-2.5">
                    <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
                  </td>
                </tr>
              ))
            ) : shown.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="px-3 py-10 text-center">
                  {rows.length > 0 ? (
                    <p className="text-sm text-slate-500">
                      Nothing matches.{' '}
                      <button type="button" className="underline" onClick={clearAll}>
                        Clear the filters
                      </button>
                      .
                    </p>
                  ) : (
                    (emptyState ?? <p className="text-sm text-slate-500">Nothing yet.</p>)
                  )}
                </td>
              </tr>
            ) : grouped ? (
              grouped.map((group) => {
                const open = isGroupOpen(group.id);
                const all = groupsShowingAll[group.id];
                const groupRowsShown = all ? group.rows : group.rows.slice(0, pageSize);
                const hidden = group.rows.length - groupRowsShown.length;
                const alert = groupAlert?.(group.rows) ?? null;
                return [
                  <tr key={`g-${group.id}`} className="cursor-pointer border-b border-slate-200 bg-slate-100/70 hover:bg-slate-100" onClick={() => toggleGroup(group.id)}>
                    <td colSpan={colCount} className="px-3 py-1.5">
                      <span className="sticky left-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
                        {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                        <span className="truncate">{group.label}</span>
                        <span className="rounded-full bg-white px-1.5 text-xs font-normal text-slate-600">{group.rows.length}</span>
                        {alert && alert.count > 0 && (
                          <span className="rounded-full bg-red-100 px-1.5 text-xs font-normal text-red-800">
                            {alert.count} {alert.label}
                          </span>
                        )}
                      </span>
                    </td>
                  </tr>,
                  ...(open ? groupRowsShown.flatMap(renderRow) : []),
                  open && hidden > 0 ? (
                    <tr key={`g-${group.id}-more`} className={`border-b ${RULE}`}>
                      <td colSpan={colCount} className="px-3 py-2">
                        <button
                          type="button"
                          className="text-xs text-slate-500 underline hover:text-slate-800"
                          onClick={() => setGroupsShowingAll((m) => ({ ...m, [group.id]: true }))}
                        >
                          Show the other {hidden}
                        </button>
                      </td>
                    </tr>
                  ) : null,
                ];
              })
            ) : (
              shown.flatMap(renderRow)
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>
          {total} {total === 1 ? noun[0] : noun[1]}
          {view.length !== rows.length && ` of ${rows.length}`}
          {grouped && ` in ${grouped.length} ${grouped.length === 1 ? 'group' : 'groups'}`}
        </span>
        {totalPages > 1 && !grouped && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="rounded p-1.5 hover:bg-slate-100 disabled:opacity-30"
              disabled={page <= 1}
              onClick={() => setState({ page: page - 1 })}
              aria-label="Previous page"
            >
              <ChevronRight className="h-4 w-4 rotate-180" />
            </button>
            <span>
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              className="rounded p-1.5 hover:bg-slate-100 disabled:opacity-30"
              disabled={page >= totalPages}
              onClick={() => setState({ page: page + 1 })}
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Status as a pill, never a bare word. Red / yellow / green by meaning —
 * never "amber" — plus blue for "in hand" and slate for neutral.
 */
export type PillTone = 'red' | 'yellow' | 'green' | 'blue' | 'slate';

const PILL: Record<PillTone, string> = {
  red: 'bg-red-50 text-red-700 border-red-200',
  yellow: 'bg-yellow-50 text-yellow-800 border-yellow-300',
  green: 'bg-green-50 text-green-700 border-green-200',
  blue: 'bg-blue-50 text-blue-700 border-blue-200',
  slate: 'bg-slate-50 text-slate-600 border-slate-200',
};

export function StatusPill({ tone, children, title }: { tone: PillTone; children: React.ReactNode; title?: string }) {
  return <span title={title} className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-px text-xs font-semibold ${PILL[tone]}`}>{children}</span>;
}
