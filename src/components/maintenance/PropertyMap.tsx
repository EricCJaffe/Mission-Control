'use client'

import { useState, type MouseEvent } from 'react'
import Link from 'next/link'
import { MapPin as PinIcon, Plus, Move, X } from 'lucide-react'
import type { Verdict } from '@/lib/maintenance/status'
import type { MapPin } from '@/lib/maintenance/map'

export type { MapPin }

/* Red / yellow / green, and slate for a building with nothing scheduled yet. */
const PIN_COLOR: Record<Verdict | 'none', string> = {
  red: 'bg-red-600',
  yellow: 'bg-yellow-400 text-slate-900',
  green: 'bg-green-600',
  none: 'bg-slate-700',
}

type Mode = { kind: 'view' } | { kind: 'add' } | { kind: 'move'; id: string; name: string }
type Spot = { x: number; y: number }

/*
 * Tap "Label a building", tap the building, type its name. That is the whole
 * interaction, because it is done once per building and then only read.
 *
 * Every change is a plain form post to /maintenance/map/place, like the rest of
 * /maintenance, so a pin is saved the moment it is placed and a reload never
 * loses one.
 */
/*
 * The photo is a phone screenshot about 1,000 px wide. Stretched to a desktop
 * page it went soft and towered off the screen, so it is capped at roughly its
 * own width (full page) or about half of it (the /maintenance header), and it
 * is only ever scaled down, which is what keeps it sharp.
 */
export default function PropertyMap({
  imageUrl,
  pins,
  compact = false,
}: {
  imageUrl: string | null
  pins: MapPin[]
  compact?: boolean
}) {
  const [mode, setMode] = useState<Mode>({ kind: 'view' })
  const [spot, setSpot] = useState<Spot | null>(null)
  const [open, setOpen] = useState<string | null>(null)

  const placed = pins.filter((p) => p.x !== null && p.y !== null)
  const unplaced = pins.filter((p) => p.x === null || p.y === null)

  function onImageClick(e: MouseEvent<HTMLDivElement>) {
    if (mode.kind === 'view') {
      setOpen(null)
      return
    }
    const box = e.currentTarget.getBoundingClientRect()
    const x = Math.min(100, Math.max(0, ((e.clientX - box.left) / box.width) * 100))
    const y = Math.min(100, Math.max(0, ((e.clientY - box.top) / box.height) * 100))
    setSpot({ x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 })
  }

  if (!imageUrl) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">
        No aerial photo yet. Add one below, then label the buildings on it.
      </div>
    )
  }

  const button = 'inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium shadow-sm'

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {mode.kind === 'view' ? (
          <button type="button" onClick={() => { setMode({ kind: 'add' }); setOpen(null) }} className={`${button} bg-blue-700 text-white`}>
            <Plus className="h-4 w-4" /> Label a building
          </button>
        ) : (
          <>
            <span className="rounded-xl bg-blue-50 px-3 py-2 text-sm text-blue-800">
              {mode.kind === 'add' ? 'Tap the building on the photo.' : `Tap the new spot for ${mode.name}.`}
            </span>
            <button type="button" onClick={() => { setMode({ kind: 'view' }); setSpot(null) }} className={`${button} border border-slate-300 bg-white text-slate-700`}>
              Cancel
            </button>
          </>
        )}
        <span className="text-sm text-slate-500">
          {placed.length} pinned{unplaced.length ? ` · ${unplaced.length} not on the map yet` : ''}
        </span>
      </div>

      <div
        className={`relative mx-auto w-full ${compact ? 'max-w-md' : 'max-w-2xl'} select-none overflow-hidden rounded-2xl border-2 border-slate-300 shadow-sm ${mode.kind === 'view' ? '' : 'cursor-crosshair'}`}
        onClick={onImageClick}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- a signed private URL; next/image would proxy and cache it */}
        <img src={imageUrl} alt="Aerial view of the property" className="block w-full" draggable={false} />

        {placed.map((p) => {
          const color = PIN_COLOR[p.verdict ?? 'none']
          const isOpen = open === p.id
          return (
            <div key={p.id} className="absolute" style={{ left: `${p.x}%`, top: `${p.y}%`, transform: 'translate(-50%, -100%)' }}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  if (mode.kind !== 'view') return
                  setOpen(isOpen ? null : p.id)
                }}
                className={`flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold text-white shadow-md ring-2 ring-white ${color}`}
              >
                <PinIcon className="h-3 w-3" />
                {p.name}
              </button>
              {isOpen && (
                <div
                  className="absolute left-1/2 top-full z-10 mt-1 w-60 -translate-x-1/2 rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-lg"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="font-semibold">{p.name}</div>
                  <div className="mt-1 text-slate-600">
                    {p.next ?? 'Nothing scheduled yet.'}
                    {p.schedules > 1 ? ` (+${p.schedules - 1} more)` : ''}
                  </div>
                  {p.inside.length > 0 && (
                    <div className="mt-2 text-xs text-slate-600">
                      <div className="font-medium text-slate-700">Inside</div>
                      <ul className="mt-0.5 space-y-0.5">
                        {p.inside.map((c) => (
                          <li key={c.id}>
                            <Link href={`/maintenance/${c.id}`} className="text-blue-700 hover:underline">{c.name}</Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link href={`/maintenance/${p.id}`} className="rounded-lg bg-blue-700 px-2.5 py-1 text-xs font-medium text-white">
                      Open
                    </Link>
                    <button
                      type="button"
                      onClick={() => { setMode({ kind: 'move', id: p.id, name: p.name }); setOpen(null) }}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-xs"
                    >
                      <Move className="h-3 w-3" /> Move
                    </button>
                    <form action="/maintenance/map/place" method="post">
                      <input type="hidden" name="asset_id" value={p.id} />
                      <input type="hidden" name="clear" value="1" />
                      <button type="submit" className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-xs">
                        <X className="h-3 w-3" /> Unpin
                      </button>
                    </form>
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {spot && (
          <div
            className="absolute z-20"
            style={{ left: `${spot.x}%`, top: `${spot.y}%`, transform: `translate(${spot.x > 60 ? '-100%' : '0'}, ${spot.y > 60 ? '-100%' : '0'})` }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-600 ring-2 ring-white" />
            <form action="/maintenance/map/place" method="post" className="mt-1 w-64 rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-lg">
              <input type="hidden" name="x" value={spot.x} />
              <input type="hidden" name="y" value={spot.y} />
              {mode.kind === 'move' ? (
                <>
                  <input type="hidden" name="asset_id" value={mode.id} />
                  <div className="mb-2">Move <b>{mode.name}</b> here?</div>
                </>
              ) : (
                <>
                  <input name="name" autoFocus placeholder="Name: e.g. Chicken coop" className="w-full rounded-lg border border-slate-200 px-2 py-1.5" />
                  {unplaced.length > 0 && (
                    <select name="asset_id" defaultValue="" className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5">
                      <option value="">…or pin something already listed</option>
                      {unplaced.map((u) => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                    </select>
                  )}
                </>
              )}
              <div className="mt-2 flex gap-2">
                <button type="submit" className="rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-medium text-white">Save</button>
                <button type="button" onClick={() => setSpot(null)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs">Cancel</button>
              </div>
            </form>
          </div>
        )}
      </div>

      {unplaced.length > 0 && (
        <p className="mt-3 text-xs text-slate-500">
          Not on the map yet: {unplaced.map((u) => u.name).join(', ')}. Use “Label a building” and pick one from the list.
        </p>
      )}
    </div>
  )
}
