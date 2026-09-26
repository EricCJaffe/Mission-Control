"use client";

import { DataTable, StatusPill, type DataColumn } from "@/components/ui/DataTable";

/*
 * Recent sync runs, one line each. `when` is formatted on the server so the
 * client render cannot disagree with it; `started_at` is the sort key.
 */

export type RunRow = {
  id: string;
  started_at: string;
  when: string;
  source: string;
  status: string;
  items_seen: number;
  items_created: number;
  items_updated: number;
  items_closed: number;
  error: string | null;
};

const num = (key: keyof RunRow, header: string): DataColumn<RunRow> => ({
  key,
  header,
  sortable: true,
  className: "text-right tabular-nums",
});

const columns: DataColumn<RunRow>[] = [
  { key: "started_at", header: "When", sortable: true, render: (r) => r.when },
  { key: "source", header: "Source", sortable: true, filter: "select" },
  {
    key: "status",
    header: "Status",
    sortable: true,
    filter: "select",
    render: (r) => (
      <span title={r.error ?? undefined}>
        <StatusPill tone={r.status === "error" ? "red" : r.status === "ok" ? "green" : "slate"}>{r.status}</StatusPill>
      </span>
    ),
  },
  num("items_seen", "Seen"),
  num("items_created", "New"),
  num("items_updated", "Updated"),
  num("items_closed", "Closed"),
  {
    key: "error",
    header: "Error",
    filter: "text",
    render: (r) => (r.error ? <span className="text-red-700" title={r.error}>{r.error}</span> : "—"),
  },
];

export default function RunsTable({ rows }: { rows: RunRow[] }) {
  return <DataTable rows={rows} columns={columns} noun={["run", "runs"]} hideSearch pageSize={25} />;
}
