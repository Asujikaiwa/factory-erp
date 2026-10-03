import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { MASTERS } from '../config/masters'
import { useAuth } from '../lib/auth'
import { money, qty } from '../lib/format'
import { invalidateRefs, type Row } from '../lib/refs'
import { check, supabase } from '../lib/supabase'
import FieldInput, { defaultsFor } from './FieldInput'
import { RefLabel } from './RefSelect'
import { Empty, Field, Modal, PageHeader, Spinner, confirmBox, useRunner } from './ui'

export default function MasterPage({ masterKey }: { masterKey?: string }) {
  const params = useParams()
  const cfg = MASTERS[masterKey ?? params.masterKey ?? '']
  const { can } = useAuth()
  const { busy, run } = useRunner()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [q, setQ] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [edit, setEdit] = useState<Row | null>(null)

  const load = useCallback(async () => {
    if (!cfg) return
    setRows(null)
    const { data } = await supabase.from(cfg.table).select('*').order(cfg.order).limit(5000)
    setRows((data ?? []) as Row[])
  }, [cfg])
  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return (rows ?? []).filter((r) => (showInactive || r.active !== false) &&
      (!s || cfg.search.some((k) => String(r[k] ?? '').toLowerCase().includes(s))))
  }, [rows, q, showInactive, cfg])

  if (!cfg) return <Empty text="ไม่พบหน้านี้" />
  const writable = can(...cfg.write)
  const fieldOf = (k: string) => cfg.fields.find((f) => f.key === k)!

  async function save() {
    const r = edit!
    for (const f of cfg.fields) if (f.required && (r[f.key] == null || r[f.key] === '')) throw new Error(`กรุณากรอก "${f.label}"`)
    const payload: Row = {}
    for (const f of cfg.fields) payload[f.key] = r[f.key] === '' ? null : r[f.key] ?? null
    if (r.id) check(await supabase.from(cfg.table).update(payload).eq('id', r.id))
    else check(await supabase.from(cfg.table).insert(payload))
    invalidateRefs()
    setEdit(null)
    await load()
  }
  async function remove() {
    const r = edit!
    const { error } = await supabase.from(cfg.table).delete().eq('id', r.id)
    if (error) {
      if (error.code === '23503' && 'active' in r) {
        check(await supabase.from(cfg.table).update({ active: false }).eq('id', r.id))
        throw new Error('ข้อมูลนี้ถูกใช้ในเอกสารแล้ว จึงเปลี่ยนเป็น "ไม่ใช้งาน" แทนการลบ')
      }
      throw new Error(error.message)
    }
    invalidateRefs(); setEdit(null); await load()
  }

  return (
    <div>
      <PageHeader title={cfg.title} sub={cfg.help}>
        {writable && <button className="btn-primary" onClick={() => setEdit(defaultsFor(cfg.fields))}>+ เพิ่มใหม่</button>}
      </PageHeader>
      <div className="card mb-3 flex flex-wrap items-center gap-3 p-3">
        {cfg.search.length > 0 && <input className="input w-64" placeholder="ค้นหา…" value={q} onChange={(e) => setQ(e.target.value)} />}
        {cfg.fields.some((f) => f.key === 'active') && (
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" className="accent-brand-700" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> แสดงที่ไม่ใช้งาน
          </label>
        )}
        <span className="ml-auto text-sm text-slate-500">{filtered.length} รายการ</span>
      </div>
      <div className="card overflow-auto">
        {rows === null ? <Spinner /> : filtered.length === 0 ? <Empty /> : (
          <table className="tbl">
            <thead><tr>{cfg.list.map((k) => <th key={k} className={['money', 'number'].includes(fieldOf(k).type) ? 'num' : ''}>{fieldOf(k).label}</th>)}</tr></thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="cursor-pointer" onClick={() => setEdit({ ...r })}>
                  {cfg.list.map((k) => {
                    const f = fieldOf(k), v = r[k]
                    return (
                      <td key={k} className={['money', 'number'].includes(f.type) ? 'num' : ''}>
                        {f.type === 'ref' ? <RefLabel refName={f.ref!} value={v} />
                          : f.type === 'select' ? f.options?.find((o) => o.value === v)?.label
                          : f.type === 'checkbox' ? (v ? '✓' : '—')
                          : f.type === 'money' ? money(v) : f.type === 'number' ? qty(v) : v}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={!!edit} title={edit?.id ? `แก้ไข${cfg.title}` : `เพิ่ม${cfg.title}`} onClose={() => setEdit(null)} wide>
        {edit && (
          <form onSubmit={(e) => { e.preventDefault(); run(save, 'บันทึกแล้ว') }}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {cfg.fields.map((f) => (
                <Field key={f.key} label={f.label + (f.required ? ' *' : '')} className={f.span === 2 ? 'sm:col-span-2' : ''}>
                  {f.type === 'checkbox'
                    ? <div className="py-1.5"><FieldInput f={f} value={edit[f.key]} header={edit} disabled={!writable} onChange={(v) => setEdit({ ...edit, [f.key]: v })} /></div>
                    : <FieldInput f={f} value={edit[f.key]} header={edit} disabled={!writable} onChange={(v) => setEdit({ ...edit, [f.key]: v })} />}
                </Field>
              ))}
            </div>
            <div className="mt-5 flex justify-between gap-2">
              <div>{writable && edit.id && <button type="button" className="btn-ghost text-rose-600" disabled={busy}
                onClick={() => confirmBox('ลบข้อมูลนี้?') && run(remove, 'ลบแล้ว')}>ลบ</button>}</div>
              <div className="flex gap-2">
                <button type="button" className="btn-secondary" onClick={() => setEdit(null)}>ปิด</button>
                {writable && <button type="submit" className="btn-primary" disabled={busy}>บันทึก</button>}
              </div>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
