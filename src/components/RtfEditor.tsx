"use client";

import { useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Markdown } from "tiptap-markdown";

type Props = {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  minHeight?: string;
};

export default function RtfEditor({ value, onChange, placeholder, minHeight = "140px" }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false }),
      TaskList,
      TaskItem,
      Placeholder.configure({ placeholder: placeholder || "Write here..." }),
      Markdown,
    ],
    content: value || "",
    onUpdate: ({ editor }) => {
      const next = (editor.storage as any)?.markdown?.getMarkdown?.() || editor.getText();
      onChange(next);
    },
  });

  useEffect(() => {
    if (editor && value !== ((editor.storage as any)?.markdown?.getMarkdown?.() || editor.getText())) {
      editor.commands.setContent(value || "", { emitUpdate: false });
    }
  }, [editor, value]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap gap-2 border-b border-slate-200 px-3 py-2 text-xs">
        <button className="rounded border px-2 py-1" type="button" onClick={() => editor?.chain().focus().toggleBold().run()}>
          Bold
        </button>
        <button className="rounded border px-2 py-1" type="button" onClick={() => editor?.chain().focus().toggleItalic().run()}>
          Italic
        </button>
        <button className="rounded border px-2 py-1" type="button" onClick={() => editor?.chain().focus().toggleUnderline().run()}>
          Underline
        </button>
        <button className="rounded border px-2 py-1" type="button" onClick={() => editor?.chain().focus().toggleBulletList().run()}>
          Bullets
        </button>
        <button className="rounded border px-2 py-1" type="button" onClick={() => editor?.chain().focus().toggleOrderedList().run()}>
          Numbered
        </button>
        <button className="rounded border px-2 py-1" type="button" onClick={() => editor?.chain().focus().toggleBlockquote().run()}>
          Quote
        </button>
      </div>
      <div className="px-3 py-2" style={{ minHeight }}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
