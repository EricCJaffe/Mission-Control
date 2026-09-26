import { describe, it } from "node:test";
import { expect } from "./expect.ts";
import {
  nextSort, applySort, applyFilters, applySearch, applyView, filterOptions,
  activeFilterCount, emptyView, isFilterSet, isViewClean, toQueryFilters, updateView,
  type ColumnView,
} from "./tableView.ts";

interface Row { id: string; name: string; dept: string | null; amount: number | null }

const rows: Row[] = [
  { id: "1", name: "Item 9",  dept: "Clinical", amount: 100 },
  { id: "2", name: "Item 10", dept: "Medical",  amount: 20 },
  { id: "3", name: "Ackroyd", dept: null,       amount: null },
];

const columns: ColumnView<Row>[] = [
  { key: "name", header: "Name", sortable: true, filter: "text" },
  { key: "dept", header: "Department", sortable: true, filter: "select" },
  { key: "amount", header: "Amount", sortable: true, filter: "none" },
];

describe("nextSort", () => {
  it("starts ascending", () => {
    expect(nextSort(null, "name")).toEqual({ key: "name", direction: "asc" });
  });
  it("goes ascending then descending", () => {
    expect(nextSort({ key: "name", direction: "asc" }, "name"))
      .toEqual({ key: "name", direction: "desc" });
  });
  it("clears on the third click rather than cycling", () => {
    // The list's own order carries meaning the columns cannot reproduce —
    // "soonest coverage first" is not any single column.
    expect(nextSort({ key: "name", direction: "desc" }, "name")).toBeNull();
  });
  it("switching column starts that one ascending", () => {
    expect(nextSort({ key: "name", direction: "desc" }, "dept"))
      .toEqual({ key: "dept", direction: "asc" });
  });
});

describe("applySort", () => {
  it("sorts numbers as numbers", () => {
    const out = applySort(rows, { key: "amount", direction: "asc" }, columns);
    expect(out.map((r) => r.amount)).toEqual([20, 100, null]);
  });

  it("sorts names naturally, so Item 9 comes before Item 10", () => {
    const out = applySort(rows, { key: "name", direction: "asc" }, columns);
    expect(out.map((r) => r.name)).toEqual(["Ackroyd", "Item 9", "Item 10"]);
  });

  it("keeps blanks last when ascending", () => {
    const out = applySort(rows, { key: "dept", direction: "asc" }, columns);
    expect(out[out.length - 1].dept).toBeNull();
  });

  it("keeps blanks last when descending too — unknown is not a value", () => {
    const out = applySort(rows, { key: "dept", direction: "desc" }, columns);
    expect(out[out.length - 1].dept).toBeNull();
  });

  it("returns the original order when nothing is sorted", () => {
    expect(applySort(rows, null, columns).map((r) => r.id)).toEqual(["1", "2", "3"]);
  });

  it("does not mutate the input", () => {
    const before = rows.map((r) => r.id);
    applySort(rows, { key: "name", direction: "desc" }, columns);
    expect(rows.map((r) => r.id)).toEqual(before);
  });

  it("ignores a sort on a column that is not there", () => {
    expect(applySort(rows, { key: "nope", direction: "asc" }, columns)).toEqual(rows);
  });
});

describe("applyFilters", () => {
  it("matches a select exactly", () => {
    expect(applyFilters(rows, { dept: "Clinical" }, columns).map((r) => r.id)).toEqual(["1"]);
  });

  it("matches text anywhere, case-insensitively", () => {
    expect(applyFilters(rows, { name: "item" }, columns)).toHaveLength(2);
  });

  it("an empty filter is not a filter", () => {
    // Clearing the box must bring the blank-valued rows back, not keep
    // filtering on "".
    expect(applyFilters(rows, { dept: "" }, columns)).toHaveLength(3);
    expect(applyFilters(rows, { dept: "   " }, columns)).toHaveLength(3);
  });

  it("combines filters with and", () => {
    expect(applyFilters(rows, { name: "item", dept: "Medical" }, columns).map((r) => r.id))
      .toEqual(["2"]);
  });

  it("a select never matches a blank value", () => {
    expect(applyFilters(rows, { dept: "Clinical" }, columns).some((r) => r.dept === null)).toBe(false);
  });
});

