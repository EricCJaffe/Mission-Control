"use client";

import { useEffect, useMemo, useState } from "react";
import { useEditor, EditorContent, BubbleMenu } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import { Markdown } from "tiptap-markdown";

type Props = {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  minHeight?: string;
};

export default function RtfEditor({ value, onChange, placeholder, minHeight = "140px" }: Props) {
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashPos, setSlashPos] = useState<number | null>(null);
  const [slashQuery, setSlashQuery] = useState("");
  const [slashIndex, setSlashIndex] = useState(0);

  const commands = useMemo(
    () => [
      { label: "Heading 1", run: (editor: any) => editor.chain().focus().setHeading({ level: 1 }).run() },
      { label: "Heading 2", run: (editor: any) => editor.chain().focus().setHeading({ level: 2 }).run() },
      { label: "Heading 3", run: (editor: any) => editor.chain().focus().setHeading({ level: 3 }).run() },
      { label: "Bulleted List", run: (editor: any) => editor.chain().focus().toggleBulletList().run() },
      { label: "Numbered List", run: (editor: any) => editor.chain().focus().toggleOrderedList().run() },
      { label: "Task List", run: (editor: any) => editor.chain().focus().toggleTaskList().run() },
      { label: "Quote", run: (editor: any) => editor.chain().focus().toggleBlockquote().run() },
      { label: "Code Block", run: (editor: any) => editor.chain().focus().toggleCodeBlock().run() },
      { label: "Horizontal Rule", run: (editor: any) => editor.chain().focus().setHorizontalRule().run() },
      { label: "Insert Table", run: (editor: any) => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
    ],
    []
  );

  const filteredCommands = useMemo(() => {
    if (!slashQuery.trim()) return commands;
    const q = slashQuery.toLowerCase();
    return commands.filter((cmd) => cmd.label.toLowerCase().includes(q));
  }, [commands, slashQuery]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      Link.configure({ openOnClick: false }),
      TaskList,
      TaskItem,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({ placeholder: placeholder || "Write here..." }),
      Markdown.configure({
        transformCopiedText: true,
        transformPastedText: true,
      }),
    ],
    content: value || "",
    onUpdate: ({ editor }) => {
      const next = (editor.storage as any)?.markdown?.getMarkdown?.() || editor.getText();
      onChange(next);
    },
    editorProps: {
      handleKeyDown: (_view, event) => {
        if (event.key === "/") {
          const pos = editor?.state.selection.from || null;
          setSlashOpen(true);
          setSlashPos(pos);
          setSlashQuery("");
          setSlashIndex(0);
        }
        if (event.key === "Escape" && slashOpen) {
          setSlashOpen(false);
        }
        return false;
      },
    },
  });

  useEffect(() => {
    if (editor && value !== ((editor.storage as any)?.markdown?.getMarkdown?.() || editor.getText())) {
      editor.commands.setContent(value || "", { emitUpdate: false });
    }
  }, [editor, value]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      {editor && (
        <BubbleMenu editor={editor} tippyOptions={{ duration: 150 }}>
          <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2 py-1 text-xs shadow-lg">
            <button className="rounded border px-2 py-1" type="button" onClick={() => editor.chain().focus().toggleBold().run()}>
              B
            </button>
            <button className="rounded border px-2 py-1" type="button" onClick={() => editor.chain().focus().toggleItalic().run()}>
              I
            </button>
            <button className="rounded border px-2 py-1" type="button" onClick={() => editor.chain().focus().toggleUnderline().run()}>
              U
            </button>
            <button className="rounded border px-2 py-1" type="button" onClick={() => editor.chain().focus().toggleStrike().run()}>
              S
            </button>
            <button className="rounded border px-2 py-1" type="button" onClick={() => editor.chain().focus().toggleCode().run()}>
              {"</>"}
            </button>
            <button
              className="rounded border px-2 py-1"
              type="button"
              onClick={() => {
                const href = window.prompt("Link URL");
                if (href) {
                  editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
                } else {
                  editor.chain().focus().unsetLink().run();
                }
              }}
            >
              Link
            </button>
          </div>
        </BubbleMenu>
      )}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-3 py-2 text-xs">
        <button className="rounded border px-2 py-1" type="button" onClick={() => editor?.chain().focus().toggleBold().run()}>
          Bold
        </button>
        <button className="rounded border px-2 py-1" type="button" onClick={() => editor?.chain().focus().toggleItalic().run()}>
          Italic
        </button>
        <button className="rounded border px-2 py-1" type="button" onClick={() => editor?.chain().focus().toggleUnderline().run()}>
          Underline
        </button>
        <button className="rounded border px-2 py-1" type="button" onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}>
          H1
        </button>
        <button className="rounded border px-2 py-1" type="button" onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>
          H2
        </button>
        <button className="rounded border px-2 py-1" type="button" onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}>
          H3
        </button>
        <button className="rounded border px-2 py-1" type="button" onClick={() => editor?.chain().focus().toggleBulletList().run()}>
          Bullets
        </button>
        <button className="rounded border px-2 py-1" type="button" onClick={() => editor?.chain().focus().toggleOrderedList().run()}>
          Numbered
        </button>
        <button className="rounded border px-2 py-1" type="button" onClick={() => editor?.chain().focus().toggleTaskList().run()}>
          Tasks
        </button>
        <button className="rounded border px-2 py-1" type="button" onClick={() => editor?.chain().focus().toggleBlockquote().run()}>
          Quote
        </button>
        <button className="rounded border px-2 py-1" type="button" onClick={() => editor?.chain().focus().toggleCodeBlock().run()}>
          Code
        </button>
        <button className="rounded border px-2 py-1" type="button" onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
          Table
        </button>
        <button className="rounded border px-2 py-1" type="button" onClick={() => editor?.chain().focus().undo().run()}>
          Undo
        </button>
        <button className="rounded border px-2 py-1" type="button" onClick={() => editor?.chain().focus().redo().run()}>
          Redo
        </button>
        <button className="rounded border px-2 py-1" type="button" onClick={() => setSlashOpen((prev) => !prev)}>
          / Commands
        </button>
      </div>
      <div className="relative px-3 py-2" style={{ minHeight }}>
        {slashOpen && (
          <div className="absolute left-3 top-3 z-10 w-56 rounded-xl border border-slate-200 bg-white p-2 text-xs shadow-lg">
            <div className="mb-2 text-[10px] uppercase tracking-widest text-slate-400">Insert</div>
            <input
              className="mb-2 w-full rounded-lg border border-slate-200 px-2 py-1 text-xs"
              placeholder="Search…"
              value={slashQuery}
              onChange={(e) => {
                setSlashQuery(e.target.value);
                setSlashIndex(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setSlashIndex((idx) => Math.min(idx + 1, filteredCommands.length - 1));
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setSlashIndex((idx) => Math.max(idx - 1, 0));
                }
                if (e.key === "Enter") {
                  e.preventDefault();
                  const cmd = filteredCommands[slashIndex];
                  if (cmd) {
                    if (slashPos && editor) {
                      editor.commands.deleteRange({ from: slashPos - 1, to: slashPos });
                    }
                    cmd.run(editor);
                    setSlashOpen(false);
                  }
                }
                if (e.key === "Escape") {
                  setSlashOpen(false);
                }
              }}
            />
            <div className="grid gap-1">
              {filteredCommands.map((cmd, idx) => (
                <button
                  key={cmd.label}
                  className={`rounded-lg px-2 py-1 text-left hover:bg-slate-100 ${idx === slashIndex ? "bg-slate-100" : ""}`}
                  type="button"
                  onClick={() => {
                    if (slashPos && editor) {
                      editor.commands.deleteRange({ from: slashPos - 1, to: slashPos });
                    }
                    cmd.run(editor);
                    setSlashOpen(false);
                  }}
                >
                  {cmd.label}
                </button>
              ))}
              {filteredCommands.length === 0 && (
                <div className="px-2 py-1 text-[11px] text-slate-400">No matches</div>
              )}
            </div>
          </div>
        )}
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
