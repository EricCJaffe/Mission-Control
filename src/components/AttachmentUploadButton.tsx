"use client";

import { useRef } from "react";
import { Paperclip } from "lucide-react";

/**
 * A paperclip-sized upload control. It posts to the same `/attachments/upload`
 * endpoint the full form did, but submits as soon as a file is chosen so the
 * host page needs no second button.
 */
export default function AttachmentUploadButton({
  scopeType,
  scopeId,
}: {
  scopeType: string;
  scopeId: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action="/attachments/upload"
      method="post"
      encType="multipart/form-data"
      data-progress="true"
      data-toast="Attachment uploading"
    >
      <input type="hidden" name="scope_type" value={scopeType} />
      <input type="hidden" name="scope_id" value={scopeId} />
      <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50">
        <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
        Attach
        <input
          className="sr-only"
          name="file"
          type="file"
          onChange={(event) => {
            if (event.currentTarget.files?.length) formRef.current?.requestSubmit();
          }}
        />
      </label>
    </form>
  );
}