describe("applySearch", () => {
  it("looks across every column", () => {
    expect(applySearch(rows, "medical", columns).map((r) => r.id)).toEqual(["2"]);
  });
  it("finds a number by its text", () => {
    expect(applySearch(rows, "100", columns).map((r) => r.id)).toEqual(["1"]);
  });
  it("an empty search returns everything", () => {
    expect(applySearch(rows, "  ", columns)).toHaveLength(3);
  });
});

describe("filterOptions", () => {
  it("offers only the values actually present", () => {
    expect(filterOptions(rows, columns[1])).toEqual(["Clinical", "Medical"]);
  });
  it("leaves blanks out of the list", () => {
    expect(filterOptions(rows, columns[1])).not.toContain("");
  });
});

describe("applyView", () => {
  it("searches, then filters, then sorts", () => {
    const out = applyView(rows, columns, {
      search: "item",
      filters: { dept: "" },
      sort: { key: "amount", direction: "desc" },
    });
    expect(out.map((r) => r.id)).toEqual(["1", "2"]);
  });
  it("does nothing at all when nothing is asked for", () => {
    expect(applyView(rows, columns, {}).map((r) => r.id)).toEqual(["1", "2", "3"]);
  });
});

describe("activeFilterCount", () => {
  it("counts only the filters that are set", () => {
    expect(activeFilterCount({ a: "x", b: "", c: "  ", d: "y" })).toBe(2);
  });
});

describe("ViewState helpers", () => {
  it("starts clean", () => {
    expect(isViewClean(emptyView())).toBe(true);
  });

  it("is not clean once anything is set", () => {
    expect(isViewClean({ ...emptyView(), search: "x" })).toBe(false);
    expect(isViewClean({ ...emptyView(), filters: { a: "x" } })).toBe(false);
    expect(isViewClean({ ...emptyView(), sort: { key: "a", direction: "asc" } })).toBe(false);
  });

  it("does not count a blank filter as set", () => {
    expect(isViewClean({ ...emptyView(), filters: { a: "  " } })).toBe(true);
  });

  it("counts paging alone as still clean — page is not a filter", () => {
    expect(isViewClean({ ...emptyView(), page: 4 })).toBe(true);
  });
});

describe("toQueryFilters", () => {
  it("sends the sort as the column and direction the hooks expect", () => {
    const q = toQueryFilters({ ...emptyView(), sort: { key: "created_at", direction: "desc" } });
    expect(q.sortCol).toBe("created_at");
    expect(q.sortDir).toBe("desc");
  });

  it("omits an empty search rather than sending an empty string", () => {
    expect(toQueryFilters(emptyView()).search).toBeUndefined();
  });

  it('sends a cleared filter as "all", not as missing', () => {
    // These hooks read a missing key as "no opinion" and default it, so
    // dropping the key would leave the previous value in force.
    const q = toQueryFilters({ ...emptyView(), filters: { status: "" } });
    expect(q.status).toBe("all");
  });

  it("passes a set filter through", () => {
    expect(toQueryFilters({ ...emptyView(), filters: { status: "new" } }).status).toBe("new");
  });

  it("carries the page size when given one", () => {
    expect(toQueryFilters(emptyView(), { pageSize: 25 }).pageSize).toBe(25);
  });
});

