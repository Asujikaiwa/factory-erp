import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import RefSelect from '../components/RefSelect'
import { Empty, Field, PageHeader, Spinner } from '../components/ui'
import { dateTH, money, monthEnd, monthStart, num, qty, today } from '../lib/format'
import { fetchRef, type Row } from '../lib/refs'
import { useSettings } from '../lib/settings'
import { supabase } from '../lib/supabase'

/* ---------- helpers ---------- */
export function exportCsv(name: string, rows: Row[], cols: [string, string][]) {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const csv = '﻿' + [cols.map((c) => esc(c[1])).join(','), ...rows.map((r) => cols.map((c) => esc(r[c[0]])).join(','))].join('\r\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  a.download = name
  a.click()
}

function useRange(defFrom = monthStart(), defTo = today()) {
  const [from, setFrom] = useState(defFrom)
  const [to, setTo] = useState(defTo)
  const ui = (
    <>
      <Field label="ตั้งแต่วันที่"><input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
      <Field label="ถึงวันที่"><input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
    </>
  )
  return { from, to, ui }
}

function ReportShell({ title, sub, filters, actions, children }: { title: string; sub?: string; filters?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  const s = useSettings()
  return (
    <div>
      <PageHeader title={title} sub={sub}>
        {actions}
        <button className="btn-secondary" onClick={() => window.print()}>🖨 พิมพ์</button>
      </PageHeader>
      {filters && <div className="card no-print mb-3 flex flex-wrap items-end gap-3 p-3">{filters}</div>}
      <div className="hidden print:block mb-3 text-center">
        <div className="text-lg font-semibold">{s.name}</div>
        <div className="font-medium">{title}</div>
        {sub && <div className="text-sm">{sub}</div>}
      </div>
      <div className="card print-page overflow-auto">{children}</div>
    </div>
  )
}

const DOC_ROUTE: Record<string, string> = { sales_invoices: 'sales_invoices', credit_notes: 'credit_notes', goods_receipts: 'goods_receipts', expenses: 'expenses' }

/* =====================================================================
   AR / AP aging
   ===================================================================== */
function Aging({ side }: { side: 'ar' | 'ap' }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [detail, setDetail] = useState(false)
  useEffect(() => {
    supabase.from('v_open_items').select('*').eq('side', side).neq('outstanding', 0).order('partner_name').order('due_date')
      .then(({ data }) => setRows((data ?? []) as Row[]))
  }, [side])
  const bucket = (d: number) => (d <= 0 ? 0 : d <= 30 ? 1 : d <= 60 ? 2 : d <= 90 ? 3 : 4)
  const heads = ['ยังไม่ครบกำหนด', '1-30 วัน', '31-60 วัน', '61-90 วัน', 'เกิน 90 วัน']
  const groups = useMemo(() => {
    const m = new Map<string, { name: string; b: number[]; total: number; docs: Row[] }>()
    type G = { name: string; b: number[]; total: number; docs: Row[] }
    for (const r of rows ?? []) {
      const g: G = m.get(r.partner_name) ?? { name: r.partner_name, b: [0, 0, 0, 0, 0], total: 0, docs: [] as Row[] }
      g.b[bucket(r.days_overdue)] += num(r.outstanding); g.total += num(r.outstanding); g.docs.push(r)
      m.set(r.partner_name, g)
    }
    return [...m.values()]
  }, [rows])
  const tot = groups.reduce((a, g) => a.map((v, i) => v + g.b[i]), [0, 0, 0, 0, 0])

  return (
    <ReportShell title={side === 'ar' ? 'ลูกหนี้คงค้าง (Aging)' : 'เจ้าหนี้คงค้าง (Aging)'} sub={`ณ วันที่ ${dateTH(today())}`}
      filters={<label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-brand-700" checked={detail} onChange={(e) => setDetail(e.target.checked)} /> แสดงรายบิล</label>}
      actions={<button className="btn-secondary" onClick={() => exportCsv(`${side}_aging.csv`, rows ?? [], [['partner_name', 'ชื่อ'], ['doc_no', 'เลขที่'], ['doc_date', 'วันที่'], ['due_date', 'ครบกำหนด'], ['amount', 'ยอดบิล'], ['paid', 'ชำระแล้ว'], ['outstanding', 'คงค้าง'], ['days_overdue', 'เกินกำหนด(วัน)']])}>⬇ CSV</button>}>
      {rows === null ? <Spinner /> : groups.length === 0 ? <Empty text="ไม่มียอดค้าง" /> : (
        <table className="tbl">
          <thead><tr><th>{side === 'ar' ? 'ลูกค้า' : 'ผู้ขาย'}</th>{heads.map((h) => <th key={h} className="num">{h}</th>)}<th className="num">รวมคงค้าง</th></tr></thead>
          <tbody>
            {groups.map((g) => (
              <Fragment key={g.name}>
                <tr className="font-medium">
                  <td>{g.name}</td>{g.b.map((v, i) => <td key={i} className={`num ${i > 0 && v ? 'text-rose-600' : ''}`}>{v ? money(v) : ''}</td>)}<td className="num">{money(g.total)}</td>
                </tr>
                {detail && g.docs.map((d) => (
                  <tr key={d.id} className="text-xs text-slate-500">
                    <td className="pl-6">{DOC_ROUTE[d.source_type] ? <Link className="text-brand-700" to={`/d/${DOC_ROUTE[d.source_type]}/${d.source_id}`}>{d.doc_no}</Link> : d.doc_no} · {dateTH(d.doc_date)} · ครบ {dateTH(d.due_date)}</td>
                    {[0, 1, 2, 3, 4].map((i) => <td key={i} className="num">{bucket(d.days_overdue) === i ? money(d.outstanding) : ''}</td>)}<td />
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
          <tfoot><tr className="font-semibold"><td className="border-t-2 px-2 py-2">รวม</td>{tot.map((v, i) => <td key={i} className="num border-t-2 px-2">{money(v)}</td>)}<td className="num border-t-2 px-2">{money(tot.reduce((a, b) => a + b, 0))}</td></tr></tfoot>
        </table>
      )}
    </ReportShell>
  )
}
export const ArReport = () => <Aging side="ar" />
export const ApReport = () => <Aging side="ap" />

/* =====================================================================
   Sales report
   ===================================================================== */
export function SalesReport() {
  const { from, to, ui } = useRange()
  const [by, setBy] = useState<'customer' | 'item' | 'day'>('customer')
  const vatRate = num(useSettings().vat_rate)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [names, setNames] = useState<{ c: Map<number, string>; i: Map<number, Row> }>({ c: new Map(), i: new Map() })

  useEffect(() => {
    Promise.all([fetchRef('customers'), fetchRef('items')]).then(([c, i]) =>
      setNames({ c: new Map(c.map((r) => [r.id, r.name])), i: new Map(i.map((r) => [r.id, r])) }))
  }, [])
  useEffect(() => {
    setRows(null)
    supabase.from('sales_invoice_lines').select('qty,amount,item_id,sales_invoices!inner(doc_date,status,customer_id,vat_type,subtotal)')
      .eq('sales_invoices.status', 'posted').gte('sales_invoices.doc_date', from).lte('sales_invoices.doc_date', to).limit(20000)
      .then(({ data }) => setRows((data ?? []) as Row[]))
  }, [from, to])

  const grouped = useMemo(() => {
    const m = new Map<string, { key: string; label: string; qty: number; amount: number; kg: number }>()
    for (const r of rows ?? []) {
      const inv = r.sales_invoices
      const it = names.i.get(r.item_id)
      const k = by === 'customer' ? String(inv.customer_id) : by === 'item' ? String(r.item_id) : inv.doc_date
      const label = by === 'customer' ? names.c.get(inv.customer_id) ?? k : by === 'item' ? (it ? `${it.code} ${it.name}` : k) : dateTH(k)
      // amounts before VAT: for VAT-inclusive invoices scale back
      const net = inv.vat_type === 'include' ? num(r.amount) * 100 / (100 + vatRate) : num(r.amount)
      const g = m.get(k) ?? { key: k, label, qty: 0, amount: 0, kg: 0 }
      g.qty += num(r.qty); g.amount += net; g.kg += num(r.qty) * num(it?.kg_per_unit)
      m.set(k, g)
    }
    return [...m.values()].sort((a, b) => (by === 'day' ? a.key.localeCompare(b.key) : b.amount - a.amount))
  }, [rows, by, names, vatRate])
  const total = grouped.reduce((s, g) => s + g.amount, 0)

  return (
    <ReportShell title="รายงานยอดขาย" sub={`${dateTH(from)} - ${dateTH(to)} · ยอดก่อน VAT`}
      filters={<>{ui}<Field label="สรุปตาม"><select className="input" value={by} onChange={(e) => setBy(e.target.value as 'customer')}><option value="customer">ลูกค้า</option><option value="item">สินค้า</option><option value="day">วัน</option></select></Field></>}
      actions={<button className="btn-secondary" onClick={() => exportCsv('sales.csv', grouped, [['label', 'รายการ'], ['qty', 'จำนวน'], ['kg', 'น้ำหนัก(กก.)'], ['amount', 'ยอดขาย']])}>⬇ CSV</button>}>
      {rows === null ? <Spinner /> : grouped.length === 0 ? <Empty /> : (
        <table className="tbl">
          <thead><tr><th>{by === 'customer' ? 'ลูกค้า' : by === 'item' ? 'สินค้า' : 'วันที่'}</th>{by !== 'customer' && <th className="num">จำนวน</th>}<th className="num">น้ำหนัก (กก.)</th><th className="num">ยอดขาย</th><th className="num">สัดส่วน</th></tr></thead>
          <tbody>{grouped.map((g) => (
            <tr key={g.key}><td>{g.label}</td>{by !== 'customer' && <td className="num">{qty(g.qty)}</td>}<td className="num">{g.kg ? qty(g.kg) : ''}</td><td className="num">{money(g.amount)}</td><td className="num">{total ? ((g.amount / total) * 100).toFixed(1) : 0}%</td></tr>
          ))}</tbody>
          <tfoot><tr className="font-semibold"><td className="border-t-2 px-2 py-2">รวม</td>{by !== 'customer' && <td className="border-t-2" />}<td className="num border-t-2 px-2">{qty(grouped.reduce((s, g) => s + g.kg, 0))}</td><td className="num border-t-2 px-2">{money(total)}</td><td className="border-t-2" /></tr></tfoot>
        </table>
      )}
    </ReportShell>
  )
}

/* =====================================================================
   Production report
   ===================================================================== */
export function ProductionReport() {
  const { from, to, ui } = useRange()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [items, setItems] = useState<Map<number, Row>>(new Map())
  useEffect(() => { fetchRef('items').then((i) => setItems(new Map(i.map((r) => [r.id, r])))) }, [])
  useEffect(() => {
    setRows(null)
    supabase.from('production_orders').select('*').eq('status', 'posted').gte('doc_date', from).lte('doc_date', to).order('doc_date')
      .then(({ data }) => setRows((data ?? []) as Row[]))
  }, [from, to])
  const sum = useMemo(() => {
    const m = new Map<number, { qty: number; cost: number }>()
    for (const r of rows ?? []) { const g = m.get(r.item_id) ?? { qty: 0, cost: 0 }; g.qty += num(r.output_qty); g.cost += num(r.total_cost); m.set(r.item_id, g) }
    return [...m.entries()]
  }, [rows])
  return (
    <ReportShell title="รายงานการผลิต" sub={`${dateTH(from)} - ${dateTH(to)}`} filters={ui}>
      {rows === null ? <Spinner /> : rows.length === 0 ? <Empty /> : (
        <>
          <table className="tbl">
            <thead><tr><th>สินค้า</th><th className="num">ผลิตได้รวม</th><th className="num">น้ำหนัก (กก.)</th><th className="num">ต้นทุนรวม</th><th className="num">ต้นทุนเฉลี่ย/หน่วย</th></tr></thead>
            <tbody>{sum.map(([id, g]) => { const it = items.get(id); return (
              <tr key={id} className="font-medium"><td>{it?.code} {it?.name}</td><td className="num">{qty(g.qty)}</td><td className="num">{it?.kg_per_unit ? qty(g.qty * num(it.kg_per_unit)) : ''}</td><td className="num">{money(g.cost)}</td><td className="num">{money(g.qty ? g.cost / g.qty : 0)}</td></tr>) })}</tbody>
          </table>
          <h3 className="border-t border-slate-200 px-3 pt-4 pb-2 font-semibold">รายละเอียดใบผลิต</h3>
          <table className="tbl">
            <thead><tr><th>วันที่</th><th>เลขที่</th><th>สินค้า</th><th>Lot</th><th>กะ</th><th className="num">ผลิตได้</th><th className="num">ต้นทุน/หน่วย</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id}><td>{dateTH(r.doc_date)}</td><td><Link className="text-brand-700" to={`/d/production_orders/${r.id}`}>{r.doc_no}</Link></td><td>{items.get(r.item_id)?.name}</td><td>{r.lot_no}</td><td>{r.shift}</td><td className="num">{qty(r.output_qty)}</td><td className="num">{money(r.unit_cost)}</td></tr>))}</tbody>
          </table>
        </>
      )}
    </ReportShell>
  )
}

/* =====================================================================
   Accounting reports
   ===================================================================== */
function useTB(from: string, to: string) {
  const [rows, setRows] = useState<Row[] | null>(null)
  useEffect(() => {
    setRows(null)
    supabase.rpc('trial_balance', { p_from: from, p_to: to }).then(({ data }) => setRows((data ?? []) as Row[]))
  }, [from, to])
  return rows
}

export function TrialBalance() {
  const { from, to, ui } = useRange(today().slice(0, 4) + '-01-01')
  const [hideZero, setHideZero] = useState(true)
  const rows = useTB(from, to)
  const list = (rows ?? []).filter((r) => !hideZero || num(r.opening) || num(r.debit) || num(r.credit))
  const t = list.reduce((a, r) => ({ o: a.o + num(r.opening), d: a.d + num(r.debit), c: a.c + num(r.credit), cl: a.cl + num(r.closing) }), { o: 0, d: 0, c: 0, cl: 0 })
  const side = (v: number) => [v > 0 ? money(v) : '', v < 0 ? money(-v) : '']
  return (
    <ReportShell title="งบทดลอง" sub={`${dateTH(from)} - ${dateTH(to)}`}
      filters={<>{ui}<label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" className="accent-brand-700" checked={hideZero} onChange={(e) => setHideZero(e.target.checked)} /> ซ่อนบัญชีที่ไม่มียอด</label></>}
      actions={<button className="btn-secondary" onClick={() => exportCsv('trial_balance.csv', list, [['code', 'รหัส'], ['name', 'ชื่อบัญชี'], ['opening', 'ยกมา'], ['debit', 'เดบิต'], ['credit', 'เครดิต'], ['closing', 'คงเหลือ']])}>⬇ CSV</button>}>
      {rows === null ? <Spinner /> : (
        <table className="tbl">
          <thead><tr><th>รหัส</th><th>ชื่อบัญชี</th><th className="num">ยกมา Dr</th><th className="num">ยกมา Cr</th><th className="num">เดบิต</th><th className="num">เครดิต</th><th className="num">คงเหลือ Dr</th><th className="num">คงเหลือ Cr</th></tr></thead>
          <tbody>{list.map((r) => (
            <tr key={r.account_id}><td><Link className="text-brand-700" to={`/r/gl?account=${r.account_id}&from=${from}&to=${to}`}>{r.code}</Link></td><td>{r.name}</td>
              {side(num(r.opening)).map((v, i) => <td key={'o' + i} className="num">{v}</td>)}
              <td className="num">{num(r.debit) ? money(r.debit) : ''}</td><td className="num">{num(r.credit) ? money(r.credit) : ''}</td>
              {side(num(r.closing)).map((v, i) => <td key={'c' + i} className="num">{v}</td>)}</tr>))}</tbody>
          <tfoot><tr className="font-semibold">
            <td colSpan={2} className="border-t-2 px-2 py-2">รวม {Math.abs(t.d - t.c) < 0.005 ? '✓ สมดุล' : '✗ ไม่สมดุล'}</td>
            <td className="num border-t-2 px-2">{money(list.reduce((s, r) => s + Math.max(num(r.opening), 0), 0))}</td><td className="num border-t-2 px-2">{money(list.reduce((s, r) => s + Math.max(-num(r.opening), 0), 0))}</td>
            <td className="num border-t-2 px-2">{money(t.d)}</td><td className="num border-t-2 px-2">{money(t.c)}</td>
            <td className="num border-t-2 px-2">{money(list.reduce((s, r) => s + Math.max(num(r.closing), 0), 0))}</td><td className="num border-t-2 px-2">{money(list.reduce((s, r) => s + Math.max(-num(r.closing), 0), 0))}</td>
          </tr></tfoot>
        </table>
      )}
    </ReportShell>
  )
}

export function GeneralLedger() {
  const sp = new URLSearchParams(window.location.search)
  const [account, setAccount] = useState<number | null>(sp.get('account') ? Number(sp.get('account')) : null)
  const { from, to, ui } = useRange(sp.get('from') ?? monthStart(), sp.get('to') ?? today())
  const [rows, setRows] = useState<Row[] | null>(null)
  const [opening, setOpening] = useState(0)
  useEffect(() => {
    if (!account) { setRows([]); return }
    setRows(null)
    supabase.rpc('trial_balance', { p_from: from, p_to: to }).then(({ data }) => setOpening(num(((data ?? []) as Row[]).find((r) => r.account_id === account)?.opening)))
    supabase.from('v_gl_lines').select('*').eq('account_id', account).gte('doc_date', from).lte('doc_date', to).order('doc_date').order('entry_id')
      .then(({ data }) => setRows((data ?? []) as Row[]))
  }, [account, from, to])
  let bal = opening
  return (
    <ReportShell title="บัญชีแยกประเภท" sub={`${dateTH(from)} - ${dateTH(to)}`}
      filters={<><Field label="บัญชี" className="w-80"><RefSelect refName="accounts" value={account} onChange={(v) => setAccount(v)} /></Field>{ui}</>}>
      {!account ? <Empty text="เลือกบัญชี" /> : rows === null ? <Spinner /> : (
        <table className="tbl">
          <thead><tr><th>วันที่</th><th>เลขที่</th><th>คำอธิบาย</th><th>คู่ค้า</th><th className="num">เดบิต</th><th className="num">เครดิต</th><th className="num">คงเหลือ</th></tr></thead>
          <tbody>
            <tr className="bg-slate-50 font-medium"><td colSpan={6}>ยอดยกมา</td><td className="num">{money(opening)}</td></tr>
            {rows.map((r) => { bal += num(r.debit) - num(r.credit); return (
              <tr key={r.id}><td>{dateTH(r.doc_date)}</td><td><Link className="text-brand-700" to={`/d/journal_entries/${r.entry_id}`}>{r.doc_no}</Link></td><td>{r.description || r.entry_description}</td><td>{r.partner_name}</td>
                <td className="num">{num(r.debit) ? money(r.debit) : ''}</td><td className="num">{num(r.credit) ? money(r.credit) : ''}</td><td className="num">{money(bal)}</td></tr>) })}
          </tbody>
        </table>
      )}
    </ReportShell>
  )
}

export function ProfitLoss() {
  const { from, to, ui } = useRange(today().slice(0, 4) + '-01-01', today())
  const rows = useTB(from, to)
  const sec = (prefix: string, sign: 1 | -1) => (rows ?? []).filter((r) => r.code.startsWith(prefix) && (num(r.debit) || num(r.credit))).map((r) => ({ ...r, v: sign * (num(r.debit) - num(r.credit)) }))
  const rev = sec('4', -1), cogs = sec('5', 1), opex = sec('6', 1)
  const S = (a: Row[]) => a.reduce((s, r) => s + r.v, 0)
  const gp = S(rev) - S(cogs), np = gp - S(opex)
  const Block = ({ title, list, total }: { title: string; list: Row[]; total: number }) => (
    <>
      <tr className="bg-slate-50 font-semibold"><td colSpan={2}>{title}</td></tr>
      {list.map((r) => <tr key={r.account_id}><td className="pl-6">{r.code} {r.name}</td><td className="num">{money(r.v)}</td></tr>)}
      <tr className="font-medium"><td className="pl-6">รวม{title}</td><td className="num border-t border-slate-300">{money(total)}</td></tr>
    </>
  )
  return (
    <ReportShell title="งบกำไรขาดทุน" sub={`${dateTH(from)} - ${dateTH(to)}`} filters={ui}>
      {rows === null ? <Spinner /> : (
        <table className="tbl max-w-3xl">
          <tbody>
            <Block title="รายได้" list={rev} total={S(rev)} />
            <Block title="ต้นทุนขายและการผลิต" list={cogs} total={S(cogs)} />
            <tr className="text-base font-semibold"><td>กำไรขั้นต้น {S(rev) ? `(${((gp / S(rev)) * 100).toFixed(1)}%)` : ''}</td><td className="num">{money(gp)}</td></tr>
            <Block title="ค่าใช้จ่ายในการขายและบริหาร" list={opex} total={S(opex)} />
            <tr className={`text-base font-bold ${np < 0 ? 'text-rose-600' : 'text-emerald-700'}`}><td>กำไร (ขาดทุน) สุทธิ</td><td className="num border-t-2 border-b-4 border-double border-slate-400">{money(np)}</td></tr>
          </tbody>
        </table>
      )}
    </ReportShell>
  )
}

export function BalanceSheet() {
  const [asOf, setAsOf] = useState(today())
  const rows = useTB('1900-01-01', asOf)
  const pick = (t: string, sign: 1 | -1) => (rows ?? []).filter((r) => r.type === t && num(r.closing)).map((r) => ({ ...r, v: sign * num(r.closing) }))
  const assets = pick('asset', 1), liab = pick('liability', -1), eq = pick('equity', -1)
  const earnings = -(rows ?? []).filter((r) => r.type === 'income' || r.type === 'expense').reduce((s, r) => s + num(r.closing), 0)
  const S = (a: Row[]) => a.reduce((s, r) => s + r.v, 0)
  const totalLE = S(liab) + S(eq) + earnings
  const L = (list: Row[]) => list.map((r) => <tr key={r.account_id}><td className="pl-6">{r.code} {r.name}</td><td className="num">{money(r.v)}</td></tr>)
  return (
    <ReportShell title="งบแสดงฐานะการเงิน" sub={`ณ วันที่ ${dateTH(asOf)}`}
      filters={<Field label="ณ วันที่"><input type="date" className="input" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></Field>}>
      {rows === null ? <Spinner /> : (
        <table className="tbl max-w-3xl">
          <tbody>
            <tr className="bg-slate-50 font-semibold"><td colSpan={2}>สินทรัพย์</td></tr>{L(assets)}
            <tr className="text-base font-semibold"><td>รวมสินทรัพย์</td><td className="num border-t-2 border-b-4 border-double border-slate-400">{money(S(assets))}</td></tr>
            <tr className="bg-slate-50 font-semibold"><td colSpan={2}>หนี้สิน</td></tr>{L(liab)}
            <tr className="font-medium"><td>รวมหนี้สิน</td><td className="num border-t border-slate-300">{money(S(liab))}</td></tr>
            <tr className="bg-slate-50 font-semibold"><td colSpan={2}>ส่วนของเจ้าของ</td></tr>{L(eq)}
            <tr><td className="pl-6">กำไร (ขาดทุน) ที่ยังไม่ปิดบัญชี</td><td className="num">{money(earnings)}</td></tr>
            <tr className="font-medium"><td>รวมส่วนของเจ้าของ</td><td className="num border-t border-slate-300">{money(S(eq) + earnings)}</td></tr>
            <tr className="text-base font-semibold"><td>รวมหนี้สินและส่วนของเจ้าของ {Math.abs(totalLE - S(assets)) < 0.005 ? '✓' : '✗'}</td><td className="num border-t-2 border-b-4 border-double border-slate-400">{money(totalLE)}</td></tr>
          </tbody>
        </table>
      )}
    </ReportShell>
  )
}

export function VatReport() {
  const [month, setMonth] = useState(today().slice(0, 7))
  const [kind, setKind] = useState<'sales' | 'purchase'>('sales')
  const [rows, setRows] = useState<Row[] | null>(null)
  const from = month + '-01', to = monthEnd(from)
  useEffect(() => {
    setRows(null)
    supabase.from(kind === 'sales' ? 'v_vat_sales' : 'v_vat_purchase').select('*').gte('doc_date', from).lte('doc_date', to).order('doc_date').order('doc_no')
      .then(({ data }) => setRows((data ?? []) as Row[]))
  }, [kind, from, to])
  const t = (rows ?? []).reduce((a, r) => ({ s: a.s + num(r.subtotal), v: a.v + num(r.vat_amount), t: a.t + num(r.total) }), { s: 0, v: 0, t: 0 })
  return (
    <ReportShell title={kind === 'sales' ? 'รายงานภาษีขาย' : 'รายงานภาษีซื้อ'} sub={`เดือนภาษี ${month}`}
      filters={<>
        <Field label="รายงาน"><select className="input" value={kind} onChange={(e) => setKind(e.target.value as 'sales')}><option value="sales">ภาษีขาย</option><option value="purchase">ภาษีซื้อ</option></select></Field>
        <Field label="เดือนภาษี"><input type="month" className="input" value={month} onChange={(e) => setMonth(e.target.value)} /></Field></>}
      actions={<button className="btn-secondary" onClick={() => exportCsv(`vat_${kind}_${month}.csv`, rows ?? [], [['doc_date', 'วันที่'], ['doc_no', 'เลขที่'], [kind === 'sales' ? 'customer_name' : 'supplier_name', 'ชื่อ'], ['tax_id', 'เลขผู้เสียภาษี'], ['branch', 'สาขา'], ['subtotal', 'มูลค่า'], ['vat_amount', 'ภาษี']])}>⬇ CSV</button>}>
      {rows === null ? <Spinner /> : rows.length === 0 ? <Empty /> : (
        <table className="tbl">
          <thead><tr><th>#</th><th>วันที่</th><th>เลขที่ใบกำกับ</th><th>{kind === 'sales' ? 'ชื่อผู้ซื้อ' : 'ชื่อผู้ขาย'}</th><th>เลขประจำตัวผู้เสียภาษี</th><th>สาขา</th><th className="num">มูลค่าสินค้า/บริการ</th><th className="num">ภาษีมูลค่าเพิ่ม</th><th className="num">รวม</th></tr></thead>
          <tbody>{rows.map((r, i) => (
            <tr key={i}><td>{i + 1}</td><td>{dateTH(r.doc_date)}</td><td>{r.doc_no}</td><td>{r.customer_name ?? r.supplier_name}</td><td>{r.tax_id}</td><td>{r.branch}</td><td className="num">{money(r.subtotal)}</td><td className="num">{money(r.vat_amount)}</td><td className="num">{money(r.total)}</td></tr>))}</tbody>
          <tfoot><tr className="font-semibold"><td colSpan={6} className="border-t-2 px-2 py-2">รวม</td><td className="num border-t-2 px-2">{money(t.s)}</td><td className="num border-t-2 px-2">{money(t.v)}</td><td className="num border-t-2 px-2">{money(t.t)}</td></tr></tfoot>
        </table>
      )}
    </ReportShell>
  )
}
