import type { FieldDef } from '../config/types'
import type { Row } from '../lib/refs'
import { money, qty } from '../lib/format'
import RefSelect from './RefSelect'

interface Props {
  f: FieldDef
  value: unknown
  onChange: (v: unknown, row?: Row | null) => void
  header: Row
  disabled?: boolean
  compact?: boolean
}

export default function FieldInput({ f, value, onChange, header, disabled, compact }: Props) {
  const dis = disabled || f.readOnly
  const cls = compact ? 'py-1 text-sm' : ''
  switch (f.type) {
    case 'ref':
      return (
        <RefSelect refName={f.ref!} value={value} disabled={dis} className={cls}
          filter={f.refFilter?.(header)} where={f.refWhere ? (r) => f.refWhere!(r, header) : undefined}
          onChange={(v, row) => onChange(v, row)} />
      )
    case 'select':
      return (
        <select className={`input ${cls}`} disabled={dis} value={value == null ? '' : String(value)}
          onChange={(e) => onChange(e.target.value || null)}>
          {!f.required && <option value="">—</option>}
          {f.options!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )
    case 'checkbox':
      return (
        <input type="checkbox" className="h-4 w-4 accent-brand-700" disabled={dis}
          checked={!!value} onChange={(e) => onChange(e.target.checked)} />
      )
    case 'textarea':
      return <textarea className={`input ${cls}`} rows={2} disabled={dis} value={(value as string) ?? ''}
        onChange={(e) => onChange(e.target.value)} />
    case 'number':
    case 'money':
      if (dis) return <input className={`input text-right tabular-nums ${cls}`} disabled value={value == null || value === '' ? '' : f.type === 'money' ? money(value) : qty(value)} />
      return (
        <input type="number" step="any" className={`input text-right tabular-nums ${cls}`} disabled={dis}
          value={value == null ? '' : String(value)}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
          onFocus={(e) => e.target.select()} />
      )
    case 'date':
      return <input type="date" className={`input ${cls}`} disabled={dis} value={(value as string) ?? ''}
        onChange={(e) => onChange(e.target.value || null)} />
    case 'time':
      return <input type="time" className={`input ${cls}`} disabled={dis} value={((value as string) ?? '').slice(0, 5)}
        onChange={(e) => onChange(e.target.value || null)} />
    default:
      return <input className={`input ${cls}`} disabled={dis} value={(value as string) ?? ''}
        onChange={(e) => onChange(e.target.value)} />
  }
}

export function defaultsFor(fields: FieldDef[], header: Row = {}): Row {
  const o: Row = {}
  for (const f of fields) {
    if (f.default === undefined) continue
    o[f.key] = typeof f.default === 'function' ? (f.default as (h: Row) => unknown)(header) : f.default
  }
  return o
}
