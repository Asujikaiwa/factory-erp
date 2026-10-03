import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Empty, Spinner } from '../components/ui'
import { DOCS } from '../config/docs'
import { bahtText, dateTH, money, num, qty } from '../lib/format'
import { fetchRef, type Row } from '../lib/refs'
import { loadSettings } from '../lib/settings'
import { check, supabase } from '../lib/supabase'

export default function PrintDoc() {
  const { docKey = '', id = '' } = useParams()
  const cfg = DOCS[docKey]
  const [data, setData] = useState<{ doc: Row; lines: Row[]; co: Row; partner: Row | null } | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!cfg?.print) return
    ;(async () => {
      const doc = check(await supabase.from(cfg.table).select('*').eq('id', id).single()) as Row
      let lines = check(await supabase.from(cfg.linesTable).select('*').eq(cfg.fk, id).order('id')) as Row[]
      const co = await loadSettings(true)
      let partner: Row | null = null
      if (cfg.print!.partner === 'customer' && doc.customer_id) partner = check(await supabase.from('customers').select('*').eq('id', doc.customer_id).single()) as Row
      if (cfg.print!.partner === 'supplier' && doc.supplier_id) partner = check(await supabase.from('suppliers').select('*').eq('id', doc.supplier_id).single()) as Row
      if (cfg.print!.partner === 'supplier' && !doc.supplier_id && doc.payee) partner = { name: doc.payee }

      // enrich lines
      if (lines.some((l) => l.item_id)) {
        const items = new Map((await fetchRef('items')).map((r) => [r.id, r]))
        lines = lines.map((l) => { const it = items.get(l.item_id); return { ...l, item_code: it?.code, item_name: it?.name, unit_name: it?.units?.name } })
      }
      if (lines.some((l) => l.open_item_id)) {
        const ids = lines.map((l) => l.open_item_id)
        const oi = new Map((check(await supabase.from('open_items').select('id,doc_no,doc_date').in('id', ids)) as Row[]).map((r) => [r.id, r]))
        lines = lines.map((l) => ({ ...l, bill_no: oi.get(l.open_item_id)?.doc_no, bill_date: dateTH(oi.get(l.open_item_id)?.doc_date) }))
      }
      if (lines.some((l) => l.account_id)) {
        const acc = new Map((await fetchRef('accounts')).map((r) => [r.id, r]))
        lines = lines.map((l) => ({ ...l, account_code: acc.get(l.account_id)?.code, account_name: acc.get(l.account_id)?.name }))
      }
      if (lines.some((l) => l.employee_id)) {
        const emp = new Map((await fetchRef('employees')).map((r) => [r.id, r]))
        lines = lines.map((l) => ({ ...l, emp_name: `${emp.get(l.employee_id)?.code ?? ''} ${emp.get(l.employee_id)?.full_name ?? ''}` }))
      }
      if (doc.carrier_id) doc.carrier_name = (await fetchRef('carriers')).find((c) => c.id === doc.carrier_id)?.name
      if (doc.invoice_id) doc.invoice_no = (check(await supabase.from('sales_invoices').select('doc_no').eq('id', doc.invoice_id).single()) as Row).doc_no
      setData({ doc, lines, co, partner })
    })().catch((e) => setErr((e as Error).message))
  }, [cfg, id])

  useEffect(() => { if (data) setTimeout(() => window.print(), 400) }, [data])

  if (!cfg?.print) return <Empty text="เอกสารนี้ไม่มีแบบพิมพ์" />
  if (err) return <Empty text={err} />
  if (!data) return <Spinner />
  const copies = cfg.print.copies ?? ['']
  return (
    <div className="bg-slate-200 py-6 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-4 flex max-w-[210mm] justify-end gap-2">
        <button className="btn-primary" onClick={() => window.print()}>🖨 พิมพ์</button>
        <button className="btn-secondary" onClick={() => window.close()}>ปิด</button>
      </div>
      {copies.map((c, i) => (
        <div key={c + i} style={{ breakAfter: i < copies.length - 1 ? 'page' : 'auto' }}>
          <Sheet cfg={cfg} {...data} copy={c} />
        </div>
      ))}
    </div>
  )
}

