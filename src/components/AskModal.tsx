import { useCallback, useRef, useState } from 'react'
import type { AskField } from '../config/types'
import type { Row } from '../lib/refs'
import FieldInput from './FieldInput'
import { Field, Modal } from './ui'

/** const { ask, modal } = useAsk();  const v = await ask('เลือกคลัง', [...]) */
export function useAsk() {
  const [state, setState] = useState<{ title: string; fields: AskField[]; values: Row } | null>(null)
  const resolver = useRef<(v: Row | null) => void>(() => {})

  const ask = useCallback((title: string, fields: AskField[], initial: Row = {}) => {
    const values: Row = { ...initial }
    for (const f of fields) if (values[f.key] === undefined && f.default !== undefined) values[f.key] = typeof f.default === 'function' ? (f.default as (h: Row) => unknown)(values) : f.default
    setState({ title, fields, values })
    return new Promise<Row | null>((res) => { resolver.current = res })
  }, [])

  const close = (v: Row | null) => { resolver.current(v); setState(null) }
  const missing = state?.fields.some((f) => f.required && (state.values[f.key] == null || state.values[f.key] === ''))

  const modal = (
    <Modal open={!!state} title={state?.title ?? ''} onClose={() => close(null)}>
      {state && (
        <form onSubmit={(e) => { e.preventDefault(); if (!missing) close(state.values) }} className="space-y-3">
          {state.fields.map((f) => (
            <Field key={f.key} label={f.label + (f.required ? ' *' : '')}>
              <FieldInput f={f} value={state.values[f.key]} header={state.values}
                onChange={(v) => setState((s) => s && { ...s, values: { ...s.values, [f.key]: v } })} />
            </Field>
          ))}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary" onClick={() => close(null)}>ยกเลิก</button>
            <button type="submit" className="btn-primary" disabled={missing}>ตกลง</button>
          </div>
        </form>
      )}
    </Modal>
  )
  return { ask, modal }
}
