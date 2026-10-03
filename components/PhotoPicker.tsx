'use client'

// A Property's photos on the Add and Edit forms — one component so the two
// cannot drift apart.
//
// Choosing photos adds to the ones already chosen; it never replaces them.
// The order shown is the order saved, and the first photo is the cover:
// ◀ ▶ on each photo move it (by touch or keyboard), and on a desktop a photo
// can be dragged onto another's place.
//
// The form posts the <input>'s own FileList, so that list is rebuilt to match
// what is shown — new photos only, in their shown order — after every change.
// On Edit, stored photos sit in the same list: removing one marks it (undo
// puts it back) and posts `removed_images`; the full order posts as
// `image_order`, which the action checks against the row (orderImages).

import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ImageOff, ImagePlus, Undo2, X } from 'lucide-react'
import {
  ACCEPTED_IMAGE_TYPES,
  mb,
  validatePropertyImageEdit,
} from '@/lib/property-input'
import type { PropertyImage } from '@/lib/property-storage'
import { PhotoLightbox, type PhotoPreview } from './PhotoLightbox'
import { BUTTON } from './styles'

type Item =
  | { key: string; kind: 'stored'; path: string; url: string | null; removed: boolean }
  | { key: string; kind: 'new'; file: File; url: string }

const fromStored = (photos: PropertyImage[]): Item[] =>
  photos.map((p) => ({ key: p.path, kind: 'stored', path: p.path, url: p.url, removed: false }))

const sameFile = (a: File, b: File) => a.name === b.name && a.size === b.size && a.lastModified === b.lastModified

