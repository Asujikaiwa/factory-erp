import { lineAmount, payrollNet } from '../components/DocPage'
import { addDays, monthEnd, monthStart, num, today } from '../lib/format'
import { fetchRef, type Row } from '../lib/refs'
import { VAT_OPTIONS } from '../lib/settings'
import { check, supabase } from '../lib/supabase'
import type { DocConfig, FieldDef } from './types'

/* ---------- reusable field builders ---------- */
const date = (key = 'doc_date', label = 'วันที่', required = true): FieldDef => ({ key, label, type: 'date', required, default: key === 'doc_date' ? today() : undefined })
const note: FieldDef = { key: 'note', label: 'หมายเหตุ', type: 'text', span: 2 }
const vat: FieldDef = { key: 'vat_type', label: 'ภาษีมูลค่าเพิ่ม', type: 'select', options: VAT_OPTIONS, required: true, default: 'exclude' }
const wh = (key = 'warehouse_id', label = 'คลังสินค้า', required = true): FieldDef => ({ key, label, type: 'ref', ref: 'warehouses', required })
const customer: FieldDef = { key: 'customer_id', label: 'ลูกค้า', type: 'ref', ref: 'customers', required: true, span: 2 }
const supplier: FieldDef = { key: 'supplier_id', label: 'ผู้ขาย / ซัพพลายเออร์', type: 'ref', ref: 'suppliers', required: true, span: 2 }
const cashAcc = (label = 'รับ/จ่ายผ่านบัญชี'): FieldDef => ({ key: 'account_id', label, type: 'ref', ref: 'cash_accounts', required: true })

const item = (where?: (r: Row) => boolean): FieldDef => ({ key: 'item_id', label: 'สินค้า/วัตถุดิบ', type: 'ref', ref: 'items', required: true, width: '260px', refWhere: where })
const qtyF: FieldDef = { key: 'qty', label: 'จำนวน', type: 'number', required: true, width: '90px' }
const price: FieldDef = { key: 'unit_price', label: 'ราคา/หน่วย', type: 'money', required: true, default: 0, width: '110px' }
const disc: FieldDef = { key: 'discount_pct', label: 'ส่วนลด %', type: 'number', default: 0, width: '70px' }
const amount: FieldDef = { key: 'amount', label: 'จำนวนเงิน', type: 'money', compute: (l) => lineAmount(l) }
const lineNote: FieldDef = { key: 'note', label: 'หมายเหตุ', type: 'text', width: '140px' }
const priceLines = (where?: (r: Row) => boolean): FieldDef[] => [item(where), qtyF, price, disc, amount, lineNote]

const vatTotalsCols = [
  { key: 'doc_no', label: 'เลขที่' }, { key: 'doc_date', label: 'วันที่', type: 'date' as const },
]

/** sales line: when item picked, fill customer price */
async function salesLineChange(line: Row, key: string, header: Row) {
  if (key !== 'item_id' || !line.item_id) return
  const { data } = await supabase.rpc('price_for', { p_customer: header.customer_id ?? null, p_item: line.item_id })
  return { unit_price: Number(data ?? 0) }
}
/** purchase line: default to item standard cost */
async function purchaseLineChange(line: Row, key: string) {
  if (key !== 'item_id' || !line.item_id) return
  const items = await fetchRef('items')
  const it = items.find((r) => r.id === line.item_id)
  return { unit_price: Number(it?.std_cost ?? 0) }
}

const SALES_PRINT_COLS = [
  { key: 'item_code', label: 'รหัส', width: '12%' },
  { key: 'item_name', label: 'รายการ' },
  { key: 'qty', label: 'จำนวน', type: 'qty' as const, align: 'right' as const, width: '10%' },
  { key: 'unit_name', label: 'หน่วย', width: '8%' },
  { key: 'unit_price', label: 'ราคา/หน่วย', type: 'money' as const, align: 'right' as const, width: '12%' },
  { key: 'discount_pct', label: 'ลด%', type: 'qty' as const, align: 'right' as const, width: '6%' },
  { key: 'amount', label: 'จำนวนเงิน', type: 'money' as const, align: 'right' as const, width: '14%' },
]

/* =====================================================================
   DOCUMENT REGISTRY
   ===================================================================== */
