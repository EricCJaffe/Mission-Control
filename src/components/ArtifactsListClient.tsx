"use client";

import { useState } from "react";
import RtfEditor from "@/components/RtfEditor";

type Asset = {
  id: string;
  asset_type: string;
  status: string | null;
  content_md: string;
  created_at: string;
};

export default function ArtifactsListClient({
  assets,
  redirect,
}: {
  assets: Asset[];
  redirect: string;
}) {
  const [editing, setEditing] = useState<Asset | null>(null);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState("draft");

  function openEdit(asset: Asset) {
    setEditing(asset);
    setDraft(asset.content_md || "");
    setStatus(asset.status || "draft");
    (document.getElementById("asset-edit-dialog") as HTMLDialogElement | null)?.showModal();
  }

  function snippet(text: string) {
    const cleaned = text
      .replace(/[#*_>`]/g, "")
      .replace(/\[(.*?)\]\(.*?\)/g, "$1")
      .replace(/\s+/g, " ")
      .trim();
    if (!cleaned) return "";
    return cleaned.length > 240 ? `${cleaned.slice(0, 240)}…` : cleaned;
  }

  return (
    <div className="mt-3 grid gap-3 text-sm">
      {assets.map((asset) => (
        <div key={asset.id} className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-semibold">{asset.asset_type}</div>
            <div className="text-xs text-slate-500">Status: {asset.status || "draft"}</div>
          </div>
          <div className="mt-2 text-xs text-slate-500">{new Date(asset.created_at).toLocaleString()}</div>
          <div className="mt-2 text-sm text-slate-700">{snippet(asset.content_md) || "No content yet."}</div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <button
              className="rounded-full border border-slate-200 bg-white px-3 py-1"
              type="button"
              onClick={() => openEdit(asset)}
            >
              View / Edit
            </button>
            <a
              className="rounded-full border border-slate-200 bg-white px-3 py-1"
              href={`/assets/${asset.id}/export`}
            >
              Export
            </a>
            <form action="/assets/delete" method="post" data-toast="Artifact deleted">
              <input type="hidden" name="id" value={asset.id} />
              <input type="hidden" name="redirect" value={redirect} />
              <button className="rounded-full border border-slate-200 bg-white px-3 py-1" type="submit">
                Delete
              </button>
            </form>
          </div>
        </div>
      ))}
      {assets.length === 0 && (
        <div className="text-xs text-slate-500">No artifacts yet.</div>
      )}

      <dialog id="asset-edit-dialog" className="w-[92vw] max-w-4xl rounded-2xl border border-slate-200 p-0 shadow-xl">
        <div className="rounded-2xl bg-white p-6">
          <h3 className="text-lg font-semibold">{editing?.asset_type || "Edit Artifact"}</h3>
          <form className="mt-4 grid gap-3" action="/assets/update" method="post" data-toast="Artifact updated">
            <input type="hidden" name="id" value={editing?.id || ""} />
            <input type="hidden" name="redirect" value={redirect} />
            <select
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              name="status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="draft">draft</option>
              <option value="review">review</option>
              <option value="final">final</option>
            </select>
            <input type="hidden" name="content_md" value={draft} />
            <RtfEditor value={draft} onChange={setDraft} placeholder="Edit artifact..." minHeight="240px" />
            <div className="flex justify-end gap-2">
              <button
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                type="button"
                onClick={(event) => (event.currentTarget.closest("dialog") as HTMLDialogElement | null)?.close()}
              >
                Close
              </button>
              <button className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm" type="submit">
                Save
              </button>
            </div>
          </form>
        </div>
      </dialog>
    </div>
  );
}