export function PhotoPicker({
  stored = [],
  pending,
  onValidChange,
}: {
  /** The Property's photos already in Storage, signed for this render. Edit only. */
  stored?: PropertyImage[]
  pending: boolean
  /** Whether the chosen set may be saved — the form disables Save when not. */
  onValidChange: (ok: boolean) => void
}) {
  const [items, setItems] = useState<Item[]>(() => fromStored(stored))
  const [preview, setPreview] = useState<PhotoPreview | null>(null)
  const [dragging, setDragging] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const editing = stored.length > 0

  const newFiles = items.flatMap((i) => (i.kind === 'new' ? [i.file] : []))
  const kept = items.filter((i) => i.kind === 'stored' && !i.removed).length
  const check = validatePropertyImageEdit(kept, newFiles)

  // The input posts what is shown: rebuilt after every change.
  useEffect(() => {
    if (!inputRef.current) return
    const transfer = new DataTransfer()
    newFiles.forEach((f) => transfer.items.add(f))
    inputRef.current.files = transfer.files
  })

  useEffect(() => onValidChange(check.ok), [check.ok, onValidChange])

  // Object URLs go when the picker does.
  const urls = useRef(new Set<string>())
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), [])

  function add(chosen: FileList | null) {
    const picked = Array.from(chosen ?? [])
    setItems((was) => {
      const have = was.flatMap((i) => (i.kind === 'new' ? [i.file] : []))
      const fresh = picked.filter((f) => !have.some((h) => sameFile(h, f)))
      return [
        ...was,
        ...fresh.map((file) => {
          const url = URL.createObjectURL(file)
          urls.current.add(url)
          return { key: url, kind: 'new' as const, file, url }
        }),
      ]
    })
  }

  function remove(index: number) {
    setItems((was) => {
      const item = was[index]
      if (item.kind === 'stored') return was.map((i, k) => (k === index ? { ...item, removed: !item.removed } : i))
      URL.revokeObjectURL(item.url)
      urls.current.delete(item.url)
      return was.filter((_, k) => k !== index)
    })
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= items.length || from === to) return
    setItems((was) => {
      const next = [...was]
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item)
      return next
    })
  }

  function removeAllNew() {
    setItems((was) =>
      was.filter((i) => {
        if (i.kind === 'new') URL.revokeObjectURL(i.url)
        return i.kind === 'stored'
      }),
    )
  }

  const cover = items.findIndex((i) => i.kind === 'new' || !i.removed)
  const newBytes = newFiles.reduce((sum, f) => sum + f.size, 0)
  let newIndex = 0

  return (
    <div className="flex flex-col gap-3">
      {items.length > 0 && (
        <ul className="flex flex-wrap gap-3">
          {items.map((item, index) => {
            const removed = item.kind === 'stored' && item.removed
            const label = `photo ${index + 1}`
            return (
              <li
                key={item.key}
                draggable={!pending}
                onDragStart={() => setDragging(index)}
                onDragEnd={() => setDragging(null)}
                onDragOver={(e) => dragging !== null && e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  if (dragging !== null) move(dragging, index)
                  setDragging(null)
                }}
                className={`relative flex flex-col items-center gap-1 ${dragging === index ? 'opacity-40' : ''}`}
              >
                {item.url ? (
                  // A link, not a button: a disabled <fieldset> (the record's View
                  // mode) switches off its buttons but not its links, and a
                  // photo should still open there.
                  <a
                    href={item.url}
                    draggable={false}
                    onClick={(e) => {
                      e.preventDefault()
                      setPreview({ src: item.url as string, alt: `Photo ${index + 1}` })
                    }}
                    className="block cursor-zoom-in"
                  >
                    {/* Object URLs and signed Storage URLs, never through
                        next/image: one has no host to optimise, the other
                        expires and the bucket is private. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.url}
                      alt={`Photo ${index + 1}`}
                      className={
                        'h-24 w-24 rounded-lg border object-cover transition-opacity ' +
                        (removed ? 'border-warn/60 opacity-30' : 'border-border')
                      }
                    />
                  </a>
                ) : (
                  <span
                    className={
                      'grid h-24 w-24 place-items-center rounded-lg border border-dashed text-muted ' +
                      (removed ? 'border-warn/60 opacity-30' : 'border-border')
                    }
                  >
                    <ImageOff size={20} aria-hidden />
                  </span>
                )}

                {index === cover && (
                  <span className="absolute top-1 left-1 rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-medium text-on-accent">
                    Cover
                  </span>
                )}
                {removed && (
                  <span className="absolute inset-x-0 top-[4.75rem] rounded-b-lg bg-warn/90 py-0.5 text-center text-[11px] text-bg">
                    Will be deleted
                  </span>
                )}

                <button
                  type="button"
                  disabled={pending}
                  aria-label={removed ? `Keep ${label}` : `Remove ${label}`}
                  onClick={() => remove(index)}
                  className={
                    'absolute -top-1.5 -right-1.5 grid h-6 w-6 place-items-center rounded-full border border-border bg-surface text-muted transition-colors disabled:opacity-60 ' +
                    (removed ? 'hover:text-ink' : 'hover:border-warn hover:text-warn')
                  }
                >
                  {removed ? <Undo2 size={13} aria-hidden /> : <X size={13} aria-hidden />}
                </button>

                <span className="flex gap-1">
                  <button
                    type="button"
                    disabled={pending || index === 0}
                    aria-label={`Move ${label} earlier`}
                    onClick={() => move(index, index - 1)}
                    className="grid h-6 w-6 place-items-center rounded border border-border text-muted transition-colors hover:text-ink disabled:opacity-30"
                  >
                    <ChevronLeft size={14} aria-hidden />
                  </button>
                  <button
                    type="button"
                    disabled={pending || index === items.length - 1}
                    aria-label={`Move ${label} later`}
                    onClick={() => move(index, index + 1)}
                    className="grid h-6 w-6 place-items-center rounded border border-border text-muted transition-colors hover:text-ink disabled:opacity-30"
                  >
                    <ChevronRight size={14} aria-hidden />
                  </button>
                </span>

                {/* The order and the removals, for the action to check. */}
                {editing && !removed && (
                  <input
                    type="hidden"
                    name="image_order"
                    value={item.kind === 'stored' ? `path:${item.path}` : `new:${newIndex++}`}
                  />
                )}
                {removed && <input type="hidden" name="removed_images" value={item.path} />}
              </li>
            )
          })}
        </ul>
      )}

      {items.some((i) => i.kind === 'stored' && i.removed) && (
        <p className="text-sm text-muted">
          The marked photos are deleted when you save — press the undo button on a photo to keep it.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <label className={`${BUTTON} inline-flex w-fit cursor-pointer items-center gap-2`}>
          <ImagePlus size={16} aria-hidden />
          {items.length > 0 ? 'Add photos' : 'Choose photos'}
          <input
            ref={inputRef}
            type="file"
            name="images"
            multiple
            accept={ACCEPTED_IMAGE_TYPES.join(',')}
            disabled={pending}
            className="sr-only"
            onChange={(event) => add(event.target.files)}
          />
        </label>

        {newFiles.length > 0 && (
          <span className="flex items-center gap-3 text-sm text-muted">
            <span className="tabular">
              {newFiles.length} new {newFiles.length === 1 ? 'photo' : 'photos'} · {mb(newBytes)} MB
            </span>
            <button
              type="button"
              disabled={pending}
              onClick={removeAllNew}
              className="inline-flex items-center gap-1 transition-colors hover:text-ink"
            >
              <X size={14} aria-hidden />
              Remove all new photos
            </button>
          </span>
        )}
      </div>

      {!check.ok && (
        <p role="status" className="text-sm text-warn">
          {check.message}
        </p>
      )}

      <PhotoLightbox photo={preview} onClose={() => setPreview(null)} />
    </div>
  )
}
