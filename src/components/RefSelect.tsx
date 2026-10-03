import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { REFS, useRefData, type Row } from '../lib/refs'

interface Props {
  refName: string
  value: unknown
  onChange: (value: number | null, row: Row | null) => void
  filter?: Record<string, unknown>
  disabled?: boolean
  placeholder?: string
  className?: string
  /** client-side extra filter, e.g. by item type */
  where?: (r: Row) => boolean
}

/** Searchable dropdown for foreign keys (type to search code / name). */
export default function RefSelect({ refName, value, onChange, filter, disabled, placeholder, className = '', where }: Props) {
  const def = REFS[refName]
  const vk = def.valueKey ?? 'id'
  const all = useRefData(refName, filter, !disabled || value != null)
  const rows = useMemo(() => (where ? all.filter(where) : all), [all, where])
  const selected = rows.find((r) => String(r[vk]) === String(value)) ?? all.find((r) => String(r[vk]) === String(value))
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [hi, setHi] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const [pos, setPos] = useState({ left: 0, top: 0, width: 0 })

  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    const f = s ? rows.filter((r) => def.label(r).toLowerCase().includes(s)) : rows
    return f.slice(0, 80)
  }, [rows, q, def])

  useEffect(() => { setHi(0) }, [q, open])

  function place() {
    const r = inputRef.current?.getBoundingClientRect()
    if (r) setPos({ left: r.left, top: r.bottom + 2, width: Math.max(r.width, 280) })
  }
  function openList() {
    if (disabled) return
    place(); setQ(''); setOpen(true)
  }
  function pick(r: Row | null) {
    onChange(r ? Number(r[vk]) : null, r)
    setOpen(false)
    inputRef.current?.blur()
  }

  useEffect(() => {
    if (!open) return
    const h = () => place()
    window.addEventListener('scroll', h, true)
    window.addEventListener('resize', h)
    return () => { window.removeEventListener('scroll', h, true); window.removeEventListener('resize', h) }
  }, [open])

  return (
    <>
      <input
        ref={inputRef}
        className={`input ${className}`}
        disabled={disabled}
        placeholder={placeholder ?? 'พิมพ์ค้นหา…'}
        value={open ? q : selected ? def.label(selected) : ''}
        onFocus={openList}
        onChange={(e) => { setQ(e.target.value); if (!open) openList() }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, list.length - 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)) }
          else if (e.key === 'Enter') { e.preventDefault(); if (list[hi]) pick(list[hi]) }
          else if (e.key === 'Escape') setOpen(false)
        }}
        title={selected ? def.label(selected) : ''}
      />
      {open && createPortal(
        <div className="fixed z-[200] max-h-72 overflow-auto rounded-md border border-slate-200 bg-white py-1 text-sm shadow-lg"
          style={{ left: pos.left, top: pos.top, width: pos.width }}>
          {value != null && (
            <button type="button" className="block w-full px-3 py-1.5 text-left text-slate-400 hover:bg-slate-50"
              onMouseDown={(e) => { e.preventDefault(); pick(null) }}>— ล้างค่า —</button>
          )}
          {list.length === 0 && <div className="px-3 py-2 text-slate-400">ไม่พบข้อมูล</div>}
          {list.map((r, i) => (
            <button type="button" key={String(r[vk])}
              className={`block w-full px-3 py-1.5 text-left ${i === hi ? 'bg-brand-50 text-brand-800' : 'hover:bg-slate-50'}`}
              onMouseEnter={() => setHi(i)}
              onMouseDown={(e) => { e.preventDefault(); pick(r) }}>
              <div className="truncate">{def.label(r)}</div>
              {def.sub && <div className="truncate text-xs text-slate-400">{def.sub(r)}</div>}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  )
}

/** Read-only label of a ref value (for lists / print). */
export function RefLabel({ refName, value }: { refName: string; value: unknown }) {
  const rows = useRefData(refName, undefined, value != null)
  const def = REFS[refName]
  const r = rows.find((x) => String(x[def.valueKey ?? 'id']) === String(value))
  return <>{r ? def.label(r) : ''}</>
}
