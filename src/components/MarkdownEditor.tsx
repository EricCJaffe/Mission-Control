'use client';

import { useEffect, useRef, useState } from 'react';
import { Bold, Code, Eye, Italic, Link2, List, ListOrdered, Pencil, Quote } from 'lucide-react';
import { renderMarkdown } from '@/lib/markdown';

/**
 * A plain markdown editor, replacing the WYSIWYG one.
 *
 * The rich-text editor stored markdown anyway, so this is a drop-in swap and
 * existing content keeps working. What it drops is the WYSIWYG behaviour Eric
 * disliked — the cursor jumping, the slash menu firing when you meant to type
 * a slash, formatting sticking to the wrong run of text.
 *
 * A textarea does exactly what you type. The toolbar inserts markdown around
 * the selection rather than mutating a document model, and Preview renders it
 * so you can still check a link before saving.
 */
export default function MarkdownEditor({
  value,
  onChange,
  placeholder,
  minHeight = '72px',
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  minHeight?: string;
}) {
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const ref = useRef<HTMLTextAreaElement>(null);

  // Grow to fit the content rather than reserving a fixed block of empty
  // space. Capped so a long description scrolls inside the editor instead of
  // pushing the rest of the form off the screen.
  useEffect(() => {
    const el = ref.current;
    if (!el || tab !== 'write') return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
  }, [value, tab]);

  /**
   * Wraps or prefixes the current selection.
   *
   * Selection is restored afterwards so you can hit bold twice, or bold then
   * italic, without hunting for your place again.
   */
  function apply(before: string, after = '', linePrefix = false) {
    const el = ref.current;
    if (!el) return;

    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = value.slice(start, end);

    let next: string;
    let cursorStart: number;
    let cursorEnd: number;

    if (linePrefix) {
      // Operate on whole lines, so a list button applied mid-sentence still
      // produces a list rather than a bullet in the middle of the line.
      const lineStart = value.lastIndexOf('\n', start - 1) + 1;
      const lineEnd = end === start ? value.indexOf('\n', start) : end;
      const sliceEnd = lineEnd === -1 ? value.length : lineEnd;
      const block = value.slice(lineStart, sliceEnd);
      const prefixed = block
        .split('\n')
        .map((line, i) => `${before.replace('{n}', String(i + 1))}${line}`)
        .join('\n');
      next = value.slice(0, lineStart) + prefixed + value.slice(sliceEnd);
      cursorStart = lineStart;
      cursorEnd = lineStart + prefixed.length;
    } else {
      next = value.slice(0, start) + before + selected + after + value.slice(end);
      cursorStart = start + before.length;
      cursorEnd = cursorStart + selected.length;
    }

    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(cursorStart, cursorEnd);
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    const mod = e.metaKey || e.ctrlKey;
    if (!mod) return;
    if (e.key === 'b') {
      e.preventDefault();
      apply('**', '**');
    } else if (e.key === 'i') {
      e.preventDefault();
      apply('*', '*');
    } else if (e.key === 'k') {
      e.preventDefault();
      apply('[', '](url)');
    }
  }

  const btn =
    'flex h-7 w-7 items-center justify-center rounded text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-900';

  return (
    <div className="overflow-hidden rounded-xl border-2 border-slate-300 bg-white">
      {/* Wraps rather than overflowing: seven icon buttons plus Write/Preview
          are wider than a phone, and without this the Preview button was cut
          off past the right edge of the dialog. */}
      <div className="flex flex-wrap items-center gap-0.5 border-b-2 border-slate-200 bg-slate-50 px-1.5 py-1">
        <button type="button" className={btn} onClick={() => apply('**', '**')} title="Bold (⌘B)" aria-label="Bold">
          <Bold className="h-4 w-4" />
        </button>
        <button type="button" className={btn} onClick={() => apply('*', '*')} title="Italic (⌘I)" aria-label="Italic">
          <Italic className="h-4 w-4" />
        </button>
        <button type="button" className={btn} onClick={() => apply('`', '`')} title="Code" aria-label="Code">
          <Code className="h-4 w-4" />
        </button>
        <button type="button" className={btn} onClick={() => apply('[', '](url)')} title="Link (⌘K)" aria-label="Link">
          <Link2 className="h-4 w-4" />
        </button>
        <span className="mx-1 h-5 w-px bg-slate-300" />
        <button type="button" className={btn} onClick={() => apply('- ', '', true)} title="Bullet list" aria-label="Bullet list">
          <List className="h-4 w-4" />
        </button>
        <button type="button" className={btn} onClick={() => apply('{n}. ', '', true)} title="Numbered list" aria-label="Numbered list">
          <ListOrdered className="h-4 w-4" />
        </button>
        <button type="button" className={btn} onClick={() => apply('> ', '', true)} title="Quote" aria-label="Quote">
          <Quote className="h-4 w-4" />
        </button>

        <div className="ml-auto flex gap-0.5">
          <button
            type="button"
            onClick={() => setTab('write')}
            className={`flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-semibold transition-colors ${
              tab === 'write' ? 'bg-blue-700 text-white' : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            <Pencil className="h-3.5 w-3.5" />
            Write
          </button>
          <button
            type="button"
            onClick={() => setTab('preview')}
            className={`flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-semibold transition-colors ${
              tab === 'preview' ? 'bg-blue-700 text-white' : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            <Eye className="h-3.5 w-3.5" />
            Preview
          </button>
        </div>
      </div>

      {tab === 'write' ? (
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          spellCheck
          rows={1}
          className="block w-full resize-none overflow-y-auto border-0 px-3 py-2 text-sm leading-relaxed text-slate-900 focus:outline-none"
          style={{ minHeight }}
        />
      ) : (
        <div
          className="markdown-preview px-3 py-2 text-sm leading-relaxed text-slate-900"
          style={{ minHeight }}
          dangerouslySetInnerHTML={{
            __html: renderMarkdown(value) || '<p class="text-slate-400">Nothing to preview.</p>',
          }}
        />
      )}
    </div>
  );
}
