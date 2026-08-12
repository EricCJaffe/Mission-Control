'use client';

import { useMemo, useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ArrowDown, ArrowUp, Check, EyeOff, GripVertical, Loader2, Plus, RotateCcw,
  Settings2, Tag, Trash2, X,
} from 'lucide-react';
import {
  buildSubjectTree,
  flattenTree,
  reorderMoves,
  type PrayerCategory,
  type PrayerSubjectNode,
} from '@/lib/spirit/prayer';

/**
 * Organise: the admin view of what the list is *about*.
 *
 * Everything here was previously fixed at migration time or reachable only by
 * accident. The categories were a CHECK constraint. `position` existed on every
 * subject and was never written, so the tree silently fell back to alphabetical
 * and there was nothing for a drag to persist into. Archiving was real in the
 * schema but the only button that offered it was buried inside the delete
 * confirmation, and archived subjects were then filtered out of the page query
 * entirely — so marking someone inactive made them unreachable rather than
 * inactive.
 *
 * The separation that matters: Organise changes the shape of the list, the
 * other tabs use it. Reordering people is not something you want to do while
 * praying, and praying is not the moment to discover you can.
 */

type SubjectRow = Omit<PrayerSubjectNode, 'children' | 'requests'>;
type Move = { id: string; position: number; parent_id: string | null; category: string };

const CARD = 'rounded-2xl border-2 border-slate-300 bg-white p-5 shadow-sm';

/** Which sibling group a subject belongs to — roots group under their category. */
function groupKeyOf(s: { parent_id: string | null; category: string }): string {
  return s.parent_id ?? `root:${s.category}`;
}

