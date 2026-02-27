'use client';

import { useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Heading1,
  Heading2,
  Heading3,
  Pilcrow,
  List,
  ListOrdered,
  Quote,
  Code,
  Link as LinkIcon,
  Undo,
  Redo,
} from 'lucide-react';

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  minHeight?: string;
};

export default function RichTextEditor({
  value,
  onChange,
  placeholder = 'Write here...',
  label,
  minHeight = '200px',
}: Props) {
  const [viewMode, setViewMode] = useState<'visual' | 'html'>('visual');
  const [htmlValue, setHtmlValue] = useState('');

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-blue-600 underline',
        },
      }),
      Underline,
      Placeholder.configure({ placeholder }),
    ],
    content: value || '',
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      onChange(html);
      setHtmlValue(html);
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none px-4 py-3',
        style: `min-height: ${minHeight}`,
      },
    },
  });

  // Sync external value changes to editor
  if (editor && value !== editor.getHTML() && viewMode === 'visual') {
    editor.commands.setContent(value || '', { emitUpdate: false });
  }

  const handleHtmlChange = (newHtml: string) => {
    setHtmlValue(newHtml);
    onChange(newHtml);
    if (editor) {
      editor.commands.setContent(newHtml, { emitUpdate: false });
    }
  };

  const ToolbarButton = ({
    onClick,
    isActive = false,
    children,
    title,
  }: {
    onClick: () => void;
    isActive?: boolean;
    children: React.ReactNode;
    title: string;
  }) => (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`p-2 rounded hover:bg-slate-100 transition-colors ${
        isActive ? 'bg-slate-100 text-blue-600' : 'text-slate-700'
      }`}
    >
      {children}
    </button>
  );

  const addLink = () => {
    const url = window.prompt('Enter URL:');
    if (url) {
      editor?.chain().focus().setLink({ href: url }).run();
    }
  };

  if (!editor) return null;

  return (
    <div className="space-y-2">
      {label && (
        <label className="block text-sm font-medium text-slate-700">
          {label}
        </label>
      )}

      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        {/* Tabs */}
        <div className="flex items-center border-b border-slate-200 bg-slate-50 px-4 py-2">
          <button
            type="button"
            onClick={() => setViewMode('visual')}
            className={`px-3 py-1 text-sm font-medium rounded transition-colors ${
              viewMode === 'visual'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Visual Editor
          </button>
          <button
            type="button"
            onClick={() => {
              setViewMode('html');
              setHtmlValue(editor.getHTML());
            }}
            className={`ml-2 px-3 py-1 text-sm font-medium rounded transition-colors ${
              viewMode === 'html'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            HTML Source
          </button>
        </div>

        {viewMode === 'visual' ? (
          <>
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-white px-2 py-2">
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleBold().run()}
                isActive={editor.isActive('bold')}
                title="Bold"
              >
                <Bold className="w-4 h-4" />
              </ToolbarButton>

              <ToolbarButton
                onClick={() => editor.chain().focus().toggleItalic().run()}
                isActive={editor.isActive('italic')}
                title="Italic"
              >
                <Italic className="w-4 h-4" />
              </ToolbarButton>

              <ToolbarButton
                onClick={() => editor.chain().focus().toggleUnderline().run()}
                isActive={editor.isActive('underline')}
                title="Underline"
              >
                <UnderlineIcon className="w-4 h-4" />
              </ToolbarButton>

              <div className="w-px h-6 bg-slate-200 mx-1" />

              <ToolbarButton
                onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                isActive={editor.isActive('heading', { level: 1 })}
                title="Heading 1"
              >
                <Heading1 className="w-4 h-4" />
              </ToolbarButton>

              <ToolbarButton
                onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                isActive={editor.isActive('heading', { level: 2 })}
                title="Heading 2"
              >
                <Heading2 className="w-4 h-4" />
              </ToolbarButton>

              <ToolbarButton
                onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                isActive={editor.isActive('heading', { level: 3 })}
                title="Heading 3"
              >
                <Heading3 className="w-4 h-4" />
              </ToolbarButton>

              <ToolbarButton
                onClick={() => editor.chain().focus().setParagraph().run()}
                isActive={editor.isActive('paragraph')}
                title="Paragraph"
              >
                <Pilcrow className="w-4 h-4" />
              </ToolbarButton>

              <div className="w-px h-6 bg-slate-200 mx-1" />

              <ToolbarButton
                onClick={() => editor.chain().focus().toggleBulletList().run()}
                isActive={editor.isActive('bulletList')}
                title="Bullet List"
              >
                <List className="w-4 h-4" />
              </ToolbarButton>

              <ToolbarButton
                onClick={() => editor.chain().focus().toggleOrderedList().run()}
                isActive={editor.isActive('orderedList')}
                title="Numbered List"
              >
                <ListOrdered className="w-4 h-4" />
              </ToolbarButton>

              <ToolbarButton
                onClick={() => editor.chain().focus().toggleBlockquote().run()}
                isActive={editor.isActive('blockquote')}
                title="Block Quote"
              >
                <Quote className="w-4 h-4" />
              </ToolbarButton>

              <ToolbarButton
                onClick={() => editor.chain().focus().toggleCodeBlock().run()}
                isActive={editor.isActive('codeBlock')}
                title="Code Block"
              >
                <Code className="w-4 h-4" />
              </ToolbarButton>

              <div className="w-px h-6 bg-slate-200 mx-1" />

              <ToolbarButton
                onClick={addLink}
                isActive={editor.isActive('link')}
                title="Insert Link"
              >
                <LinkIcon className="w-4 h-4" />
              </ToolbarButton>

              <div className="w-px h-6 bg-slate-200 mx-1" />

              <ToolbarButton
                onClick={() => editor.chain().focus().undo().run()}
                title="Undo"
              >
                <Undo className="w-4 h-4" />
              </ToolbarButton>

              <ToolbarButton
                onClick={() => editor.chain().focus().redo().run()}
                title="Redo"
              >
                <Redo className="w-4 h-4" />
              </ToolbarButton>
            </div>

            {/* Editor Content */}
            <EditorContent editor={editor} />
          </>
        ) : (
          /* HTML Source View */
          <textarea
            value={htmlValue}
            onChange={(e) => handleHtmlChange(e.target.value)}
            className="w-full px-4 py-3 font-mono text-sm focus:outline-none"
            style={{ minHeight }}
            spellCheck={false}
          />
        )}
      </div>
    </div>
  );
}
