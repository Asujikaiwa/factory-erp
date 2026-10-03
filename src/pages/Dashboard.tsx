import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Empty, PageHeader, Spinner, Stat } from '../components/ui'
import { useAuth } from '../lib/auth'
import { dateTH, money, monthTH, num, qty, today } from '../lib/format'
import type { Row } from '../lib/refs'
import { supabase } from '../lib/supabase'

export default function Dashboard() {
  const { can, profile } = useAuth()
  const [d, setD] = useState<Row | null>(null)
  const [low, setLow] = useState<Row[]>([])
  const [exp, setExp] = useState<Row[]>([])

  useEffect(() => {
    supabase.rpc('dashboard_summary').then(({ data }) => setD((data as Row) ?? {}))
    supabase.from('v_item_stock').select('id,code,name,qty,min_stock,unit_name').eq('below_min', true).eq('active', true).order('code').limit(10)
      .then(({ data }) => setLow((data ?? []) as Row[]))
    supabase.from('v_lot_expiry').select('item_name,lot_no,exp_date,qty,warehouse_name,days_left').lte('days_left', 30).order('exp_date').limit(10)
      .then(({ data }) => setExp((data ?? []) as Row[]))
  }, [])

  if (!d) return <Spinner />
  const fin = can('accounting', 'executive')
  const sales = can('sales', 'accounting', 'executive')
  const gp = num(d.sales_month) - num(d.cogs_month)

  return (
    <div className="space-y-5">
      <PageHeader title={`สวัสดี ${profile?.full_name ?? ''}`} sub={`ข้อมูล ณ วันที่ ${dateTH(today())}`} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {sales && <Stat label="ยอดขายวันนี้ (ก่อน VAT)" value={money(d.sales_today)} />}
        {sales && <Stat label="ยอดขายเดือนนี้" value={money(d.sales_month)} sub={fin ? `กำไรขั้นต้น ${money(gp)} (${num(d.sales_month) ? ((gp / num(d.sales_month)) * 100).toFixed(1) : '0'}%)` : undefined} />}
        {sales && <Stat label="ลูกหนี้คงค้าง" value={money(d.ar_total)} sub={<Link to="/r/ar" className="text-rose-600">เกินกำหนด {money(d.ar_overdue)}</Link>} tone={num(d.ar_overdue) > 0 ? 'rose' : 'slate'} />}
        {can('purchasing', 'accounting', 'executive') && <Stat label="เจ้าหนี้คงค้าง" value={money(d.ap_total)} />}
        {fin && <Stat label="เงินสด + เงินฝาก" value={money(d.cash)} tone="emerald" />}
        <Stat label="มูลค่าสต๊อกรวม" value={money(d.stock_value)} />
        <Stat label="สินค้าต่ำกว่าจุดสั่งซื้อ" value={d.low_stock} tone={d.low_stock > 0 ? 'amber' : 'slate'} sub={<Link to="/stock" className="text-brand-700">ดูสต๊อก →</Link>} />
        <Stat label="ล็อตหมดอายุใน 30 วัน" value={d.expiring} tone={d.expiring > 0 ? 'rose' : 'slate'} sub={<Link to="/stock/lots" className="text-brand-700">ดูล็อต →</Link>} />
        <Stat label="ผลิตได้เดือนนี้ (หน่วย)" value={qty(d.prod_month)} />
        <Stat label="ใบสั่งขายรอส่ง / ใบสั่งซื้อรอรับ" value={`${d.open_so} / ${d.open_po}`} />
      </div>

      {sales && (
        <div className="card p-4">
          <h2 className="mb-1 font-semibold">ยอดขายรายเดือน (ก่อน VAT) — 12 เดือนล่าสุด</h2>
          <p className="mb-3 text-xs text-slate-500">ชี้ที่แท่งเพื่อดูยอดขาย ต้นทุน และกำไรขั้นต้น</p>
          <SalesChart data={(d.sales_12m ?? []) as Row[]} />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <ListCard title="⚠ สินค้าต่ำกว่าจุดสั่งซื้อ" rows={low} cols={[['code', 'รหัส'], ['name', 'สินค้า'], ['qty', 'คงเหลือ', 'q'], ['min_stock', 'ขั้นต่ำ', 'q']]} />
        <ListCard title="⏰ ล็อตใกล้หมดอายุ" rows={exp} cols={[['item_name', 'สินค้า'], ['lot_no', 'Lot'], ['exp_date', 'หมดอายุ', 'd'], ['qty', 'คงเหลือ', 'q']]} />
        {sales && <ListCard title="🏆 สินค้าขายดี 90 วัน" rows={(d.top_items ?? []) as Row[]} cols={[['name', 'สินค้า'], ['qty', 'จำนวน', 'q'], ['amount', 'ยอดขาย', 'm']]} />}
      </div>
    </div>
  )
}

function ListCard({ title, rows, cols }: { title: string; rows: Row[]; cols: [string, string, ('q' | 'm' | 'd')?][] }) {
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-slate-100 px-4 py-2.5 font-semibold">{title}</div>
      {rows.length === 0 ? <Empty text="ไม่มีรายการ" /> : (
        <table className="tbl">
          <thead><tr>{cols.map(([k, l, t]) => <th key={k} className={t && t !== 'd' ? 'num' : ''}>{l}</th>)}</tr></thead>
          <tbody>{rows.map((r, i) => (
            <tr key={i}>{cols.map(([k, , t]) => (
              <td key={k} className={t && t !== 'd' ? 'num' : ''}>{t === 'q' ? qty(r[k]) : t === 'm' ? money(r[k]) : t === 'd' ? dateTH(r[k]) : r[k]}</td>
            ))}</tr>
          ))}</tbody>
        </table>
      )}
    </div>
  )
}

/** single-series bar chart with hover tooltip (inline SVG, no library) */
function SalesChart({ data }: { data: Row[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 720, H = 220, padL = 56, padB = 26, padT = 10
  const max = Math.max(1, ...data.map((r) => num(r.sales)))
  const nice = niceMax(max)
  const bw = (W - padL - 8) / Math.max(1, data.length)
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / nice)
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * nice)
  const h = hover != null ? data[hover] : null

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="กราฟยอดขายรายเดือน">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - 4} y1={y(t)} y2={y(t)} stroke="#e2e8f0" strokeWidth={1} />
            <text x={padL - 6} y={y(t) + 4} textAnchor="end" fontSize={10} fill="#64748b">{compact(t)}</text>
          </g>
        ))}
        {data.map((r, i) => {
          const v = num(r.sales), x = padL + i * bw + bw * 0.2, w = bw * 0.6, top = y(v), base = y(0)
          const hgt = Math.max(0, base - top)
          return (
            <g key={r.m} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={padL + i * bw} y={padT} width={bw} height={H - padT - padB} fill="transparent" />
              {hgt > 0 && <path d={roundTop(x, top, w, hgt, Math.min(4, hgt))} fill={hover === i ? '#115e59' : '#0f766e'} />}
              <text x={x + w / 2} y={H - 8} textAnchor="middle" fontSize={10} fill="#64748b">{monthTH(r.m)}</text>
            </g>
          )
        })}
      </svg>
      {h && hover != null && (
        <div className="pointer-events-none absolute top-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-md"
          style={{ left: `${((padL + hover * bw + bw / 2) / W) * 100}%`, transform: 'translateX(-50%)' }}>
          <div className="font-semibold">{monthTH(h.m)}</div>
          <div>ยอดขาย <b className="tabular-nums">{money(h.sales)}</b></div>
          <div>ต้นทุนขาย <span className="tabular-nums">{money(h.cost)}</span></div>
          <div>กำไรขั้นต้น <span className="tabular-nums">{money(num(h.sales) - num(h.cost))}</span></div>
        </div>
      )}
    </div>
  )
}
function roundTop(x: number, y: number, w: number, h: number, r: number) {
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`
}
function niceMax(v: number) {
  const p = Math.pow(10, Math.floor(Math.log10(v)))
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((m) => m >= v) ?? v
}
function compact(v: number) {
  if (v >= 1e6) return +(v / 1e6).toFixed(2) + 'M'
  if (v >= 1e3) return +(v / 1e3).toFixed(1) + 'K'
  return String(v)
}
