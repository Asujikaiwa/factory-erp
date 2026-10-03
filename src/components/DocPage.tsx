import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { DOCS } from '../config/docs'
import type { DocConfig, FieldDef } from '../config/types'
import { useAuth } from '../lib/auth'
import { addDays, dateTH, money, num, qty, round2, today } from '../lib/format'
import { invalidateRefs, type Row } from '../lib/refs'
import { useSettings, vatSplit } from '../lib/settings'
import { check, supabase } from '../lib/supabase'
import { useAsk } from './AskModal'
import FieldInput, { defaultsFor } from './FieldInput'
import { RefLabel } from './RefSelect'
import { Badge, Empty, Field, PageHeader, Spinner, confirmBox, useRunner } from './ui'

/* =====================================================================
   Totals
   ===================================================================== */
export function lineAmount(l: Row) {
  if (l.qty == null && l.unit_price == null) return num(l.amount)
  return round2(num(l.qty) * num(l.unit_price) * (1 - num(l.discount_pct) / 100))
}
export function payrollNet(l: Row) {
  return round2(num(l.base_pay) + num(l.ot_pay) + num(l.allowance) - num(l.deduction) - num(l.sso_employee) - num(l.wht))
}
function computeTotals(cfg: DocConfig, header: Row, lines: Row[], vatRate: number): Row {
  if (cfg.totals === 'vat') {
    const sum = lines.reduce((s, l) => s + lineAmount(l), 0)
    const v = vatSplit(sum, header.vat_type ?? 'none', vatRate)
    return { subtotal: v.subtotal, vat_amount: v.vat, total: v.total }
  }
  if (cfg.totals === 'sum') return { total: round2(lines.reduce((s, l) => s + num(l[cfg.sumKey ?? 'amount']), 0)) }
  if (cfg.totals === 'payroll') {
    return {
      total_gross: round2(lines.reduce((s, l) => s + num(l.base_pay) + num(l.ot_pay) + num(l.allowance), 0)),
      total_net: round2(lines.reduce((s, l) => s + payrollNet(l), 0)),
    }
  }
  return {}
}

/* =====================================================================
   List
   ===================================================================== */
export function DocList() {
  const { docKey = '' } = useParams()
  const cfg = DOCS[docKey]
  const nav = useNavigate()
  const { can } = useAuth()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [from, setFrom] = useState(cfg?.statusless ? '' : addDays(today(), -90))
  const [to, setTo] = useState('')

  const load = useCallback(async () => {
    if (!cfg) return
    setRows(null)
    let query = supabase.from(cfg.table).select(cfg.listSelect ?? '*').limit(500)
    if (!cfg.statusless) {
      query = query.order('doc_date', { ascending: false }).order('id', { ascending: false })
      if (from) query = query.gte('doc_date', from)
      if (to) query = query.lte('doc_date', to)
      if (status) query = query.eq('status', status)
      if (q) query = query.ilike('doc_no', `%${q}%`)
    } else {
      query = query.order('id', { ascending: false })
      if (q) query = query.ilike('name', `%${q}%`)
    }
    for (const [k, v] of Object.entries(cfg.listFilter ?? {})) query = query.eq(k, v as never)
    const { data, error } = await query
    setRows(error ? [] : ((data ?? []) as unknown as Row[]))
  }, [cfg, from, to, status, q])

  useEffect(() => { load() }, [load])
  if (!cfg) return <Empty text="ไม่พบหน้านี้" />

  const totalKey = cfg.list.find((c) => c.type === 'money')?.key

  return (
    <div>
      <PageHeader title={cfg.title} sub={cfg.help}>
        {can(...cfg.write) && <Link to={`/d/${cfg.key}/new`} className="btn-primary">+ สร้าง{cfg.short}</Link>}
      </PageHeader>
      <div className="card mb-3 flex flex-wrap items-end gap-3 p-3 no-print">
        <Field label={cfg.statusless ? 'ค้นหาชื่อ' : 'ค้นหาเลขที่เอกสาร'}><input className="input w-48" value={q} onChange={(e) => setQ(e.target.value)} /></Field>
        {!cfg.statusless && <>
          <Field label="สถานะ">
            <select className="input w-36" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">ทั้งหมด</option>
              <option value="draft">ร่าง</option>
              {cfg.approve && <option value="approved">อนุมัติ</option>}
              {cfg.post && <option value="posted">บันทึกแล้ว</option>}
              {cfg.approve && <option value="closed">ปิดแล้ว</option>}
              <option value={cfg.post ? 'void' : 'cancelled'}>ยกเลิก</option>
            </select>
          </Field>
          <Field label="ตั้งแต่วันที่"><input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="ถึงวันที่"><input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        </>}
      </div>
      <div className="card overflow-auto">
        {rows === null ? <Spinner /> : rows.length === 0 ? <Empty /> : (
          <table className="tbl">
            <thead><tr>
              {cfg.list.map((c) => <th key={c.key} className={c.type === 'money' ? 'num' : ''}>{c.label}</th>)}
              {!cfg.statusless && <th>สถานะ</th>}
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="cursor-pointer" onClick={() => nav(`/d/${cfg.key}/${r.id}`)}>
                  {cfg.list.map((c) => (
                    <td key={c.key} className={c.type === 'money' ? 'num' : ''}>
                      {c.type === 'money' ? money(r[c.key])
                        : c.type === 'date' ? dateTH(r[c.key])
                        : c.type === 'ref' ? <RefLabel refName={c.ref!} value={r[c.key]} />
                        : c.type === 'select' ? c.options?.find((o) => o.value === String(r[c.key]))?.label ?? r[c.key]
                        : typeof r[c.key] === 'boolean' ? (r[c.key] ? '✓' : '') : r[c.key]}
                    </td>
                  ))}
                  {!cfg.statusless && <td><Badge status={r.status} /></td>}
                </tr>
              ))}
            </tbody>
            {totalKey && (
              <tfoot><tr>
                {cfg.list.map((c, i) => (
                  <td key={c.key} className={`border-t-2 border-slate-200 px-2 py-2 font-semibold ${c.type === 'money' ? 'num' : ''}`}>
                    {i === 0 ? `รวม ${rows.length} รายการ` : c.key === totalKey ? money(rows.filter((r) => r.status !== 'void' && r.status !== 'cancelled').reduce((s, r) => s + num(r[c.key]), 0)) : ''}
                  </td>
                ))}
                {!cfg.statusless && <td className="border-t-2 border-slate-200" />}
              </tr></tfoot>
            )}
          </table>
        )}
      </div>
    </div>
  )
}

