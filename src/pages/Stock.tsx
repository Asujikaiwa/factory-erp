import { useEffect, useMemo, useState } from 'react'
import RefSelect from '../components/RefSelect'
import { Empty, Field, PageHeader, Spinner } from '../components/ui'
import { addDays, dateTH, money, monthStart, qty, today } from '../lib/format'
import { ITEM_TYPE_OPTIONS, itemTypeLabel, type Row } from '../lib/refs'
import { supabase } from '../lib/supabase'
import { exportCsv } from './Reports'

export function StockBalance() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [byWh, setByWh] = useState<Row[]>([])
  const [type, setType] = useState('')
  const [q, setQ] = useState('')
  const [onlyLow, setOnlyLow] = useState(false)
  const [view, setView] = useState<'item' | 'wh'>('item')

  useEffect(() => {
    supabase.from('v_item_stock').select('*').eq('active', true).order('code').then(({ data }) => setRows((data ?? []) as Row[]))
    supabase.from('v_stock_balance').select('*').order('item_code').then(({ data }) => setByWh((data ?? []) as Row[]))
  }, [])

  const list = useMemo(() => (rows ?? []).filter((r) => (!type || r.type === type) && (!onlyLow || r.below_min) &&
    (!q || `${r.code} ${r.name}`.toLowerCase().includes(q.toLowerCase()))), [rows, type, q, onlyLow])
  const whList = useMemo(() => byWh.filter((r) => (!type || r.item_type === type) &&
    (!q || `${r.item_code} ${r.item_name}`.toLowerCase().includes(q.toLowerCase()))), [byWh, type, q])
  const total = list.reduce((s, r) => s + Number(r.stock_value), 0)

  return (
    <div>
      <PageHeader title="สต๊อกคงเหลือ" sub="ยอดคงเหลือแบบเรียลไทม์ · ต้นทุนถัวเฉลี่ยเคลื่อนที่">
        <button className="btn-secondary" onClick={() => view === 'item'
          ? exportCsv('stock.csv', list, [['code', 'รหัส'], ['name', 'ชื่อ'], ['type', 'ประเภท'], ['qty', 'คงเหลือ'], ['unit_name', 'หน่วย'], ['avg_cost', 'ทุนเฉลี่ย'], ['stock_value', 'มูลค่า']])
          : exportCsv('stock_by_wh.csv', whList, [['item_code', 'รหัส'], ['item_name', 'ชื่อ'], ['warehouse_name', 'คลัง'], ['lot_no', 'Lot'], ['exp_date', 'หมดอายุ'], ['qty', 'คงเหลือ']])}>⬇ Excel (CSV)</button>
      </PageHeader>
      <div className="card mb-3 flex flex-wrap items-end gap-3 p-3">
        <Field label="มุมมอง"><select className="input" value={view} onChange={(e) => setView(e.target.value as 'item' | 'wh')}><option value="item">รวมทุกคลัง</option><option value="wh">แยกคลัง / ล็อต</option></select></Field>
        <Field label="ประเภท"><select className="input" value={type} onChange={(e) => setType(e.target.value)}><option value="">ทั้งหมด</option>{ITEM_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></Field>
        <Field label="ค้นหา"><input className="input w-56" value={q} onChange={(e) => setQ(e.target.value)} /></Field>
        {view === 'item' && <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" className="accent-brand-700" checked={onlyLow} onChange={(e) => setOnlyLow(e.target.checked)} /> เฉพาะที่ต่ำกว่าจุดสั่งซื้อ</label>}
        {view === 'item' && <div className="ml-auto pb-2 text-sm">มูลค่ารวม <b className="tabular-nums">{money(total)}</b> บาท</div>}
      </div>
      <div className="card overflow-auto">
        {rows === null ? <Spinner /> : view === 'item' ? (
          list.length === 0 ? <Empty /> : (
            <table className="tbl">
              <thead><tr><th>รหัส</th><th>ชื่อ</th><th>ประเภท</th><th className="num">คงเหลือ</th><th>หน่วย</th><th className="num">น้ำหนักรวม (กก.)</th><th className="num">จุดสั่งซื้อ</th><th className="num">ทุนเฉลี่ย</th><th className="num">มูลค่า</th></tr></thead>
              <tbody>{list.map((r) => (
                <tr key={r.id} className={r.below_min ? 'bg-amber-50' : ''}>
                  <td>{r.code}</td><td>{r.name}</td><td>{itemTypeLabel(r.type)}</td>
                  <td className={`num font-medium ${Number(r.qty) < 0 ? 'text-rose-600' : ''}`}>{qty(r.qty)}</td><td>{r.unit_name}</td>
                  <td className="num">{r.kg_per_unit ? qty(Number(r.qty) * Number(r.kg_per_unit)) : ''}</td>
                  <td className="num">{qty(r.min_stock)}{r.below_min && ' ⚠'}</td><td className="num">{money(r.avg_cost)}</td><td className="num">{money(r.stock_value)}</td>
                </tr>))}</tbody>
            </table>)
        ) : whList.length === 0 ? <Empty /> : (
          <table className="tbl">
            <thead><tr><th>รหัส</th><th>ชื่อ</th><th>คลัง</th><th>Lot</th><th>หมดอายุ</th><th className="num">คงเหลือ</th><th>หน่วย</th></tr></thead>
            <tbody>{whList.map((r, i) => (
              <tr key={i}><td>{r.item_code}</td><td>{r.item_name}</td><td>{r.warehouse_name}</td><td>{r.lot_no}</td><td>{dateTH(r.exp_date)}</td>
                <td className={`num font-medium ${Number(r.qty) < 0 ? 'text-rose-600' : ''}`}>{qty(r.qty)}</td><td>{r.unit_name}</td></tr>))}</tbody>
          </table>
        )}
      </div>
    </div>
  )
}

const SRC_LABEL: Record<string, string> = {
  goods_receipts: 'รับสินค้า', sales_invoices: 'ขาย', production_orders: 'ผลิต', stock_adjustments: 'ปรับสต๊อก', credit_notes: 'รับคืน',
}
const SRC_LINK: Record<string, string> = { goods_receipts: 'goods_receipts', sales_invoices: 'sales_invoices', production_orders: 'production_orders', stock_adjustments: 'stock_adjustments', credit_notes: 'credit_notes' }

export function StockCard() {
  const [item, setItem] = useState<number | null>(null)
  const [wh, setWh] = useState<number | null>(null)
  const [from, setFrom] = useState(monthStart())
  const [to, setTo] = useState(today())
  const [rows, setRows] = useState<Row[] | null>(null)

  useEffect(() => {
    if (!item) { setRows([]); return }
    setRows(null)
    let q = supabase.from('v_stock_card').select('*').eq('item_id', item).lte('move_date', to).order('move_date').order('id')
    if (wh) q = q.eq('warehouse_id', wh)
    q.then(({ data }) => setRows((data ?? []) as Row[]))
  }, [item, wh, to])

  // running balance across chosen scope
  const computed = useMemo(() => {
    let bal = 0, opening = 0
    const out: Row[] = []
    for (const r of rows ?? []) {
      bal += Number(r.qty)
      if (r.move_date < from) { opening = bal; continue }
      out.push({ ...r, run: bal })
    }
    return { opening, out }
  }, [rows, from])

  return (
    <div>
      <PageHeader title="สต๊อกการ์ด" sub="ความเคลื่อนไหวรายสินค้า (รับเข้า / จ่ายออก / คงเหลือ)" />
      <div className="card mb-3 flex flex-wrap items-end gap-3 p-3">
        <Field label="สินค้า" className="w-80"><RefSelect refName="items" value={item} onChange={(v) => setItem(v)} /></Field>
        <Field label="คลัง (ว่าง=ทุกคลัง)" className="w-56"><RefSelect refName="warehouses" value={wh} onChange={(v) => setWh(v)} /></Field>
        <Field label="ตั้งแต่"><input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="ถึง"><input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>
      <div className="card overflow-auto">
        {!item ? <Empty text="เลือกสินค้าเพื่อดูความเคลื่อนไหว" /> : rows === null ? <Spinner /> : (
          <table className="tbl">
            <thead><tr><th>วันที่</th><th>เอกสาร</th><th>ประเภท</th><th>คลัง</th><th>Lot</th><th className="num">รับเข้า</th><th className="num">จ่ายออก</th><th className="num">คงเหลือ</th><th className="num">ทุน/หน่วย</th><th>หมายเหตุ</th></tr></thead>
            <tbody>
              <tr className="bg-slate-50"><td colSpan={7} className="font-medium">ยอดยกมา</td><td className="num font-medium">{qty(computed.opening)}</td><td colSpan={2} /></tr>
              {computed.out.map((r) => (
                <tr key={r.id}>
                  <td>{dateTH(r.move_date)}</td>
                  <td>{SRC_LINK[r.source_type] ? <a className="text-brand-700 hover:underline" href={`/d/${SRC_LINK[r.source_type]}/${r.source_id}`}>{r.doc_no}</a> : r.doc_no}</td>
                  <td>{SRC_LABEL[r.source_type] ?? r.source_type}</td><td>{r.warehouse_name}</td><td>{r.lot_no}</td>
                  <td className="num text-emerald-700">{Number(r.qty_in) ? qty(r.qty_in) : ''}</td>
                  <td className="num text-rose-600">{Number(r.qty_out) ? qty(r.qty_out) : ''}</td>
                  <td className="num font-medium">{qty(r.run)}</td><td className="num">{money(r.unit_cost)}</td><td className="text-slate-500">{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

export function LotExpiry() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [days, setDays] = useState(90)
  useEffect(() => {
    let q = supabase.from('v_lot_expiry').select('*').order('exp_date', { nullsFirst: false })
    if (days < 36500) q = q.lte('exp_date', addDays(today(), days))
    q.then(({ data }) => setRows((data ?? []) as Row[]))
  }, [days])
  return (
    <div>
      <PageHeader title="ล็อต / วันหมดอายุ" sub="สินค้าคงเหลือที่จะหมดอายุ — ระบบตัดสต๊อกแบบ FEFO (หมดอายุก่อนออกก่อน) ให้อัตโนมัติ">
        <select className="input w-48" value={days} onChange={(e) => setDays(Number(e.target.value))}>
          <option value={30}>ภายใน 30 วัน</option><option value={90}>ภายใน 90 วัน</option><option value={180}>ภายใน 180 วัน</option><option value={36500}>ทั้งหมด</option>
        </select>
      </PageHeader>
      <div className="card overflow-auto">
        {rows === null ? <Spinner /> : rows.length === 0 ? <Empty text="ไม่มีล็อตที่ใกล้หมดอายุ" /> : (
          <table className="tbl">
            <thead><tr><th>สินค้า</th><th>Lot</th><th>คลัง</th><th>วันหมดอายุ</th><th className="num">เหลืออีก (วัน)</th><th className="num">คงเหลือ</th><th>หน่วย</th></tr></thead>
            <tbody>{rows.map((r, i) => (
              <tr key={i} className={r.days_left < 0 ? 'bg-rose-50' : r.days_left <= 30 ? 'bg-amber-50' : ''}>
                <td>{r.item_code} {r.item_name}</td><td>{r.lot_no}</td><td>{r.warehouse_name}</td><td>{dateTH(r.exp_date)}</td>
                <td className={`num font-medium ${r.days_left < 0 ? 'text-rose-600' : ''}`}>{r.days_left < 0 ? `หมดอายุแล้ว ${-r.days_left}` : r.days_left}</td>
                <td className="num">{qty(r.qty)}</td><td>{r.unit_name}</td>
              </tr>))}</tbody>
          </table>
        )}
      </div>
    </div>
  )
}
