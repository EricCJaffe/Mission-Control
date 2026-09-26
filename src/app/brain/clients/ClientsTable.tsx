"use client";

import { ShieldCheck, Inbox, FileWarning } from "lucide-react";
import { DataTable, StatusPill, type DataColumn } from "@/components/ui/DataTable";

/*
 * The client-brain register, one line per `clients/<slug>/`.
 *
 * The server page reads the rows and works out `missing` and `age` — age uses
 * the clock, and computing it here would disagree with the server render.
 * Columns live in this file because a column's render function cannot cross
 * from a server component.
 */

export type ClientRow = {
  id: string;
  slug: string;
  name: string;
  status: string | null;
  owner: string | null;
  eric_role: string | null;
  last_contact_on: string | null;
  has_proposed: boolean;
  files: string[];
  /** Files of the four-file set that are absent. */
  missing: string[];
  /** Whole days since last contact, or null when none is stated. */
  age: number | null;
};

const brainLabel = (c: ClientRow) =>
  c.missing.length === 0 ? "complete" : c.files.length === 0 ? "empty" : `missing ${c.missing.join(", ")}`;

const columns: DataColumn<ClientRow>[] = [
  {
    key: "name",
    header: "Client",
    sortable: true,
    pinLeft: true,
    render: (c) => (
      <span className="inline-flex items-center gap-1.5" title={`clients/${c.slug}/`}>
        {c.name}
        <span className="font-mono text-[11px] font-normal text-slate-400">{c.slug}/</span>
        {c.has_proposed && (
          <span title="A _proposed.md is waiting for you">
            <StatusPill tone="blue">
              <Inbox className="mr-1 h-3 w-3" />
              proposed
            </StatusPill>
          </span>
        )}
      </span>
    ),
  },
  {
    key: "status",
    header: "Engagement",
    sortable: true,
    filter: "select",
    render: (c) => c.status ?? <span className="text-slate-400">not stated</span>,
  },
  {
    key: "owner",
    header: "Day-to-day owner",
    sortable: true,
    filter: "select",
    render: (c) =>
      c.owner ? (
        <span className="inline-flex items-center gap-1">
          <ShieldCheck className="h-3 w-3 shrink-0 text-emerald-600" aria-label="stated in _ownership.md" />
          {c.owner}
        </span>
      ) : (
        /*
         * Blank means _ownership.md does not name this account, not that Eric
         * runs it. Inferring an owner from a profile.md written out of the
         * mailbox is precisely what that file was created to stop.
         */
        <span className="text-slate-400">not in _ownership.md</span>
      ),
  },
  { key: "eric_role", header: "Eric's role", sortable: true, filter: "select" },
  {
    key: "last_contact_on",
    header: "Last contact",
    sortable: true,
    render: (c) =>
      c.last_contact_on ? (
        <>
          {c.last_contact_on}
          {c.age !== null && c.age > 0 && <span className="text-slate-400"> · {c.age}d</span>}
        </>
      ) : (
        /*
         * Never back-filled from a file date. An mtime says when a job last
         * ran, and showing that as contact would report the agent's activity
         * as the relationship's.
         */
        <span className="text-slate-400">not stated</span>
      ),
  },
  {
    key: "brain",
    header: "Brain",
    sortable: true,
    filter: "select",
    value: (c) => (c.missing.length === 0 ? "complete" : c.files.length === 0 ? "empty" : "incomplete"),
    render: (c) =>
      c.missing.length === 0 ? (
        <StatusPill tone="green">complete</StatusPill>
      ) : (
        <span title={brainLabel(c)}>
          <StatusPill tone="yellow">
            <FileWarning className="mr-1 h-3 w-3" />
            {brainLabel(c)}
          </StatusPill>
        </span>
      ),
  },
];

export default function ClientsTable({ rows }: { rows: ClientRow[] }) {
  return <DataTable rows={rows} columns={columns} noun={["client", "clients"]} searchPlaceholder="Search clients…" />;
}