/* =====================================================================
   Editor
   ===================================================================== */
const SYSTEM_KEYS = new Set(['id', 'doc_no', 'status', 'created_by', 'created_at', 'updated_at', 'posted_at'])

export function DocEditor() {
  const { docKey = '', id = 'new' } = useParams()
  const cfg = DOCS[docKey]
  const nav = useNavigate()
  const { can } = useAuth()
  const settings = useSettings()
  const { busy, run } = useRunner()
  const { ask, modal } = useAsk()
  const [header, setHeader] = useState<Row | null>(null)
  const [lines, setLines] = useState<Row[]>([])
  const [dirty, setDirty] = useState(false)
  const isNew = id === 'new'

  const load = useCallback(async () => {
    if (!cfg) return
    if (isNew) {
      const h = { ...(cfg.statusless ? {} : { status: 'draft', doc_date: today() }), ...defaultsFor(cfg.header) }
      setHeader(h); setLines([]); setDirty(false)
      return
    }
    const h = check(await supabase.from(cfg.table).select('*').eq('id', id).maybeSingle()) as Row | null
    if (!h) { setHeader({ __missing: true }); return }
    const ls = check(await supabase.from(cfg.linesTable).select('*').eq(cfg.fk, id).order('id')) as Row[]
    setHeader(h); setLines(ls); setDirty(false)
  }, [cfg, id, isNew])

  useEffect(() => { load().catch(() => setHeader({ __missing: true })) }, [load])

  const totals = useMemo(() => (header && cfg ? computeTotals(cfg, header, lines, num(settings.vat_rate)) : {}), [cfg, header, lines, settings.vat_rate])

  if (!cfg) return <Empty text="ไม่พบหน้านี้" />
  if (!header) return <Spinner />
  if (header.__missing) return <Empty text="ไม่พบเอกสาร หรือคุณไม่มีสิทธิ์เข้าถึง" />

  const canWrite = can(...cfg.write)
  const editable = canWrite && (cfg.statusless || header.status === 'draft') && (cfg.editable?.(header) ?? true)
  const visible = (f: FieldDef) => !f.show || f.show(header)

  async function setH(key: string, v: unknown, row?: Row | null) {
    let next = { ...header!, [key]: v }
    const extra = await cfg.onHeaderChange?.(next, key, row)
    if (extra) next = { ...next, ...extra }
    setHeader(next); setDirty(true)
  }
  async function setL(i: number, key: string, v: unknown) {
    const cur = { ...lines[i], [key]: v }
    const extra = await cfg.onLineChange?.(cur, key, header!)
    setLines((ls) => ls.map((l, j) => (j === i ? { ...cur, ...(extra || {}) } : l)))
    setDirty(true)
  }
  function addLine() {
    setLines((ls) => [...ls, defaultsFor(cfg.lines, header!)]); setDirty(true)
  }
  function removeLine(i: number) {
    setLines((ls) => ls.filter((_, j) => j !== i)); setDirty(true)
  }

  /** validates + saves; returns saved id */
  async function save(): Promise<number> {
    const h = header!
    for (const f of cfg.header) {
      if (f.required && visible(f) && (h[f.key] == null || h[f.key] === '')) throw new Error(`กรุณากรอก "${f.label}"`)
    }
    for (const [i, l] of lines.entries()) {
      for (const f of cfg.lines) {
        if (f.required && !f.compute && (l[f.key] == null || l[f.key] === '')) throw new Error(`รายการที่ ${i + 1}: กรุณากรอก "${f.label}"`)
      }
    }
    const payload: Row = {}
    for (const f of cfg.header) if (!f.readOnly && !SYSTEM_KEYS.has(f.key)) payload[f.key] = h[f.key] === '' ? null : h[f.key] ?? null
    Object.assign(payload, totals)
    let docId = Number(h.id)
    if (isNew) {
      const ins = check(await supabase.from(cfg.table).insert(payload).select('id').single()) as Row
      docId = ins.id
    } else {
      check(await supabase.from(cfg.table).update(payload).eq('id', docId))
    }
    // lines: replace all
    check(await supabase.from(cfg.linesTable).delete().eq(cfg.fk, docId))
    if (lines.length) {
      const keys = [...cfg.lines.filter((f) => !f.compute || f.key === 'amount').map((f) => f.key), ...(cfg.keepLineKeys ?? [])]
      const rows = lines.map((l) => {
        const o: Row = { [cfg.fk]: docId }
        for (const k of keys) o[k] = l[k] === '' ? null : l[k] ?? null
        if (cfg.totals === 'vat' && 'unit_price' in o) o.amount = lineAmount(l)
        if (cfg.totals === 'payroll') o.net_pay = payrollNet(l)
        return o
      })
      check(await supabase.from(cfg.linesTable).insert(rows))
    }
    if (cfg.statusless) invalidateRefs()
    setDirty(false)
    return docId
  }

  async function doSave() {
    let newId = 0
    const ok = await run(async () => { newId = await save() }, 'บันทึกร่างแล้ว')
    if (ok) {
      if (isNew) nav(`/d/${cfg.key}/${newId}`, { replace: true })
      else await load()
    }
  }

  async function withSave<T>(fn: (docId: number) => Promise<T>, okText?: string) {
    return run(async () => {
      let docId = Number(header!.id)
      if (editable && (dirty || isNew)) docId = await save()
      await fn(docId)
      if (isNew) nav(`/d/${cfg.key}/${docId}`, { replace: true })
    }, okText).then(async (ok) => { if (ok && !isNew) await load(); return ok })
  }

  const setStatus = (s: string, text: string) => withSave(async (docId) => {
    check(await supabase.from(cfg.table).update({ status: s }).eq('id', docId))
  }, text)

  const ctx = { navigate: nav, reload: load, ask, setLines: (fn: (l: Row[]) => Row[]) => { setLines(fn); setDirty(true) }, header }
  const lineCols = cfg.lines

  return (
    <div>
      {modal}
      <PageHeader title={`${cfg.short} ${header.doc_no ?? (cfg.statusless ? header.name ?? '' : '(ใหม่)')}`}
        sub={cfg.title}>
        <Link to={`/d/${cfg.key}`} className="btn-ghost">← กลับ</Link>
        {!cfg.statusless && <Badge status={header.status} />}
        {editable && <button className="btn-secondary" disabled={busy} onClick={doSave}>💾 บันทึก{cfg.statusless ? '' : 'ร่าง'}</button>}
        {cfg.approve && header.status === 'draft' && canWrite && !isNew && (
          <button className="btn-primary" disabled={busy} onClick={() => setStatus('approved', 'อนุมัติแล้ว')}>✓ อนุมัติ</button>
        )}
        {cfg.approve && ['draft', 'approved'].includes(header.status) && canWrite && !isNew && (
          <button className="btn-ghost text-rose-600" disabled={busy}
            onClick={() => confirmBox('ยืนยันยกเลิกเอกสารนี้?') && setStatus('cancelled', 'ยกเลิกเอกสารแล้ว')}>ยกเลิกเอกสาร</button>
        )}
        {cfg.actions?.filter((a) => a.show(header) && (!a.roles || can(...a.roles))).map((a) => (
          <button key={a.label} disabled={busy}
            className={a.variant === 'primary' ? 'btn-primary' : a.variant === 'danger' ? 'btn-danger' : 'btn-secondary'}
            onClick={() => {
              if (a.confirm && !confirmBox(a.confirm)) return
              const exec = async (docId: number) => {
                const r = await a.run({ ...header, id: docId }, ctx)
                if (typeof r === 'string' && r.startsWith('/')) nav(r)
              }
              if (a.saveFirst === false) run(() => exec(Number(header.id)))
              else withSave(exec)
            }}>{a.label}</button>
        ))}
        {cfg.post && header.status === 'draft' && can(...(cfg.post.roles ?? cfg.write)) && (cfg.editable?.(header) ?? true) && (
          <button className="btn-primary" disabled={busy}
            onClick={() => confirmBox(cfg.post!.confirm ?? `ยืนยัน${cfg.post!.label}? หลังบันทึกจะแก้ไขไม่ได้ (ยกเลิกได้)`) &&
              withSave(async (docId) => { check(await supabase.rpc(cfg.post!.rpc, { p_id: docId })) }, `${cfg.post!.label}เรียบร้อย`)}>
            ✔ {cfg.post.label}
          </button>
        )}
        {cfg.voidable && header.status === 'posted' && can(...cfg.write, 'accounting') && (cfg.editable?.({ ...header, status: 'draft' }) ?? true) && (
          <button className="btn-ghost text-rose-600" disabled={busy}
            onClick={() => confirmBox('ยืนยันยกเลิกเอกสาร? ระบบจะกลับรายการสต๊อกและบัญชีให้อัตโนมัติ') &&
              run(async () => { check(await supabase.rpc('void_document', { p_table: cfg.table, p_id: header.id })) }, 'ยกเลิกเอกสารแล้ว').then(() => load())}>
            ยกเลิกเอกสาร
          </button>
        )}
        {cfg.print && !isNew && (
          <button className="btn-secondary" onClick={() => window.open(`/print/${cfg.key}/${header.id}`, '_blank')}>🖨 พิมพ์</button>
        )}
        {editable && !isNew && (header.status === 'draft' || cfg.statusless) && (
          <button className="btn-ghost text-rose-600" disabled={busy}
            onClick={() => confirmBox('ลบเอกสารนี้ถาวร?') &&
              run(async () => { check(await supabase.from(cfg.table).delete().eq('id', header.id)); if (cfg.statusless) invalidateRefs() }, 'ลบแล้ว').then((ok) => ok && nav(`/d/${cfg.key}`))}>
            ลบ
          </button>
        )}
      </PageHeader>

      {dirty && editable && <div className="no-print mb-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">มีการแก้ไขที่ยังไม่ได้บันทึก</div>}

      {/* header */}
      <div className="card mb-4 grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        {!cfg.statusless && !cfg.noDocNo && (
          <Field label="เลขที่เอกสาร"><input className="input" disabled value={header.doc_no ?? 'ออกเลขอัตโนมัติ'} /></Field>
        )}
        {cfg.header.filter(visible).map((f) => (
          <Field key={f.key} label={f.label + (f.required ? ' *' : '')}
            className={f.span ? { 1: '', 2: 'sm:col-span-2', 3: 'sm:col-span-2 lg:col-span-3', 4: 'sm:col-span-2 lg:col-span-4' }[f.span] : ''}>
            {f.type === 'checkbox'
              ? <div className="py-1.5"><FieldInput f={f} value={header[f.key]} header={header} disabled={!editable} onChange={(v, r) => setH(f.key, v, r)} /></div>
              : <FieldInput f={f} value={header[f.key]} header={header} disabled={!editable} onChange={(v, r) => setH(f.key, v, r)} />}
            {f.hint && <span className="mt-0.5 block text-xs text-slate-400">{f.hint}</span>}
          </Field>
        ))}
      </div>

      {/* lines */}
      <div className="card overflow-x-auto">
        <table className="tbl">
          <thead><tr>
            <th className="w-8">#</th>
            {lineCols.map((f) => <th key={f.key} style={{ minWidth: f.width ?? (f.type === 'ref' ? '220px' : '90px') }}
              className={['number', 'money'].includes(f.type) ? 'num' : ''}>{f.label}</th>)}
            {editable && <th className="w-8" />}
          </tr></thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}>
                <td className="text-slate-400">{i + 1}</td>
                {lineCols.map((f) => (
                  <td key={f.key} className={['number', 'money'].includes(f.type) && (f.compute || !editable) ? 'num' : ''}>
                    {f.compute ? <span className="font-medium">{money(f.compute(l, header))}</span>
                      : editable && !f.readOnly ? <FieldInput f={f} compact value={l[f.key]} header={header} onChange={(v) => setL(i, f.key, v)} />
                      : f.type === 'ref' ? <RefLabel refName={f.ref!} value={l[f.key]} />
                      : f.type === 'money' ? money(l[f.key])
                      : f.type === 'number' ? qty(l[f.key])
                      : f.type === 'checkbox' ? (l[f.key] ? '✓' : '')
                      : f.type === 'select' ? f.options?.find((o) => o.value === l[f.key])?.label
                      : f.type === 'date' ? dateTH(l[f.key]) : l[f.key]}
                  </td>
                ))}
                {editable && <td><button className="btn-ghost px-1.5 text-rose-500" onClick={() => removeLine(i)} title="ลบรายการ">✕</button></td>}
              </tr>
            ))}
            {lines.length === 0 && <tr><td colSpan={lineCols.length + 2}><Empty text="ยังไม่มีรายการ" /></td></tr>}
          </tbody>
        </table>
        <div className="flex flex-wrap items-start justify-between gap-4 border-t border-slate-100 p-3">
          <div>{editable && <button className="btn-secondary" onClick={addLine}>+ เพิ่มรายการ</button>}</div>
          <Totals cfg={cfg} header={header} lines={lines} totals={totals} />
        </div>
      </div>

      {!isNew && !cfg.statusless && (
        <div className="mt-3 text-xs text-slate-400">
          สร้างเมื่อ {header.created_at ? new Date(header.created_at).toLocaleString('th-TH') : '-'}
          {header.posted_at && <> · บันทึกเมื่อ {new Date(header.posted_at).toLocaleString('th-TH')}</>}
        </div>
      )}
    </div>
  )
}