function Sheet({ cfg, doc, lines, co, partner, copy }: { cfg: typeof DOCS[string]; doc: Row; lines: Row[]; co: Row; partner: Row | null; copy: string }) {
  const p = cfg.print!
  const total = cfg.totals === 'vat' ? num(doc.total) : cfg.totals === 'sum' ? num(doc.total) : cfg.totals === 'payroll' ? num(doc.total_net) : 0
  const voided = doc.status === 'void' || doc.status === 'cancelled'
  return (
    <div className="print-page relative mx-auto mb-6 min-h-[297mm] w-full max-w-[210mm] bg-white p-[12mm] text-[12px] leading-snug text-black shadow print:mb-0 print:min-h-0">
      {voided && <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[90px] font-bold text-rose-500/20 -rotate-12">ยกเลิก</div>}
      {/* company */}
      <div className="flex items-start justify-between gap-4 border-b border-black pb-3">
        <div className="flex gap-3">
          {co.logo_url && <img src={co.logo_url} alt="" className="h-16 w-16 object-contain" />}
          <div>
            <div className="text-[16px] font-bold">{co.name}</div>
            {co.name_en && <div className="font-semibold">{co.name_en}</div>}
            <div className="whitespace-pre-line">{co.address}</div>
            <div>{co.phone && `โทร ${co.phone}`} {co.email && ` · ${co.email}`}</div>
            {co.tax_id && <div>เลขประจำตัวผู้เสียภาษี {co.tax_id} {co.branch && `(${co.branch})`}</div>}
          </div>
        </div>
        <div className="text-right">
          {copy && <div className="mb-1 inline-block border border-black px-2 text-[11px]">{copy}</div>}
          <div className="text-[18px] font-bold">{p.title}</div>
          {p.titleEn && <div className="text-[11px] tracking-wide">{p.titleEn}</div>}
        </div>
      </div>

      {/* partner + doc info */}
      <div className="mt-3 grid grid-cols-[1fr_auto] gap-4">
        <div className="min-h-20 rounded border border-black p-2">
          {partner ? <>
            <div className="text-[11px]">{p.partner === 'customer' ? 'ลูกค้า / Customer' : 'ผู้ขาย / Supplier'}</div>
            <div className="font-semibold">{partner.name} {partner.code && <span className="font-normal">({partner.code})</span>}</div>
            {partner.address && <div className="whitespace-pre-line">{partner.address}</div>}
            {doc.ship_to && doc.delivery_method === 'delivery' && <div>ส่งที่: {doc.ship_to}</div>}
            <div>{partner.phone && `โทร ${partner.phone}`}{partner.tax_id && ` · เลขผู้เสียภาษี ${partner.tax_id}`}{partner.branch && ` (${partner.branch})`}</div>
          </> : <div className="text-[11px]">{doc.description ?? doc.reason ?? ''}</div>}
        </div>
        <table className="self-start text-[12px]">
          <tbody>
            <tr><td className="pr-3">เลขที่</td><td className="font-semibold">{doc.doc_no}</td></tr>
            <tr><td className="pr-3">วันที่</td><td>{dateTH(doc.doc_date)}</td></tr>
            {p.info?.(doc).map((x) => <tr key={x.label}><td className="pr-3">{x.label}</td><td>{/^\d{4}-\d{2}-\d{2}$/.test(x.value) ? dateTH(x.value) : x.value}</td></tr>)}
          </tbody>
        </table>
      </div>

      {/* lines */}
      <table className="mt-3 w-full border-collapse">
        <thead><tr>
          <th className="border border-black px-1.5 py-1 text-center" style={{ width: '5%' }}>ลำดับ</th>
          {p.columns.map((c) => <th key={c.key} className="border border-black px-1.5 py-1 text-center" style={{ width: c.width }}>{c.label}</th>)}
        </tr></thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td className="border-x border-black px-1.5 py-0.5 text-center">{i + 1}</td>
              {p.columns.map((c) => (
                <td key={c.key} className={`border-x border-black px-1.5 py-0.5 ${c.align === 'right' ? 'text-right tabular-nums' : ''}`}>
                  {c.type === 'money' ? (num(l[c.key]) || c.key === 'amount' ? money(l[c.key]) : '') : c.type === 'qty' ? (num(l[c.key]) ? qty(l[c.key]) : '') : l[c.key]}
                </td>
              ))}
            </tr>
          ))}
          {Array.from({ length: Math.max(0, 10 - lines.length) }).map((_, i) => (
            <tr key={'e' + i}><td className="border-x border-black py-0.5">&nbsp;</td>{p.columns.map((c) => <td key={c.key} className="border-x border-black" />)}</tr>
          ))}
          <tr><td colSpan={p.columns.length + 1} className="border-t border-black" /></tr>
        </tbody>
      </table>

      {/* totals */}
      {p.totals && (
        <div className="mt-2 grid grid-cols-[1fr_auto] gap-4">
          <div className="self-end">
            <div className="rounded border border-black px-2 py-1 font-semibold">({bahtText(total)})</div>
            {doc.note && <div className="mt-2">หมายเหตุ: {doc.note}</div>}
          </div>
          <table className="text-[12px]">
            <tbody>
              {cfg.totals === 'vat' ? <>
                <tr><td className="pr-4">รวมเป็นเงิน</td><td className="text-right tabular-nums">{money(doc.subtotal)}</td></tr>
                <tr><td className="pr-4">ภาษีมูลค่าเพิ่ม {doc.vat_type === 'none' ? '' : `${co.vat_rate}%`}</td><td className="text-right tabular-nums">{money(doc.vat_amount)}</td></tr>
                <tr className="font-bold"><td className="border-t border-black pr-4">จำนวนเงินรวมทั้งสิ้น</td><td className="border-t border-black text-right tabular-nums">{money(doc.total)}</td></tr>
              </> : <>
                <tr className="font-bold"><td className="pr-4">รวมทั้งสิ้น</td><td className="text-right tabular-nums">{money(total)}</td></tr>
                {num(doc.wht_amount) > 0 && <tr><td className="pr-4">หัก ณ ที่จ่าย</td><td className="text-right tabular-nums">{money(doc.wht_amount)}</td></tr>}
                {num(doc.wht_amount) > 0 && <tr className="font-bold"><td className="pr-4">ยอดชำระสุทธิ</td><td className="text-right tabular-nums">{money(total - num(doc.wht_amount) - num(doc.fee_amount))}</td></tr>}
              </>}
            </tbody>
          </table>
        </div>
      )}
      {!p.totals && doc.note && <div className="mt-2">หมายเหตุ: {doc.note}</div>}
      {cfg.totals === 'dc' && (
        <div className="mt-2 text-right font-semibold">รวมเดบิต {money(lines.reduce((s, l) => s + num(l.debit), 0))} · รวมเครดิต {money(lines.reduce((s, l) => s + num(l.credit), 0))}</div>
      )}

      {/* signatures */}
      <div className="mt-12 grid gap-6" style={{ gridTemplateColumns: `repeat(${p.signatures.length}, 1fr)` }}>
        {p.signatures.map((s) => (
          <div key={s} className="text-center">
            <div className="mx-4 border-b border-dotted border-black pt-8" />
            <div className="mt-1">{s}</div>
            <div className="text-[11px]">วันที่ ......./......./.......</div>
          </div>
        ))}
      </div>
    </div>
  )
}