export default function PrayerOrganise({
  subjects,
  categories,
  requestCounts,
  onCategoryCreate,
  onCategoryEdit,
  onCategoryDelete,
  onSubjectEdit,
  onSubjectReorder,
  onSubjectCreate,
}: {
  subjects: SubjectRow[];
  categories: PrayerCategory[];
  /** Active requests per subject, so a row can say what retiring it would silence. */
  requestCounts: Map<string, number>;
  onCategoryCreate: (label: string) => Promise<unknown>;
  onCategoryEdit: (id: string, patch: Record<string, unknown>) => Promise<unknown>;
  onCategoryDelete: (id: string, reassignTo: string | null) => Promise<unknown>;
  onSubjectEdit: (id: string, patch: Record<string, unknown>) => Promise<unknown>;
  onSubjectReorder: (moves: Move[]) => Promise<unknown>;
  onSubjectCreate: (payload: Record<string, unknown>) => Promise<unknown>;
}) {
  const [showInactive, setShowInactive] = useState(false);
  const [managingCategories, setManagingCategories] = useState(false);
  const [addingIn, setAddingIn] = useState<string | null>(null);
  // Applied immediately so a drag settles where it was dropped rather than
  // snapping back until the server round trip and refetch land.
  const [order, setOrder] = useState<Map<string, number>>(new Map());

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const positioned = useMemo(
    () => subjects.map((s) => ({ ...s, position: order.get(s.id) ?? s.position })),
    [subjects, order]
  );

  const visible = useMemo(
    () => (showInactive ? positioned : positioned.filter((s) => !s.archived)),
    [positioned, showInactive]
  );

  // Requests are not needed here — Organise is about the shape of the list, not
  // its contents — so the tree is built with an empty request set.
  const tree = useMemo(() => buildSubjectTree(visible, []), [visible]);
  const flat = useMemo(() => flattenTree(tree), [tree]);

  const activeCategories = useMemo(
    () => categories.filter((c) => !c.archived),
    [categories]
  );

  /** Categories that have something in them, even if retired, still render. */
  const shownCategories = useMemo(() => {
    const inUse = new Set(visible.filter((s) => !s.parent_id).map((s) => s.category));
    return categories.filter((c) => !c.archived || inUse.has(c.key));
  }, [categories, visible]);

  const rootsByCategory = useMemo(() => {
    const map = new Map<string, PrayerSubjectNode[]>();
    for (const node of tree) {
      const list = map.get(node.category);
      if (list) list.push(node);
      else map.set(node.category, [node]);
    }
    return map;
  }, [tree]);

  const byId = useMemo(() => new Map(positioned.map((s) => [s.id, s])), [positioned]);

  /** How many subjects sit under each heading, for the delete confirmation. */
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of positioned) counts.set(s.category, (counts.get(s.category) ?? 0) + 1);
    return counts;
  }, [positioned]);

  /** Every descendant of a subject, so a category change can follow the branch. */
  const descendantsOf = useMemo(() => {
    const children = new Map<string, string[]>();
    for (const s of positioned) {
      if (!s.parent_id) continue;
      const list = children.get(s.parent_id);
      if (list) list.push(s.id);
      else children.set(s.parent_id, [s.id]);
    }
    return (id: string): string[] => {
      const out: string[] = [];
      const stack = [...(children.get(id) ?? [])];
      const seen = new Set<string>();
      while (stack.length) {
        const next = stack.pop()!;
        if (seen.has(next)) continue;
        seen.add(next);
        out.push(next);
        stack.push(...(children.get(next) ?? []));
      }
      return out;
    };
  }, [positioned]);

  /**
   * A drag settles inside its own sibling group.
   *
   * Cross-group dragging in a tree this deep — 120 subjects, some nested three
   * levels — means dropping onto a collapsed branch you cannot see the inside
   * of, and it is the interaction that produces "where did Noah go". Moving
   * between parents or categories is an explicit control on each row instead,
   * which also gives the keyboard a way to do it.
   */
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const moved = byId.get(String(active.id));
    const target = byId.get(String(over.id));
    if (!moved || !target) return;
    if (groupKeyOf(moved) !== groupKeyOf(target)) return;

    const siblings = positioned
      .filter((s) => groupKeyOf(s) === groupKeyOf(moved))
      .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));

    const from = siblings.findIndex((s) => s.id === active.id);
    const to = siblings.findIndex((s) => s.id === over.id);
    if (from < 0 || to < 0) return;

    const next = arrayMove(siblings, from, to);
    const moves = reorderMoves(next, {
      parentId: moved.parent_id,
      category: moved.category,
    });
    if (moves.length === 0) return;

    setOrder((prev) => {
      const copy = new Map(prev);
      next.forEach((s, i) => copy.set(s.id, (i + 1) * 10));
      return copy;
    });
    onSubjectReorder(moves);
  }

  /** Nudge a subject one place within its group, for keyboard and touch. */
  function nudge(id: string, direction: -1 | 1) {
    const subject = byId.get(id);
    if (!subject) return;
    const siblings = positioned
      .filter((s) => groupKeyOf(s) === groupKeyOf(subject))
      .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
    const from = siblings.findIndex((s) => s.id === id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= siblings.length) return;

    const next = arrayMove(siblings, from, to);
    const moves = reorderMoves(next, { parentId: subject.parent_id, category: subject.category });
    setOrder((prev) => {
      const copy = new Map(prev);
      next.forEach((s, i) => copy.set(s.id, (i + 1) * 10));
      return copy;
    });
    if (moves.length > 0) onSubjectReorder(moves);
  }

  /**
   * Move a subject under a different parent, or to the top of a category.
   *
   * The whole branch takes the destination's category with it. Category is what
   * labels a request on the praying screens — "FAMILY › Matt and Becky › Noah"
   * — so leaving descendants behind on the old heading would put a household
   * under two different labels depending on which member you were looking at.
   */
  function moveTo(id: string, destination: string) {
    const subject = byId.get(id);
    if (!subject) return;

    const toRoot = destination.startsWith('root:');
    const parentId = toRoot ? null : destination;
    const category = toRoot ? destination.slice(5) : (byId.get(destination)?.category ?? subject.category);

    if (parentId === subject.parent_id && category === subject.category) return;

    const groupKey = parentId ?? `root:${category}`;
    const lastPosition = positioned
      .filter((s) => s.id !== id && groupKeyOf(s) === groupKey)
      .reduce((max, s) => Math.max(max, s.position), 0);

    const moves: Move[] = [{ id, position: lastPosition + 10, parent_id: parentId, category }];
    for (const descendantId of descendantsOf(id)) {
      const d = byId.get(descendantId);
      if (!d || d.category === category) continue;
      moves.push({ id: d.id, position: d.position, parent_id: d.parent_id, category });
    }

    setOrder((prev) => new Map(prev).set(id, lastPosition + 10));
    onSubjectReorder(moves);
  }

  /** Destinations for the move control: every category top level, every subject. */
  function destinationsFor(id: string) {
    const blocked = new Set([id, ...descendantsOf(id)]);
    return {
      roots: activeCategories,
      parents: flat.filter((s) => !blocked.has(s.id)),
    };
  }

  return (
    <div className="space-y-4">
      <div className={CARD}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-slate-900">Organise the list</p>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              Who and what the prayers are about. Drag to reorder within a group, move a
              subject under a different person or heading, and retire anything you have
              stopped praying for without deleting the record of having prayed for it.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setManagingCategories((v) => !v)}
              className={`flex min-h-[38px] items-center gap-1.5 rounded-xl px-3 text-xs font-bold ${
                managingCategories
                  ? 'bg-indigo-600 text-white'
                  : 'border-2 border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Tag className="h-3.5 w-3.5" />
              Headings
            </button>
            <button
              type="button"
              onClick={() => setShowInactive((v) => !v)}
              className={`flex min-h-[38px] items-center gap-1.5 rounded-xl px-3 text-xs font-bold ${
                showInactive
                  ? 'bg-slate-700 text-white'
                  : 'border-2 border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <EyeOff className="h-3.5 w-3.5" />
              {showInactive ? 'Hiding nothing' : 'Show inactive'}
            </button>
          </div>
        </div>
      </div>

      {managingCategories && (
        <CategoryManager
          categories={categories}
          counts={categoryCounts}
          onCreate={onCategoryCreate}
          onEdit={onCategoryEdit}
          onDelete={onCategoryDelete}
        />
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        {shownCategories.map((category) => {
          const roots = rootsByCategory.get(category.key) ?? [];
          return (
            <section key={category.key} className={CARD}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                  {category.label}
                  <span className="text-xs font-normal text-slate-400">
                    {flattenTree(roots).length}
                  </span>
                  {category.archived && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      retired heading
                    </span>
                  )}
                </h2>
                <button
                  type="button"
                  onClick={() =>
                    setAddingIn(addingIn === `root:${category.key}` ? null : `root:${category.key}`)
                  }
                  className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                >
                  <Plus className="h-3.5 w-3.5" /> Add subject
                </button>
              </div>

              {addingIn === `root:${category.key}` && (
                <InlineName
                  placeholder={`New subject in ${category.label}`}
                  onCancel={() => setAddingIn(null)}
                  onSave={async (name) => {
                    await onSubjectCreate({ name, category: category.key, parent_id: null });
                    setAddingIn(null);
                  }}
                />
              )}

              {roots.length === 0 ? (
                <p className="mt-2 text-xs text-slate-400">Nothing filed here yet.</p>
              ) : (
                <div className="mt-2">
                  <SortableGroup
                    nodes={roots}
                    addingIn={addingIn}
                    setAddingIn={setAddingIn}
                    requestCounts={requestCounts}
                    destinationsFor={destinationsFor}
                    onNudge={nudge}
                    onMoveTo={moveTo}
                    onSubjectEdit={onSubjectEdit}
                    onSubjectCreate={onSubjectCreate}
                  />
                </div>
              )}
            </section>
          );
        })}
      </DndContext>
    </div>
  );
}

/** One sibling group. Recurses so each nested group is sortable in its own right. */
function SortableGroup({
  nodes,
  addingIn,
  setAddingIn,
  requestCounts,
  destinationsFor,
  onNudge,
  onMoveTo,
  onSubjectEdit,
  onSubjectCreate,
}: {
  nodes: PrayerSubjectNode[];
  addingIn: string | null;
  setAddingIn: (v: string | null) => void;
  requestCounts: Map<string, number>;
  destinationsFor: (id: string) => { roots: PrayerCategory[]; parents: Array<PrayerSubjectNode & { depth: number }> };
  onNudge: (id: string, direction: -1 | 1) => void;
  onMoveTo: (id: string, destination: string) => void;
  onSubjectEdit: (id: string, patch: Record<string, unknown>) => Promise<unknown>;
  onSubjectCreate: (payload: Record<string, unknown>) => Promise<unknown>;
}) {
  return (
    <SortableContext items={nodes.map((n) => n.id)} strategy={verticalListSortingStrategy}>
      <ul className="space-y-1">
        {nodes.map((node, index) => (
          <li key={node.id}>
            <SubjectRowCard
              node={node}
              first={index === 0}
              last={index === nodes.length - 1}
              requestCount={requestCounts.get(node.id) ?? 0}
              destinations={destinationsFor(node.id)}
              onNudge={onNudge}
              onMoveTo={onMoveTo}
              onEdit={onSubjectEdit}
              onAddChild={() => setAddingIn(addingIn === node.id ? null : node.id)}
            />

            {addingIn === node.id && (
              <div style={{ paddingLeft: 26 }}>
                <InlineName
                  placeholder={`New subject under ${node.name}`}
                  onCancel={() => setAddingIn(null)}
                  onSave={async (name) => {
                    await onSubjectCreate({
                      name,
                      category: node.category,
                      parent_id: node.id,
                    });
                    setAddingIn(null);
                  }}
                />
              </div>
            )}

            {node.children.length > 0 && (
              <div className="mt-1 border-l-2 border-slate-100 pl-3">
                <SortableGroup
                  nodes={node.children}
                  addingIn={addingIn}
                  setAddingIn={setAddingIn}
                  requestCounts={requestCounts}
                  destinationsFor={destinationsFor}
                  onNudge={onNudge}
                  onMoveTo={onMoveTo}
                  onSubjectEdit={onSubjectEdit}
                  onSubjectCreate={onSubjectCreate}
                />
              </div>
            )}
          </li>
        ))}
      </ul>
    </SortableContext>
  );
}

function SubjectRowCard({
  node,
  first,
  last,
  requestCount,
  destinations,
  onNudge,
  onMoveTo,
  onEdit,
  onAddChild,
}: {
  node: PrayerSubjectNode;
  first: boolean;
  last: boolean;
  requestCount: number;
  destinations: { roots: PrayerCategory[]; parents: Array<PrayerSubjectNode & { depth: number }> };
  onNudge: (id: string, direction: -1 | 1) => void;
  onMoveTo: (id: string, destination: string) => void;
  onEdit: (id: string, patch: Record<string, unknown>) => Promise<unknown>;
  onAddChild: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: node.id,
  });
  const [renaming, setRenaming] = useState(false);
  const [moving, setMoving] = useState(false);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group rounded-xl border-2 px-2 py-1.5 ${
        node.archived ? 'border-slate-200 bg-slate-50' : 'border-transparent hover:border-slate-200'
      }`}
    >
      <div className="flex items-center gap-1.5">
        <button
          {...attributes}
          {...listeners}
          type="button"
          aria-label={`Reorder ${node.name}`}
          className="shrink-0 cursor-grab touch-none text-slate-300 hover:text-slate-500 active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" />
        </button>

        {renaming ? (
          <InlineName
            defaultValue={node.name}
            placeholder="Subject name"
            onCancel={() => setRenaming(false)}
            onSave={async (name) => {
              await onEdit(node.id, { name });
              setRenaming(false);
            }}
          />
        ) : (
          <>
            <button
              type="button"
              onClick={() => setRenaming(true)}
              className={`min-w-0 flex-1 truncate text-left text-sm ${
                node.archived ? 'text-slate-400 line-through' : 'text-slate-800'
              }`}
              title="Rename"
            >
              {node.name}
            </button>

            {requestCount > 0 && (
              <span className="shrink-0 text-[11px] text-slate-400">
                {requestCount} prayer{requestCount === 1 ? '' : 's'}
              </span>
            )}

            <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
              <IconBtn label="Move up" disabled={first} onClick={() => onNudge(node.id, -1)}>
                <ArrowUp className="h-3.5 w-3.5" />
              </IconBtn>
              <IconBtn label="Move down" disabled={last} onClick={() => onNudge(node.id, 1)}>
                <ArrowDown className="h-3.5 w-3.5" />
              </IconBtn>
              <IconBtn label="Add subject underneath" onClick={onAddChild}>
                <Plus className="h-3.5 w-3.5" />
              </IconBtn>
              <IconBtn label="Move somewhere else" onClick={() => setMoving((v) => !v)}>
                <Settings2 className="h-3.5 w-3.5" />
              </IconBtn>
              {node.archived ? (
                <IconBtn
                  label="Bring back into the list"
                  onClick={() => onEdit(node.id, { archived: false })}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </IconBtn>
              ) : (
                <IconBtn
                  label="Mark inactive"
                  onClick={() => onEdit(node.id, { archived: true })}
                >
                  <EyeOff className="h-3.5 w-3.5" />
                </IconBtn>
              )}
            </div>
          </>
        )}
      </div>

      {node.archived && (
        <p className="ml-6 mt-0.5 text-[11px] text-slate-500">
          Inactive — out of the rotation and off today&apos;s list.
          {requestCount > 0 && ` ${requestCount} prayer${requestCount === 1 ? '' : 's'} held here.`}
        </p>
      )}

      {moving && (
        <div className="ml-6 mt-1.5 flex flex-wrap items-center gap-2">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Move under
          </label>
          <select
            defaultValue=""
            onChange={(e) => {
              if (!e.target.value) return;
              onMoveTo(node.id, e.target.value);
              setMoving(false);
            }}
            aria-label={`Move ${node.name}`}
            className="rounded-lg border-2 border-slate-200 bg-white px-2 py-1 text-xs focus:border-indigo-500 focus:outline-none"
          >
            <option value="">Choose a destination…</option>
            <optgroup label="Top level of a heading">
              {destinations.roots.map((c) => (
                <option key={c.key} value={`root:${c.key}`}>{c.label}</option>
              ))}
            </optgroup>
            <optgroup label="Underneath a subject">
              {destinations.parents.map((s) => (
                <option key={s.id} value={s.id}>
                  {' '.repeat(s.depth * 3)}{s.name}
                </option>
              ))}
            </optgroup>
          </select>
          <button
            type="button"
            onClick={() => setMoving(false)}
            className="text-[11px] font-semibold text-slate-500"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * The headings themselves.
 *
 * Renaming never touches the stored key, so "Government & Authority" can become
 * "Leaders" without detaching a single subject from it. Deleting always moves
 * what was filed under it somewhere else and says where — a heading is a label,
 * and removing a label should never remove people.
 */
function CategoryManager({
  categories,
  counts,
  onCreate,
  onEdit,
  onDelete,
}: {
  categories: PrayerCategory[];
  counts: Map<string, number>;
  onCreate: (label: string) => Promise<unknown>;
  onEdit: (id: string, patch: Record<string, unknown>) => Promise<unknown>;
  onDelete: (id: string, reassignTo: string | null) => Promise<unknown>;
}) {
  const [adding, setAdding] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [reassignTo, setReassignTo] = useState('');

  const ordered = useMemo(
    () => [...categories].sort((a, b) => a.position - b.position),
    [categories]
  );

  function swap(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= ordered.length) return;
    const a = ordered[index];
    const b = ordered[target];
    onEdit(a.id, { position: b.position });
    onEdit(b.id, { position: a.position });
  }

  return (
    <div className={CARD}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-slate-900">Headings</p>
          <p className="mt-0.5 text-xs text-slate-600">
            Rename freely — the subjects underneath stay attached. Retiring a heading keeps
            what is filed under it readable but stops offering it for new subjects.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
        >
          <Plus className="h-3.5 w-3.5" /> New heading
        </button>
      </div>

      {adding && (
        <InlineName
          placeholder="Heading name — Neighbours, Grandchildren…"
          onCancel={() => setAdding(false)}
          onSave={async (label) => {
            await onCreate(label);
            setAdding(false);
          }}
        />
      )}

      <ul className="mt-3 space-y-1">
        {ordered.map((category, index) => {
          const count = counts.get(category.key) ?? 0;
          return (
            <li key={category.id} className="rounded-xl px-2 py-1.5 hover:bg-slate-50">
              <div className="flex items-center gap-1.5">
                {renamingId === category.id ? (
                  <InlineName
                    defaultValue={category.label}
                    placeholder="Heading name"
                    onCancel={() => setRenamingId(null)}
                    onSave={async (label) => {
                      await onEdit(category.id, { label });
                      setRenamingId(null);
                    }}
                  />
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setRenamingId(category.id)}
                      title="Rename"
                      className={`min-w-0 flex-1 truncate text-left text-sm font-semibold ${
                        category.archived ? 'text-slate-400 line-through' : 'text-slate-800'
                      }`}
                    >
                      {category.label}
                    </button>
                    <span className="shrink-0 text-[11px] text-slate-400">
                      {count} subject{count === 1 ? '' : 's'}
                    </span>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <IconBtn label="Move up" disabled={index === 0} onClick={() => swap(index, -1)}>
                        <ArrowUp className="h-3.5 w-3.5" />
                      </IconBtn>
                      <IconBtn
                        label="Move down"
                        disabled={index === ordered.length - 1}
                        onClick={() => swap(index, 1)}
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </IconBtn>
                      {category.archived ? (
                        <IconBtn label="Use again" onClick={() => onEdit(category.id, { archived: false })}>
                          <RotateCcw className="h-3.5 w-3.5" />
                        </IconBtn>
                      ) : (
                        <IconBtn label="Retire heading" onClick={() => onEdit(category.id, { archived: true })}>
                          <EyeOff className="h-3.5 w-3.5" />
                        </IconBtn>
                      )}
                      <IconBtn
                        label="Delete heading"
                        danger
                        onClick={() => {
                          setConfirmingId(category.id);
                          setReassignTo(
                            ordered.find((c) => c.id !== category.id && !c.archived)?.key ?? ''
                          );
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </IconBtn>
                    </div>
                  </>
                )}
              </div>

              {confirmingId === category.id && (
                <div className="mt-1.5 rounded-xl bg-rose-50 p-3">
                  <p className="text-xs text-rose-800">
                    {count > 0
                      ? `${count} subject${count === 1 ? '' : 's'} filed under "${category.label}" will move to another heading — nothing is deleted.`
                      : `Delete "${category.label}"? Nothing is filed under it.`}
                  </p>
                  {count > 0 && (
                    <select
                      value={reassignTo}
                      onChange={(e) => setReassignTo(e.target.value)}
                      aria-label="Move them to"
                      className="mt-1.5 rounded-lg border-2 border-rose-200 bg-white px-2 py-1 text-xs"
                    >
                      {ordered
                        .filter((c) => c.id !== category.id && !c.archived)
                        .map((c) => (
                          <option key={c.key} value={c.key}>{c.label}</option>
                        ))}
                    </select>
                  )}
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        await onDelete(category.id, reassignTo || null);
                        setConfirmingId(null);
                      }}
                      className="rounded-lg bg-rose-600 px-3 py-1 text-xs font-semibold text-white"
                    >
                      Delete heading
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingId(null)}
                      className="rounded-lg px-3 py-1 text-xs font-semibold text-slate-500"
                    >
                      Keep it
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function IconBtn({
  children,
  label,
  onClick,
  danger,
  disabled,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors disabled:opacity-25 ${
        danger
          ? 'text-slate-400 hover:bg-rose-50 hover:text-rose-600'
          : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'
      }`}
    >
      {children}
    </button>
  );
}

function InlineName({
  defaultValue = '',
  placeholder,
  onSave,
  onCancel,
}: {
  defaultValue?: string;
  placeholder: string;
  onSave: (value: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(defaultValue);
  const [saving, setSaving] = useState(false);

  async function commit() {
    if (!value.trim() || saving) return;
    setSaving(true);
    try {
      await onSave(value.trim());
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="my-1 flex flex-1 items-center gap-1">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') onCancel();
        }}
        className="min-w-0 flex-1 rounded-lg border-2 border-indigo-300 px-2 py-1 text-xs focus:outline-none"
      />
      <button
        type="button"
        onClick={commit}
        disabled={saving || !value.trim()}
        aria-label="Save"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white disabled:opacity-50"
      >
        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3.5 w-3.5" strokeWidth={3} />}
      </button>
      <button
        type="button"
        onClick={onCancel}
        aria-label="Cancel"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