function Totals({ cfg, header, lines, totals }: { cfg: DocConfig; header: Row; lines: Row[]; totals: Row }) {
  const R = ({ label, v, strong }: { label: string; v: number; strong?: boolean }) => (
    <div className={`flex justify-between gap-8 ${strong ? 'border-t border-slate-200 pt-1 text-base font-semibold' : ''}`}>
      <span className="text-slate-500">{label}</span><span className="tabular-nums">{money(v)}</span>
    </div>
  )
  if (cfg.totals === 'vat') return (
    <div className="min-w-64 space-y-1 text-sm">
      <R label="มูลค่าก่อนภาษี" v={totals.subtotal} />
      <R label="ภาษีมูลค่าเพิ่ม" v={totals.vat_amount} />
      <R label="รวมทั้งสิ้น" v={totals.total} strong />
      {header.wht_amount > 0 && <R label="หัก ณ ที่จ่าย" v={-header.wht_amount} />}
    </div>
  )
  if (cfg.totals === 'sum') return (
    <div className="min-w-64 space-y-1 text-sm">
      <R label="ยอดรวม" v={totals.total} strong />
      {num(header.wht_amount) > 0 && <R label="หัก ณ ที่จ่าย" v={-num(header.wht_amount)} />}
      {num(header.fee_amount) > 0 && <R label="ค่าธรรมเนียม" v={-num(header.fee_amount)} />}
      {(num(header.wht_amount) > 0 || num(header.fee_amount) > 0) && <R label="ยอดเงินจริง" v={totals.total - num(header.wht_amount) - num(header.fee_amount)} strong />}
    </div>
  )
  if (cfg.totals === 'dc') {
    const dr = lines.reduce((s, l) => s + num(l.debit), 0), cr = lines.reduce((s, l) => s + num(l.credit), 0)
    return (
      <div className="min-w-64 space-y-1 text-sm">
        <R label="รวมเดบิต" v={dr} /><R label="รวมเครดิต" v={cr} />
        <div className={`text-right font-medium ${round2(dr - cr) === 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
          {round2(dr - cr) === 0 ? 'สมดุล ✓' : `ไม่สมดุล ต่างกัน ${money(dr - cr)}`}
        </div>
      </div>
    )
  }
  if (cfg.totals === 'payroll') return (
    <div className="min-w-64 space-y-1 text-sm">
      <R label="รวมเงินได้" v={totals.total_gross} />
      <R label="จ่ายสุทธิ" v={totals.total_net} strong />
    </div>
  )
  return null
}