describe("updateView", () => {
  it("returns to page one when the results change", () => {
    // Filtering on page 7 of 9 otherwise lands on a page that no longer
    // exists, and an empty table reads as "no matches".
    const v = { ...emptyView(), page: 7 };
    expect(updateView(v, { search: "abc" }).page).toBe(1);
    expect(updateView(v, { filters: { a: "b" } }).page).toBe(1);
    expect(updateView(v, { sort: { key: "a", direction: "asc" } }).page).toBe(1);
  });

  it("keeps the page when only paging", () => {
    expect(updateView({ ...emptyView(), page: 2 }, { page: 3 }).page).toBe(3);
  });

  it("does not reset the page for an unrelated change", () => {
    const v = { ...emptyView(), page: 5 };
    expect(updateView(v, {}).page).toBe(5);
  });
});

describe("multiselect filters", () => {
  const cols = [
    { key: "staff", header: "Staff", filter: "multiselect" as const },
    { key: "type", header: "Type", filter: "select" as const },
    { key: "notes", header: "Notes", filter: "text" as const },
  ];
  const rows = [
    { id: "1", staff: "Caitlyn Morgan", type: "Major", notes: "left campus" },
    { id: "2", staff: "Heather Plain", type: "Small", notes: "late to group" },
    { id: "3", staff: "Katie Mays", type: "Small", notes: "left campus" },
    { id: "4", staff: "", type: "Major", notes: "" },
  ];

  it("matches any of the selected values, not all of them", () => {
    const out = applyFilters(rows, { staff: ["Caitlyn Morgan", "Katie Mays"] }, cols);
    expect(out.map((r) => r.id)).toEqual(["1", "3"]);
  });

  it("an empty array is not a filter — it must not hide the blank row", () => {
    expect(applyFilters(rows, { staff: [] }, cols)).toHaveLength(4);
  });

  /**
   * The trap the single-value version had: a blank value has to survive an
   * inactive filter, or clearing a box quietly keeps hiding rows.
   */
  it("selecting the empty value matches only the blank row", () => {
    const out = applyFilters(rows, { staff: [""] }, cols);
    expect(out.map((r) => r.id)).toEqual(["4"]);
  });

  it("ANDs across columns while ORing within one", () => {
    const out = applyFilters(
      rows,
      { staff: ["Caitlyn Morgan", "Katie Mays"], type: "Small" },
      cols,
    );
    expect(out.map((r) => r.id)).toEqual(["3"]);
  });

  it("still accepts a plain string on a multiselect column", () => {
    const out = applyFilters(rows, { staff: "Heather Plain" }, cols);
    expect(out.map((r) => r.id)).toEqual(["2"]);
  });

  it("matches exactly, not as a substring", () => {
    expect(applyFilters(rows, { staff: ["Morgan"] }, cols)).toHaveLength(0);
  });

  it("counts a column once however many values it holds", () => {
    expect(activeFilterCount({ staff: ["a", "b", "c"] })).toBe(1);
    expect(activeFilterCount({ staff: [], type: "" })).toBe(0);
    expect(activeFilterCount({ staff: ["a"], type: "Small" })).toBe(2);
  });

  it("isFilterSet distinguishes empty from set for both shapes", () => {
    expect(isFilterSet(undefined)).toBe(false);
    expect(isFilterSet("")).toBe(false);
    expect(isFilterSet("  ")).toBe(false);
    expect(isFilterSet([])).toBe(false);
    expect(isFilterSet("x")).toBe(true);
    expect(isFilterSet([""])).toBe(true);
  });

  /**
   * Pins the contract rather than endorsing it: no server-mode hook splits this
   * yet, which is why no server-mode column declares multiselect. If one ever
   * does, its hook has to `.in()` on the split value.
   */
  it("toQueryFilters joins a multiselect with commas", () => {
    const q = toQueryFilters({ ...emptyView(), filters: { staff: ["a", "b"], type: "" } });
    expect(q.staff).toBe("a,b");
    expect(q.type).toBe("all");
  });

  it("a view with only an empty array is still clean", () => {
    expect(isViewClean({ ...emptyView(), filters: { staff: [] } })).toBe(true);
    expect(isViewClean({ ...emptyView(), filters: { staff: ["a"] } })).toBe(false);
  });
});
