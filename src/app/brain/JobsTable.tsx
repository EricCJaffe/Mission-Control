"use client";

import Link from "next/link";
import { CircleSlash } from "lucide-react";
import { DataTable, StatusPill, type DataColumn, type GroupDef } from "@/components/ui/DataTable";

/*
 * Every recurring job, one line each, grouped by mechanism by default.
 *
 * THE MECHANISM IS NOT DECORATION. A Vercel cron cannot see `~/dev`, so the
 * group a job sits in says what it is capable of — which is why grouping by it
 * is the default rather than an option somebody has to find.
 */

export type Mechanism = "systemd_timer" | "vercel_cron" | "paperclip";

export type JobRow = {
  id: string;
  name: string;
  mechanism: Mechanism;
  prompt_path: string | null;
  where: string | null;
  when: string | null;
  /** Date of the newest output file, when the job leaves one. */
  produced: string | null;
  /** Whole days since `produced`, computed on the server. */
  age: number | null;
  what: string | null;
  state: string | null;
};

const MECHANISM_LABEL: Record<Mechanism, string> = {
  systemd_timer: "systemd timers — ubuntu-dev",
  vercel_cron: "Vercel crons — the cloud",
  paperclip: "Paperclip — agents VM",
};
const MECHANISM_ORDER: Mechanism[] = ["systemd_timer", "vercel_cron", "paperclip"];

const columns: DataColumn<JobRow>[] = [
  {
    key: "name",
    header: "Job",
    sortable: true,
    pinLeft: true,
    render: (j) => (
      <span title={j.prompt_path ?? undefined}>
        {j.name}
        {j.prompt_path && <span className="ml-2 font-mono text-[11px] font-normal text-slate-400">{j.prompt_path}</span>}
      </span>
    ),
  },
  {
    key: "mechanism",
    header: "Mechanism",
    sortable: true,
    filter: "select",
    value: (j) => j.mechanism.replace("_", " "),
  },
  { key: "where", header: "Where", sortable: true, filter: "select" },
  {
    key: "when",
    header: "When",
    sortable: true,
    className: "font-mono",
  },
  {
    key: "produced",
    header: "Last output",
    sortable: true,
    render: (j) =>
      j.produced ? (
        <Link className="text-blue-700 hover:underline" href="/brain/briefs" onClick={(e) => e.stopPropagation()}>
          {j.produced}
          {j.age !== null && j.age > 0 && <span className="text-slate-400"> · {j.age}d ago</span>}
        </Link>
      ) : (
        /*
         * "No file" is not "did not run". The project sync writes rows into
         * this database and every Vercel cron acts on its own app; only the
         * brain jobs leave a file behind. Saying so here stops the column
         * reading as twenty-six failures.
         */
        <span className="inline-flex items-center gap-1 text-slate-400">
          <CircleSlash className="h-3 w-3" />
          no file
        </span>
      ),
  },
  {
    key: "state",
    header: "State",
    sortable: true,
    filter: "select",
    render: (j) => (j.state ? <StatusPill tone="yellow">{j.state}</StatusPill> : "—"),
  },
  {
    key: "what",
    header: "What",
    filter: "text",
    render: (j) => <span title={j.what ?? undefined}>{j.what ?? "—"}</span>,
  },
];

const groups: GroupDef<JobRow>[] = [
  {
    key: "mechanism",
    label: "Mechanism",
    of: (j) => ({ id: j.mechanism, label: MECHANISM_LABEL[j.mechanism] ?? j.mechanism }),
    rank: (id) => MECHANISM_ORDER.indexOf(id as Mechanism),
  },
  { key: "where", label: "Where", of: (j) => (j.where ? { id: j.where, label: j.where } : null) },
];

export default function JobsTable({ rows }: { rows: JobRow[] }) {
  return (
    <DataTable
      rows={rows}
      columns={columns}
      groups={groups}
      defaultGroup="mechanism"
      noun={["job", "jobs"]}
      searchPlaceholder="Search jobs…"
    />
  );
}
