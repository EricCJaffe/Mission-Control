"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";

type Item = { id: string; label: string; hint?: string | null };

/*
 * The dashboard's Tasks card, with a box to tick a task done and the title
 * opening it in /tasks to edit. Eric, 2026-10-03: "no ability to mark them
 * done from the field or directly edit them."
 *
 * Posts with json=1 for the reason recorded in /tasks/update: a fetch that
 * follows that route's redirect re-POSTs to a page and reports failure after
 * the write has already landed. A recurring task rolls forward on the server
 * (completionPatch), so after the refresh it simply drops off today's list.
 */
export default function DashboardTaskList({ items }: { items: Item[] }) {
  const router = useRouter();
  const [done, setDone] = useState<Set<string>>(new Set());
  const [failed, setFailed] = useState<string | null>(null);

  async function complete(id: string) {
    setDone((d) => new Set(d).add(id));
    setFailed(null);
    const body = new FormData();
    body.set("id", id);
    body.set("status", "done");
    body.set("json", "1");
    const res = await fetch("/tasks/update", { method: "POST", body }).catch(() => null);
    if (!res?.ok) {
      setDone((d) => {
        const n = new Set(d);
        n.delete(id);
        return n;
      });
      setFailed("Could not mark that done. Try again.");
      return;
    }
    router.refresh();
  }

  return (
    <>
      <ul className="mt-3 space-y-1.5">
        {items.map((item) => {
          const isDone = done.has(item.id);
          return (
            <li key={item.id} className="flex items-center gap-2 text-sm">
              <button
                type="button"
                onClick={() => complete(item.id)}
                disabled={isDone}
                aria-label={`Mark "${item.label}" done`}
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors ${
                  isDone ? "border-green-600 bg-green-600 text-white" : "border-slate-300 hover:border-green-600"
                }`}
              >
                {isDone && <Check className="h-3.5 w-3.5" />}
              </button>
              <Link
                href={`/tasks?task=${item.id}`}
                className={`min-w-0 flex-1 truncate hover:text-blue-700 ${isDone ? "text-slate-400 line-through" : "text-slate-700"}`}
              >
                {item.label}
              </Link>
              {item.hint && <span className="shrink-0 text-[11px] text-slate-400">{item.hint}</span>}
            </li>
          );
        })}
      </ul>
      {failed && <p className="mt-2 text-xs text-red-600">{failed}</p>}
    </>
  );
}