export const DOCS: Record<string, DocConfig> = {
  /* ---------------- Purchasing ---------------- */
  purchase_requests: {
    key: 'purchase_requests', title: 'ใบขอซื้อ (PR)', short: 'ใบขอซื้อ', table: 'purchase_requests', linesTable: 'purchase_request_lines', fk: 'doc_id',
    read: ['purchasing', 'warehouse', 'production'], write: ['purchasing', 'warehouse', 'production'],
    header: [date(), date('need_date', 'ต้องการใช้วันที่', false), { key: 'department_id', label: 'แผนก', type: 'ref', ref: 'departments' }, note],
    lines: [item(), qtyF, lineNote],
    list: [...vatTotalsCols, { key: 'need_date', label: 'ต้องการใช้', type: 'date' }, { key: 'department_id', label: 'แผนก', type: 'ref', ref: 'departments' }, { key: 'note', label: 'หมายเหตุ' }],
    totals: 'none', approve: true,
    actions: [{
      label: '→ สร้างใบสั่งซื้อ', variant: 'primary', roles: ['purchasing'], show: (d) => d.status === 'approved',
      run: async (d, ctx) => {
        const v = await ctx.ask('สร้างใบสั่งซื้อจากใบขอซื้อ', [{ key: 'supplier_id', label: 'ผู้ขาย', type: 'ref', ref: 'suppliers', required: true }])
        if (!v) return
        const id = check(await supabase.rpc('create_po_from_pr', { p_pr: d.id, p_supplier: v.supplier_id }))
        return `/d/purchase_orders/${id}`
      },
    }],
  },

  purchase_orders: {
    key: 'purchase_orders', title: 'ใบสั่งซื้อ (PO)', short: 'ใบสั่งซื้อ', table: 'purchase_orders', linesTable: 'purchase_order_lines', fk: 'doc_id',
    read: ['purchasing', 'warehouse', 'accounting'], write: ['purchasing'],
    header: [date(), supplier, date('expected_date', 'กำหนดส่ง', false), { key: 'credit_days', label: 'เครดิต (วัน)', type: 'number', default: 0 }, vat, note],
    lines: priceLines(), totals: 'vat', approve: true,
    list: [...vatTotalsCols, { key: 'supplier_id', label: 'ผู้ขาย', type: 'ref', ref: 'suppliers' }, { key: 'expected_date', label: 'กำหนดส่ง', type: 'date' }, { key: 'total', label: 'ยอดรวม', type: 'money' }],
    onLineChange: purchaseLineChange,
    onHeaderChange: (_h, key, row) => (key === 'supplier_id' && row ? { credit_days: row.credit_days } : undefined),
    actions: [{
      label: '→ รับสินค้าเข้า', variant: 'primary', roles: ['purchasing', 'warehouse'], show: (d) => d.status === 'approved',
      run: async (d, ctx) => {
        const v = await ctx.ask('รับสินค้าตามใบสั่งซื้อ', [wh('warehouse_id', 'รับเข้าคลัง')])
        if (!v) return
        const id = check(await supabase.rpc('create_gr_from_po', { p_po: d.id, p_wh: v.warehouse_id }))
        return `/d/goods_receipts/${id}`
      },
    }],
    print: {
      title: 'ใบสั่งซื้อ', titleEn: 'PURCHASE ORDER', partner: 'supplier', columns: SALES_PRINT_COLS, totals: true,
      signatures: ['ผู้จัดทำ', 'ผู้อนุมัติ'],
      info: (d) => [{ label: 'กำหนดส่ง', value: d.expected_date ?? '-' }, { label: 'เครดิต', value: `${d.credit_days ?? 0} วัน` }],
    },
  },

  goods_receipts: {
    key: 'goods_receipts', title: 'ใบรับสินค้า / ตั้งหนี้ (GR)', short: 'ใบรับสินค้า', table: 'goods_receipts', linesTable: 'goods_receipt_lines', fk: 'doc_id',
    read: ['purchasing', 'warehouse', 'accounting'], write: ['purchasing', 'warehouse'],
    help: 'บันทึกแล้ว = เพิ่มสต๊อก + ตั้งเจ้าหนี้ + ลงบัญชีอัตโนมัติ',
    header: [date(), supplier, wh('warehouse_id', 'รับเข้าคลัง'), vat,
      { key: 'supplier_doc_no', label: 'เลขที่ใบกำกับ/ใบส่งของผู้ขาย', type: 'text' }, date('supplier_doc_date', 'วันที่ใบกำกับผู้ขาย', false),
      date('due_date', 'ครบกำหนดชำระ', false), note],
    lines: [item(), qtyF, price, disc, amount, { key: 'lot_no', label: 'Lot', type: 'text', width: '110px' }, { key: 'mfg_date', label: 'วันผลิต', type: 'date', width: '130px' }, { key: 'exp_date', label: 'วันหมดอายุ', type: 'date', width: '130px' }],
    keepLineKeys: ['po_line_id'], totals: 'vat', voidable: true,
    post: { rpc: 'post_goods_receipt', label: 'รับเข้าสต๊อก', roles: ['purchasing', 'warehouse', 'accounting'] },
    list: [...vatTotalsCols, { key: 'supplier_id', label: 'ผู้ขาย', type: 'ref', ref: 'suppliers' }, { key: 'supplier_doc_no', label: 'เลขที่ผู้ขาย' }, { key: 'warehouse_id', label: 'คลัง', type: 'ref', ref: 'warehouses' }, { key: 'total', label: 'ยอดรวม', type: 'money' }],
    onLineChange: purchaseLineChange,
    print: { title: 'ใบรับสินค้า', titleEn: 'GOODS RECEIPT', partner: 'supplier', columns: SALES_PRINT_COLS, totals: true, signatures: ['ผู้ส่งของ', 'ผู้รับของ', 'ผู้ตรวจสอบ'], info: (d) => [{ label: 'เลขที่ใบกำกับผู้ขาย', value: d.supplier_doc_no ?? '-' }] },
  },

  supplier_payments: {
    key: 'supplier_payments', title: 'จ่ายชำระหนี้ผู้ขาย (PV)', short: 'ใบสำคัญจ่าย', table: 'supplier_payments', linesTable: 'supplier_payment_lines', fk: 'doc_id',
    read: ['purchasing', 'accounting'], write: ['purchasing', 'accounting'],
    header: [date(), supplier, cashAcc('จ่ายจากบัญชี'), { key: 'ref_no', label: 'เลขที่เช็ค/อ้างอิงการโอน', type: 'text' }, { key: 'wht_amount', label: 'หัก ณ ที่จ่าย (บาท)', type: 'money', default: 0 }, note],
    lines: [
      { key: 'open_item_id', label: 'บิลที่ค้างชำระ', type: 'ref', ref: 'open_ap', required: true, width: '320px', refFilter: (h) => ({ supplier_id: h.supplier_id ?? -1 }) },
      { key: 'amount', label: 'ยอดชำระ', type: 'money', required: true },
    ],
    totals: 'sum', voidable: true, post: { rpc: 'post_supplier_payment', label: 'บันทึกจ่ายเงิน' },
    onLineChange: async (l, key) => {
      if (key !== 'open_item_id' || !l.open_item_id) return
      const r = check(await supabase.from('v_open_items').select('outstanding').eq('id', l.open_item_id).single()) as Row
      return { amount: Number(r.outstanding) }
    },
    actions: [{
      label: 'ดึงบิลค้างทั้งหมด', show: (d) => d.status === 'draft' && !!d.supplier_id, saveFirst: false,
      run: async (d, ctx) => {
        const rows = check(await supabase.from('v_open_items').select('id,outstanding').eq('side', 'ap').eq('supplier_id', d.supplier_id).neq('outstanding', 0).order('due_date')) as Row[]
        ctx.setLines(() => rows.map((r) => ({ open_item_id: r.id, amount: Number(r.outstanding) })))
      },
    }],
    list: [...vatTotalsCols, { key: 'supplier_id', label: 'ผู้ขาย', type: 'ref', ref: 'suppliers' }, { key: 'ref_no', label: 'อ้างอิง' }, { key: 'total', label: 'ยอดชำระ', type: 'money' }],
    print: { title: 'ใบสำคัญจ่าย', titleEn: 'PAYMENT VOUCHER', partner: 'supplier', columns: [{ key: 'bill_no', label: 'เลขที่บิล' }, { key: 'bill_date', label: 'วันที่บิล' }, { key: 'amount', label: 'ยอดชำระ', type: 'money', align: 'right' }], totals: true, signatures: ['ผู้จัดทำ', 'ผู้อนุมัติ', 'ผู้รับเงิน'] },
  },

  /* ---------------- Inventory ---------------- */
  stock_adjustments: {
    key: 'stock_adjustments', title: 'รับ/เบิก/โอน/ตรวจนับ สต๊อก', short: 'ใบปรับสต๊อก', table: 'stock_adjustments', linesTable: 'stock_adjustment_lines', fk: 'doc_id',
    read: ['warehouse', 'production', 'accounting'], write: ['warehouse', 'production'],
    help: 'ยอดยกมา · รับเข้าอื่นๆ · เบิกใช้/ตัดเสีย · โอนระหว่างคลัง · ตรวจนับ (ใส่จำนวนที่นับได้จริง)',
    header: [date(),
      { key: 'adj_type', label: 'ประเภท', type: 'select', required: true, default: 'out', options: [
        { value: 'opening', label: 'ยอดยกมา (ตั้งต้นระบบ)' }, { value: 'in', label: 'รับเข้าอื่นๆ' }, { value: 'out', label: 'เบิกใช้ / ตัดเสียหาย' },
        { value: 'transfer', label: 'โอนระหว่างคลัง' }, { value: 'count', label: 'ตรวจนับ (ปรับยอดตามจริง)' }] },
      wh('warehouse_id', 'คลัง'),
      { ...wh('to_warehouse_id', 'โอนไปคลัง', true), show: (h) => h.adj_type === 'transfer' },
      { key: 'offset_account_id', label: 'บัญชีคู่ (ว่าง = ค่าเริ่มต้น)', type: 'ref', ref: 'accounts', show: (h) => h.adj_type !== 'transfer' },
      { key: 'reason', label: 'เหตุผล', type: 'text', span: 2 }],
    lines: [item(),
      { key: 'qty', label: 'จำนวน / จำนวนที่นับได้', type: 'number', required: true },
      { key: 'unit_cost', label: 'ทุน/หน่วย (รับเข้า)', type: 'money', width: '110px' },
      { key: 'lot_id', label: 'ล็อตที่มีอยู่ (ว่าง=FEFO)', type: 'ref', ref: 'lots', width: '220px', refFilter: (h) => ({ warehouse_id: h.warehouse_id ?? -1 }) },
      { key: 'lot_no', label: 'Lot ใหม่ (รับเข้า)', type: 'text', width: '110px' },
      { key: 'exp_date', label: 'วันหมดอายุ', type: 'date', width: '130px' }, lineNote],
    totals: 'none', voidable: true, post: { rpc: 'post_stock_adjustment', label: 'บันทึกปรับสต๊อก' },
    list: [...vatTotalsCols, { key: 'adj_type', label: 'ประเภท', type: 'select', options: [{ value: 'opening', label: 'ยอดยกมา' }, { value: 'in', label: 'รับเข้า' }, { value: 'out', label: 'เบิก/ตัดเสีย' }, { value: 'transfer', label: 'โอน' }, { value: 'count', label: 'ตรวจนับ' }] }, { key: 'warehouse_id', label: 'คลัง', type: 'ref', ref: 'warehouses' }, { key: 'reason', label: 'เหตุผล' }],
    print: { title: 'ใบปรับปรุงสต๊อก', titleEn: 'STOCK ADJUSTMENT', partner: 'none', columns: [{ key: 'item_code', label: 'รหัส' }, { key: 'item_name', label: 'รายการ' }, { key: 'qty', label: 'จำนวน', type: 'qty', align: 'right' }, { key: 'unit_name', label: 'หน่วย' }, { key: 'note', label: 'หมายเหตุ' }], signatures: ['ผู้เบิก/ผู้นับ', 'ผู้จ่าย/ผู้ตรวจ', 'ผู้อนุมัติ'] },
  },

  /* ---------------- Production ---------------- */
  boms: {
    key: 'boms', title: 'สูตรการผลิต (BOM)', short: 'สูตรการผลิต', table: 'boms', linesTable: 'bom_lines', fk: 'bom_id', statusless: true,
    read: ['production', 'warehouse', 'purchasing', 'accounting'], write: ['production'],
    help: 'ปริมาณวัตถุดิบ + บรรจุภัณฑ์ ต่อ "จำนวนผลผลิต" ที่กำหนด — ใช้ตัดสต๊อกอัตโนมัติเวลาบันทึกผลิต/แพ็ค',
    header: [
      { key: 'item_id', label: 'สินค้าที่ผลิต', type: 'ref', ref: 'items', required: true, span: 2, refWhere: (r) => r.type === 'finished' || r.type === 'other' },
      { key: 'name', label: 'ชื่อสูตร', type: 'text', required: true },
      { key: 'output_qty', label: 'ผลผลิตต่อสูตร (หน่วยสินค้า)', type: 'number', required: true, default: 1 },
      { key: 'is_default', label: 'สูตรหลัก', type: 'checkbox', default: true },
      { key: 'active', label: 'ใช้งาน', type: 'checkbox', default: true }, note],
    lines: [item((r) => r.type !== 'finished'), { key: 'qty', label: 'ปริมาณที่ใช้', type: 'number', required: true }, { key: 'scrap_pct', label: 'เผื่อสูญเสีย %', type: 'number', default: 0 }, lineNote],
    totals: 'none',
    list: [{ key: 'name', label: 'ชื่อสูตร' }, { key: 'item_id', label: 'สินค้า', type: 'ref', ref: 'items' }, { key: 'output_qty', label: 'ผลผลิต/สูตร' }, { key: 'is_default', label: 'สูตรหลัก' }, { key: 'active', label: 'ใช้งาน' }],
    onHeaderChange: (h, key, row) => (key === 'item_id' && row && !h.name ? { name: `สูตร ${row.name}` } : undefined),
  },

  production_orders: {
    key: 'production_orders', title: 'ใบสั่งผลิต / บันทึกผลิต-แพ็ค (MO)', short: 'ใบผลิต', table: 'production_orders', linesTable: 'production_order_lines', fk: 'doc_id',
    read: ['production', 'warehouse', 'accounting'], write: ['production'],
    help: 'กรอกจำนวนที่ผลิต/แพ็คได้ → กด "ดึงวัตถุดิบจากสูตร" → บันทึกผลิต = ตัดวัตถุดิบ+บรรจุภัณฑ์ และรับสินค้าสำเร็จรูปเข้าคลัง',
    header: [date(),
      { key: 'item_id', label: 'สินค้าที่ผลิต', type: 'ref', ref: 'items', required: true, span: 2, refWhere: (r) => r.type === 'finished' || r.type === 'other' },
      { key: 'bom_id', label: 'สูตร (ว่าง = สูตรหลัก)', type: 'ref', ref: 'boms', refFilter: (h) => ({ item_id: h.item_id ?? -1 }) },
      { key: 'planned_qty', label: 'จำนวนที่วางแผน', type: 'number', default: 0 },
      { key: 'output_qty', label: 'จำนวนที่ผลิตได้จริง', type: 'number', default: 0, hint: 'หน่วยตามสินค้า เช่น ลัง' },
      wh('source_warehouse_id', 'เบิกวัตถุดิบจากคลัง'), wh('warehouse_id', 'รับสินค้าเข้าคลัง'),
      { key: 'lot_no', label: 'Lot ที่ผลิต (ว่าง = อัตโนมัติ)', type: 'text' }, date('mfg_date', 'วันผลิต', false), date('exp_date', 'วันหมดอายุ (ว่าง=ตามอายุสินค้า)', false),
      { key: 'extra_cost', label: 'ค่าแรง/โสหุ้ยปันส่วน (บาท)', type: 'money', default: 0 },
      { key: 'shift', label: 'กะ', type: 'select', options: [{ value: 'เช้า', label: 'เช้า' }, { value: 'บ่าย', label: 'บ่าย' }, { value: 'ดึก', label: 'ดึก' }] },
      { key: 'total_cost', label: 'ต้นทุนรวม', type: 'money', readOnly: true, show: (h) => h.status === 'posted' },
      { key: 'unit_cost', label: 'ต้นทุน/หน่วย', type: 'money', readOnly: true, show: (h) => h.status === 'posted' },
      note],
    lines: [item((r) => r.type !== 'finished'), { key: 'qty', label: 'ปริมาณที่ใช้จริง', type: 'number', required: true }, { key: 'lot_id', label: 'ล็อต (ว่าง=FEFO)', type: 'ref', ref: 'lots', width: '220px', refFilter: (h) => ({ warehouse_id: h.source_warehouse_id ?? -1 }) }, lineNote],
    totals: 'none', voidable: true, post: { rpc: 'post_production', label: 'บันทึกผลิต' },
    actions: [{
      label: '⚙ ดึงวัตถุดิบจากสูตร', show: (d) => d.status === 'draft',
      run: async (d, ctx) => {
        check(await supabase.from('production_order_lines').delete().eq('doc_id', d.id))
        check(await supabase.rpc('fill_production_lines', { p_id: d.id }))
        if (window.location.pathname.endsWith('/new')) return `/d/production_orders/${d.id}`
        await ctx.reload()
      },
    }],
    list: [...vatTotalsCols, { key: 'item_id', label: 'สินค้า', type: 'ref', ref: 'items' }, { key: 'output_qty', label: 'ผลิตได้' }, { key: 'lot_no', label: 'Lot' }, { key: 'shift', label: 'กะ' }, { key: 'total_cost', label: 'ต้นทุนรวม', type: 'money' }],
    print: { title: 'ใบสั่งผลิต / ใบเบิกวัตถุดิบ', titleEn: 'PRODUCTION ORDER', partner: 'none', columns: [{ key: 'item_code', label: 'รหัส' }, { key: 'item_name', label: 'วัตถุดิบ/บรรจุภัณฑ์' }, { key: 'qty', label: 'จำนวน', type: 'qty', align: 'right' }, { key: 'unit_name', label: 'หน่วย' }], signatures: ['ผู้สั่งผลิต', 'ผู้เบิก', 'ผู้จ่ายวัตถุดิบ'], info: (d) => [{ label: 'ผลิตได้', value: String(d.output_qty) }, { label: 'Lot', value: d.lot_no ?? '-' }] },
  },

  /* ---------------- Sales ---------------- */
  quotations: {
    key: 'quotations', title: 'ใบเสนอราคา (QT)', short: 'ใบเสนอราคา', table: 'quotations', linesTable: 'quotation_lines', fk: 'doc_id',
    read: ['sales', 'accounting'], write: ['sales'],
    header: [date(), customer, date('valid_until', 'ยืนราคาถึง', false), vat, note],
    lines: priceLines(), totals: 'vat', approve: true, onLineChange: salesLineChange,
    onHeaderChange: (h, key) => (key === 'doc_date' && !h.valid_until ? { valid_until: addDays(h.doc_date, 30) } : undefined),
    list: [...vatTotalsCols, { key: 'customer_id', label: 'ลูกค้า', type: 'ref', ref: 'customers' }, { key: 'valid_until', label: 'ยืนราคาถึง', type: 'date' }, { key: 'total', label: 'ยอดรวม', type: 'money' }],
    actions: [{
      label: '→ สร้างใบสั่งขาย', variant: 'primary', roles: ['sales'], show: (d) => d.status === 'approved',
      run: async (d) => `/d/sales_orders/${check(await supabase.rpc('create_so_from_quotation', { p_qt: d.id }))}`,
    }],
    print: { title: 'ใบเสนอราคา', titleEn: 'QUOTATION', partner: 'customer', columns: SALES_PRINT_COLS, totals: true, signatures: ['ผู้เสนอราคา', 'ผู้อนุมัติ', 'ลูกค้ายืนยันสั่งซื้อ'], info: (d) => [{ label: 'ยืนราคาถึง', value: d.valid_until ?? '-' }] },
  },

  sales_orders: {
    key: 'sales_orders', title: 'ใบสั่งขาย (SO)', short: 'ใบสั่งขาย', table: 'sales_orders', linesTable: 'sales_order_lines', fk: 'doc_id',
    read: ['sales', 'warehouse', 'production', 'accounting'], write: ['sales'],
    header: [date(), customer, { key: 'customer_po', label: 'เลขที่ PO ลูกค้า', type: 'text' }, date('delivery_date', 'กำหนดส่ง', false), vat, note],
    lines: priceLines(), totals: 'vat', approve: true, onLineChange: salesLineChange,
    list: [...vatTotalsCols, { key: 'customer_id', label: 'ลูกค้า', type: 'ref', ref: 'customers' }, { key: 'delivery_date', label: 'กำหนดส่ง', type: 'date' }, { key: 'total', label: 'ยอดรวม', type: 'money' }],
    actions: [{
      label: '→ ออกบิลส่งของ', variant: 'primary', roles: ['sales'], show: (d) => d.status === 'approved',
      run: async (d, ctx) => {
        const v = await ctx.ask('ออกบิลจากใบสั่งขาย', [wh('warehouse_id', 'ตัดสต๊อกจากคลัง')])
        if (!v) return
        return `/d/sales_invoices/${check(await supabase.rpc('create_invoice_from_so', { p_so: d.id, p_wh: v.warehouse_id }))}`
      },
    }],
    print: { title: 'ใบสั่งขาย', titleEn: 'SALES ORDER', partner: 'customer', columns: SALES_PRINT_COLS, totals: true, signatures: ['ผู้รับคำสั่งซื้อ', 'ผู้อนุมัติ'] },
  },

  sales_invoices: {
    key: 'sales_invoices', title: 'บิลส่งของ / ใบกำกับภาษี (IV)', short: 'บิลส่งของ', table: 'sales_invoices', linesTable: 'sales_invoice_lines', fk: 'doc_id',
    read: ['sales', 'warehouse', 'accounting'], write: ['sales'],
    help: 'บันทึกแล้ว = ตัดสต๊อก (FEFO ตามวันหมดอายุ) + ตั้งลูกหนี้ + ลงบัญชีขาย/ต้นทุนขาย/ภาษีขาย',
    header: [date(), customer, wh('warehouse_id', 'ตัดสต๊อกจากคลัง'),
      { key: 'delivery_method', label: 'การจัดส่ง', type: 'select', required: true, default: 'pickup', options: [{ value: 'pickup', label: 'ลูกค้ามารับเอง' }, { value: 'delivery', label: 'ส่งหน้าร้าน (ผ่านขนส่ง)' }] },
      { key: 'carrier_id', label: 'ขนส่ง', type: 'ref', ref: 'carriers', required: true, show: (h) => h.delivery_method === 'delivery' },
      { key: 'ship_to', label: 'ที่อยู่จัดส่ง', type: 'text', span: 2, show: (h) => h.delivery_method === 'delivery' },
      { key: 'customer_po', label: 'เลขที่ PO ลูกค้า', type: 'text' }, date('due_date', 'ครบกำหนดชำระ', false), vat, note],
    lines: [item(), qtyF, price, disc, amount, { key: 'lot_id', label: 'ล็อต (ว่าง=FEFO)', type: 'ref', ref: 'lots', width: '200px', refFilter: (h) => ({ warehouse_id: h.warehouse_id ?? -1 }) }, lineNote],
    keepLineKeys: ['so_line_id'], totals: 'vat', voidable: true, onLineChange: salesLineChange,
    onHeaderChange: (_h, key, row) => (key === 'customer_id' && row ? { delivery_method: row.default_delivery, ship_to: row.ship_address ?? row.address } : undefined),
    post: { rpc: 'post_sales_invoice', label: 'ยืนยันบิล + ตัดสต๊อก', confirm: 'ยืนยันออกบิลและตัดสต๊อก?' },
    list: [...vatTotalsCols, { key: 'customer_id', label: 'ลูกค้า', type: 'ref', ref: 'customers' }, { key: 'delivery_method', label: 'การจัดส่ง', type: 'select', options: [{ value: 'pickup', label: 'มารับเอง' }, { value: 'delivery', label: 'ส่งหน้าร้าน' }] }, { key: 'due_date', label: 'ครบกำหนด', type: 'date' }, { key: 'total', label: 'ยอดรวม', type: 'money' }],
    print: {
      title: 'ใบส่งของ / ใบกำกับภาษี', titleEn: 'DELIVERY ORDER / TAX INVOICE', partner: 'customer', columns: SALES_PRINT_COLS, totals: true,
      signatures: ['ผู้รับสินค้า', 'ผู้ส่งสินค้า', 'ผู้มีอำนาจลงนาม'], copies: ['ต้นฉบับ', 'สำเนา'],
      info: (d) => [
        { label: 'การจัดส่ง', value: d.delivery_method === 'delivery' ? 'ส่งหน้าร้าน' : 'ลูกค้ามารับเอง' },
        ...(d.delivery_method === 'delivery' ? [{ label: 'ขนส่ง', value: d.carrier_name ?? '' }] : []),
        { label: 'ครบกำหนดชำระ', value: d.due_date ?? '-' }, { label: 'PO ลูกค้า', value: d.customer_po ?? '-' }],
    },
  },

  credit_notes: {
    key: 'credit_notes', title: 'ใบลดหนี้ / รับคืนสินค้า (CN)', short: 'ใบลดหนี้', table: 'credit_notes', linesTable: 'credit_note_lines', fk: 'doc_id',
    read: ['sales', 'accounting'], write: ['sales', 'accounting'],
    header: [date(), customer, { key: 'invoice_id', label: 'อ้างอิงบิลเดิม', type: 'ref', ref: 'sales_invoices', refFilter: (h) => ({ customer_id: h.customer_id ?? -1 }) },
      { key: 'return_stock', label: 'รับสินค้าคืนเข้าสต๊อก', type: 'checkbox', default: true },
      { ...wh('warehouse_id', 'รับคืนเข้าคลัง', false), show: (h) => !!h.return_stock },
      { key: 'reason', label: 'เหตุผล', type: 'text', required: true, span: 2 }, vat, note],
    lines: priceLines(), totals: 'vat', voidable: true, onLineChange: salesLineChange,
    post: { rpc: 'post_credit_note', label: 'บันทึกใบลดหนี้' },
    list: [...vatTotalsCols, { key: 'customer_id', label: 'ลูกค้า', type: 'ref', ref: 'customers' }, { key: 'reason', label: 'เหตุผล' }, { key: 'total', label: 'ยอดรวม', type: 'money' }],
    print: { title: 'ใบลดหนี้', titleEn: 'CREDIT NOTE', partner: 'customer', columns: SALES_PRINT_COLS, totals: true, signatures: ['ผู้จัดทำ', 'ผู้อนุมัติ'], info: (d) => [{ label: 'เหตุผล', value: d.reason ?? '' }, { label: 'อ้างอิงบิล', value: d.invoice_no ?? '-' }] },
  },

  receipts: {
    key: 'receipts', title: 'รับชำระเงินลูกค้า (RE)', short: 'ใบเสร็จรับเงิน', table: 'receipts', linesTable: 'receipt_lines', fk: 'doc_id',
    read: ['sales', 'accounting'], write: ['sales', 'accounting'],
    header: [date(), customer, cashAcc('รับเข้าบัญชี'), { key: 'ref_no', label: 'เลขที่เช็ค/อ้างอิงการโอน', type: 'text' },
      { key: 'wht_amount', label: 'ลูกค้าหัก ณ ที่จ่าย (บาท)', type: 'money', default: 0 }, { key: 'fee_amount', label: 'ค่าธรรมเนียมธนาคาร', type: 'money', default: 0 }, note],
    lines: [
      { key: 'open_item_id', label: 'บิลค้างชำระ', type: 'ref', ref: 'open_ar', required: true, width: '320px', refFilter: (h) => ({ customer_id: h.customer_id ?? -1 }) },
      { key: 'amount', label: 'ยอดรับชำระ', type: 'money', required: true },
    ],
    totals: 'sum', voidable: true, post: { rpc: 'post_receipt', label: 'บันทึกรับเงิน' },
    onLineChange: async (l, key) => {
      if (key !== 'open_item_id' || !l.open_item_id) return
      const r = check(await supabase.from('v_open_items').select('outstanding').eq('id', l.open_item_id).single()) as Row
      return { amount: Number(r.outstanding) }
    },
    actions: [{
      label: 'ดึงบิลค้างทั้งหมด', show: (d) => d.status === 'draft' && !!d.customer_id, saveFirst: false,
      run: async (d, ctx) => {
        const rows = check(await supabase.from('v_open_items').select('id,outstanding').eq('side', 'ar').eq('customer_id', d.customer_id).neq('outstanding', 0).order('due_date')) as Row[]
        ctx.setLines(() => rows.map((r) => ({ open_item_id: r.id, amount: Number(r.outstanding) })))
      },
    }],
    list: [...vatTotalsCols, { key: 'customer_id', label: 'ลูกค้า', type: 'ref', ref: 'customers' }, { key: 'ref_no', label: 'อ้างอิง' }, { key: 'total', label: 'ยอดรับ', type: 'money' }],
    print: { title: 'ใบเสร็จรับเงิน', titleEn: 'RECEIPT', partner: 'customer', columns: [{ key: 'bill_no', label: 'เลขที่บิล' }, { key: 'bill_date', label: 'วันที่บิล' }, { key: 'amount', label: 'จำนวนเงิน', type: 'money', align: 'right' }], totals: true, signatures: ['ผู้รับเงิน', 'ผู้มีอำนาจลงนาม'], copies: ['ต้นฉบับ', 'สำเนา'] },
  },

  /* ---------------- Accounting ---------------- */
  expenses: {
    key: 'expenses', title: 'บันทึกค่าใช้จ่าย (EX)', short: 'ใบบันทึกค่าใช้จ่าย', table: 'expenses', linesTable: 'expense_lines', fk: 'doc_id',
    read: ['accounting', 'purchasing'], write: ['accounting', 'purchasing'],
    header: [date(), { key: 'supplier_id', label: 'ผู้ขาย (ถ้ามี)', type: 'ref', ref: 'suppliers', span: 2 }, { key: 'payee', label: 'จ่ายให้ (ชื่อ)', type: 'text' },
      { key: 'pay_method', label: 'การชำระ', type: 'select', required: true, default: 'cash', options: [{ value: 'cash', label: 'จ่ายทันที (เงินสด/โอน)' }, { value: 'credit', label: 'เงินเชื่อ (ตั้งเจ้าหนี้)' }] },
      { ...cashAcc('จ่ายจากบัญชี'), show: (h) => h.pay_method === 'cash' },
      { key: 'supplier_doc_no', label: 'เลขที่ใบกำกับ/ใบเสร็จผู้ขาย', type: 'text' },
      { ...date('due_date', 'ครบกำหนดชำระ', false), show: (h) => h.pay_method === 'credit' },
      { ...vat, default: 'none' }, { key: 'wht_amount', label: 'หัก ณ ที่จ่าย (บาท)', type: 'money', default: 0, show: (h) => h.pay_method === 'cash' }, note],
    lines: [{ key: 'account_id', label: 'บัญชีค่าใช้จ่าย', type: 'ref', ref: 'accounts', required: true, width: '260px', refWhere: (r) => r.type === 'expense' || r.type === 'asset' },
      { key: 'description', label: 'รายละเอียด', type: 'text', width: '240px' }, { key: 'amount', label: 'จำนวนเงิน', type: 'money', required: true }],
    totals: 'vat', voidable: true, post: { rpc: 'post_expense', label: 'บันทึกค่าใช้จ่าย' },
    list: [...vatTotalsCols, { key: 'payee', label: 'จ่ายให้' }, { key: 'supplier_id', label: 'ผู้ขาย', type: 'ref', ref: 'suppliers' }, { key: 'pay_method', label: 'การชำระ', type: 'select', options: [{ value: 'cash', label: 'จ่ายทันที' }, { value: 'credit', label: 'เงินเชื่อ' }] }, { key: 'total', label: 'ยอดรวม', type: 'money' }],
    print: { title: 'ใบสำคัญจ่าย (ค่าใช้จ่าย)', titleEn: 'EXPENSE VOUCHER', partner: 'supplier', columns: [{ key: 'account_name', label: 'บัญชี' }, { key: 'description', label: 'รายละเอียด' }, { key: 'amount', label: 'จำนวนเงิน', type: 'money', align: 'right' }], totals: true, signatures: ['ผู้จัดทำ', 'ผู้อนุมัติ', 'ผู้รับเงิน'] },
  },

  journal_entries: {
    key: 'journal_entries', title: 'สมุดรายวันทั่วไป (JV)', short: 'สมุดรายวัน', table: 'journal_entries', linesTable: 'journal_lines', fk: 'entry_id',
    read: ['accounting'], write: ['accounting'],
    help: 'รายการที่สร้างจากเอกสารอื่น (ขาย ซื้อ ผลิต ฯลฯ) จะแสดงที่นี่ด้วยและแก้ไขได้ที่เอกสารต้นทางเท่านั้น',
    header: [date(), { key: 'description', label: 'คำอธิบาย', type: 'text', required: true, span: 2 },
      { key: 'source_type', label: 'ที่มา', type: 'text', readOnly: true, show: (h) => !!h.id }, note],
    lines: [{ key: 'account_id', label: 'บัญชี', type: 'ref', ref: 'accounts', required: true, width: '280px' },
      { key: 'description', label: 'คำอธิบาย', type: 'text', width: '220px' },
      { key: 'debit', label: 'เดบิต', type: 'money', default: 0 }, { key: 'credit', label: 'เครดิต', type: 'money', default: 0 }],
    keepLineKeys: ['customer_id', 'supplier_id'],
    totals: 'dc', voidable: true, post: { rpc: 'post_journal', label: 'ผ่านรายการ' },
    editable: (d) => !d.source_type || d.source_type === 'manual',
    list: [...vatTotalsCols, { key: 'description', label: 'คำอธิบาย' }, { key: 'source_type', label: 'ที่มา', type: 'select', options: [
      { value: 'manual', label: 'บันทึกเอง' }, { value: 'sales_invoices', label: 'ขาย' }, { value: 'goods_receipts', label: 'รับสินค้า' }, { value: 'receipts', label: 'รับเงิน' },
      { value: 'supplier_payments', label: 'จ่ายเงิน' }, { value: 'production_orders', label: 'ผลิต' }, { value: 'stock_adjustments', label: 'ปรับสต๊อก' },
      { value: 'expenses', label: 'ค่าใช้จ่าย' }, { value: 'credit_notes', label: 'ลดหนี้' }, { value: 'payroll_runs', label: 'เงินเดือน' }] }],
    print: { title: 'ใบสำคัญทั่วไป', titleEn: 'JOURNAL VOUCHER', partner: 'none', columns: [{ key: 'account_code', label: 'รหัสบัญชี' }, { key: 'account_name', label: 'ชื่อบัญชี' }, { key: 'description', label: 'คำอธิบาย' }, { key: 'debit', label: 'เดบิต', type: 'money', align: 'right' }, { key: 'credit', label: 'เครดิต', type: 'money', align: 'right' }], signatures: ['ผู้จัดทำ', 'ผู้ตรวจสอบ', 'ผู้อนุมัติ'] },
  },

  /* ---------------- HR ---------------- */
  payroll_runs: {
    key: 'payroll_runs', title: 'จ่ายเงินเดือน / ค่าแรง', short: 'รอบเงินเดือน', table: 'payroll_runs', linesTable: 'payroll_lines', fk: 'doc_id',
    read: ['hr', 'accounting'], write: ['hr'],
    help: 'เลือกงวด → กด "คำนวณจากการลงเวลา" → ปรับเบี้ยเลี้ยง/รายการหัก/ภาษี → บันทึกจ่าย (ลงบัญชีอัตโนมัติ)',
    header: [date('doc_date', 'วันที่จ่าย'), { key: 'period_start', label: 'งวดตั้งแต่', type: 'date', required: true, default: monthStart() },
      { key: 'period_end', label: 'ถึง', type: 'date', required: true, default: monthEnd() }, cashAcc('จ่ายจากบัญชี'), note],
    lines: [{ key: 'employee_id', label: 'พนักงาน', type: 'ref', ref: 'employees', required: true, width: '200px' },
      { key: 'days_worked', label: 'วันทำงาน', type: 'number', default: 0, width: '70px' },
      { key: 'base_pay', label: 'เงินเดือน/ค่าแรง', type: 'money', default: 0 },
      { key: 'ot_hours', label: 'ชม. OT', type: 'number', default: 0, width: '70px' },
      { key: 'ot_pay', label: 'ค่า OT', type: 'money', default: 0 },
      { key: 'allowance', label: 'เบี้ยเลี้ยง/อื่นๆ', type: 'money', default: 0 },
      { key: 'deduction', label: 'รายการหัก', type: 'money', default: 0 },
      { key: 'sso_employee', label: 'ปกส. ลูกจ้าง', type: 'money', default: 0 },
      { key: 'sso_employer', label: 'ปกส. นายจ้าง', type: 'money', default: 0 },
      { key: 'wht', label: 'ภาษีหัก ณ ที่จ่าย', type: 'money', default: 0 },
      { key: 'net_pay', label: 'จ่ายสุทธิ', type: 'money', compute: (l) => payrollNet(l) }],
    totals: 'payroll', voidable: true, post: { rpc: 'post_payroll', label: 'บันทึกจ่ายเงินเดือน', roles: ['hr', 'accounting'] },
    actions: [{
      label: '⚙ คำนวณจากการลงเวลา', show: (d) => d.status === 'draft', confirm: 'คำนวณใหม่จะแทนที่รายการเดิมทั้งหมด ยืนยัน?',
      run: async (d, ctx) => {
        check(await supabase.from('payroll_lines').delete().eq('doc_id', d.id))
        check(await supabase.rpc('calc_payroll', { p_id: d.id }))
        if (window.location.pathname.endsWith('/new')) return `/d/payroll_runs/${d.id}`
        await ctx.reload()
      },
    }],
    list: [...vatTotalsCols, { key: 'period_start', label: 'งวดตั้งแต่', type: 'date' }, { key: 'period_end', label: 'ถึง', type: 'date' }, { key: 'total_gross', label: 'รวมเงินได้', type: 'money' }, { key: 'total_net', label: 'จ่ายสุทธิ', type: 'money' }],
    print: { title: 'สรุปการจ่ายเงินเดือน', titleEn: 'PAYROLL SUMMARY', partner: 'none', columns: [{ key: 'emp_name', label: 'พนักงาน' }, { key: 'days_worked', label: 'วัน', type: 'qty', align: 'right' }, { key: 'base_pay', label: 'เงินเดือน', type: 'money', align: 'right' }, { key: 'ot_pay', label: 'OT', type: 'money', align: 'right' }, { key: 'allowance', label: 'เบี้ยเลี้ยง', type: 'money', align: 'right' }, { key: 'deduction', label: 'หัก', type: 'money', align: 'right' }, { key: 'sso_employee', label: 'ปกส.', type: 'money', align: 'right' }, { key: 'wht', label: 'ภาษี', type: 'money', align: 'right' }, { key: 'net_pay', label: 'สุทธิ', type: 'money', align: 'right' }], signatures: ['ผู้จัดทำ', 'ผู้อนุมัติ'] },
  },
}

export const DOC_TOTAL = (d: Row) => num(d.total)
