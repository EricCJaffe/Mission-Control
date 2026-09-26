import { describe, it } from "node:test";
import { expect } from "./expect.ts";
import { groupRows, UNGROUPED, type GroupDef } from "./tableView.ts";

interface Row { id: string; client: string | null; due: string | null }

const byClient: GroupDef<Row> = {
  key: "client",
  label: "Client",
  of: (r) => (r.client ? { id: r.client, label: r.client } : null),
};

const rows: Row[] = [
  { id: "1", client: "Zebra Co", due: "2026-09-01" },
  { id: "2", client: "Acme", due: null },
  { id: "3", client: null, due: "2026-09-30" },
  { id: "4", client: "Acme", due: "2026-09-15" },
];

describe("groupRows", () => {
  it("is null when nothing is grouped, so the table stays flat", () => {
    expect(groupRows(rows, null)).toBeNull();
  });

  it("buckets rows and counts them", () => {
    const groups = groupRows(rows, byClient)!;
    expect(groups.map((g) => [g.label, g.rows.length])).toEqual([
      ["Acme", 2],
      ["Zebra Co", 1],
      ["Ungrouped", 1],
    ]);
  });

  it("keeps a row with no value rather than dropping it", () => {
    const groups = groupRows(rows, byClient)!;
    const leftovers = groups.find((g) => g.id === UNGROUPED)!;
    expect(leftovers.rows.map((r) => r.id)).toEqual(["3"]);
  });

  it("puts the unvalued bucket last even when its label sorts first", () => {
    const groups = groupRows(rows, { ...byClient, emptyLabel: "AAA no client" })!;
    expect(groups[groups.length - 1].label).toBe("AAA no client");
  });

  it("honors an explicit rank over the labels", () => {
    // Past due before today before later is the order the work happens in,
    // and it is not the order the words sort in.
    const order = ["overdue", "today", "upcoming"];
    const byDue: GroupDef<Row> = {
      key: "due",
      label: "Due",
      rank: (id) => order.indexOf(id),
      of: (r) =>
        r.due === null ? null
          : r.due < "2026-09-10" ? { id: "overdue", label: "Past due" }
          : r.due < "2026-09-20" ? { id: "today", label: "Due today" }
          : { id: "upcoming", label: "Upcoming" },
    };
    expect(groupRows(rows, byDue)!.map((g) => g.label)).toEqual([
      "Past due", "Due today", "Upcoming", "Ungrouped",
    ]);
  });

  it("every row lands in exactly one bucket, so the counts add up", () => {
    const groups = groupRows(rows, byClient)!;
    expect(groups.reduce((n, g) => n + g.rows.length, 0)).toBe(rows.length);
  });

  it("an empty list groups into nothing rather than throwing", () => {
    expect(groupRows([], byClient)).toEqual([]);
  });
});
