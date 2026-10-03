import type { Role } from '../lib/auth'
import { ITEM_TYPE_OPTIONS } from '../lib/refs'
import type { FieldDef } from './types'

export interface MasterConfig {
  key: string
  title: string
  table: string
  write: Role[]
  fields: FieldDef[]
  list: string[]
  search: string[]
  order: string
  help?: string
}

const active: FieldDef = { key: 'active', label: 'ใช้งาน', type: 'checkbox', default: true }
const code: FieldDef = { key: 'code', label: 'รหัส', type: 'text', required: true }
const name: FieldDef = { key: 'name', label: 'ชื่อ', type: 'text', required: true, span: 2 }
const note: FieldDef = { key: 'note', label: 'หมายเหตุ', type: 'textarea', span: 2 }

export const MASTERS: Record<string, MasterConfig> = {
  items: {
    key: 'items', title: 'สินค้า / วัตถุดิบ / บรรจุภัณฑ์', table: 'items', write: ['warehouse', 'purchasing', 'production'], order: 'code',
    help: 'น้ำหนัก กก./หน่วย ตั้งได้รายสินค้า (เช่น 20, 25, 30 กก./ลัง) · เปิด "ติดตามล็อต" สำหรับสินค้าที่มีวันหมดอายุ',
    fields: [code, name,
      { key: 'type', label: 'ประเภท', type: 'select', options: ITEM_TYPE_OPTIONS, required: true, default: 'raw' },
      { key: 'category_id', label: 'หมวดหมู่', type: 'ref', ref: 'item_categories' },
      { key: 'unit_id', label: 'หน่วยนับ', type: 'ref', ref: 'units', required: true },
      { key: 'kg_per_unit', label: 'น้ำหนัก (กก.) ต่อหน่วย', type: 'number' },
      { key: 'sale_price', label: 'ราคาขายมาตรฐาน', type: 'money', default: 0 },
      { key: 'std_cost', label: 'ทุนตั้งต้น/ราคาซื้อล่าสุด', type: 'money', default: 0 },
      { key: 'min_stock', label: 'จุดสั่งซื้อ (ขั้นต่ำ)', type: 'number', default: 0 },
      { key: 'track_lot', label: 'ติดตามล็อต/วันหมดอายุ', type: 'checkbox', default: false },
      { key: 'shelf_life_days', label: 'อายุสินค้า (วัน)', type: 'number' },
      { key: 'barcode', label: 'บาร์โค้ด', type: 'text' }, active, note],
    list: ['code', 'name', 'type', 'unit_id', 'kg_per_unit', 'sale_price', 'min_stock', 'track_lot', 'active'], search: ['code', 'name', 'barcode'],
  },
  item_categories: { key: 'item_categories', title: 'หมวดหมู่สินค้า', table: 'item_categories', write: ['warehouse', 'purchasing', 'production'], order: 'name', fields: [name, active], list: ['name', 'active'], search: ['name'] },
  units: { key: 'units', title: 'หน่วยนับ', table: 'units', write: ['warehouse', 'purchasing', 'production'], order: 'code', fields: [code, name, active], list: ['code', 'name', 'active'], search: ['code', 'name'] },
  warehouses: { key: 'warehouses', title: 'คลังสินค้า', table: 'warehouses', write: ['warehouse'], order: 'code', fields: [code, name, active], list: ['code', 'name', 'active'], search: ['code', 'name'] },
  customers: {
    key: 'customers', title: 'ลูกค้า', table: 'customers', write: ['sales', 'accounting'], order: 'code',
    fields: [code, name, { key: 'tax_id', label: 'เลขประจำตัวผู้เสียภาษี', type: 'text' }, { key: 'branch', label: 'สาขา', type: 'text', default: 'สำนักงานใหญ่' },
      { key: 'address', label: 'ที่อยู่ (ออกบิล)', type: 'textarea', span: 2 }, { key: 'ship_address', label: 'ที่อยู่จัดส่ง', type: 'textarea', span: 2 },
      { key: 'phone', label: 'โทรศัพท์', type: 'text' }, { key: 'contact', label: 'ผู้ติดต่อ', type: 'text' },
      { key: 'credit_days', label: 'เครดิต (วัน)', type: 'number', default: 0 }, { key: 'credit_limit', label: 'วงเงินเครดิต (0 = ไม่จำกัด)', type: 'money', default: 0 },
      { key: 'default_delivery', label: 'การจัดส่งปกติ', type: 'select', required: true, default: 'pickup', options: [{ value: 'pickup', label: 'มารับเอง' }, { value: 'delivery', label: 'ส่งหน้าร้าน' }] },
      active, note],
    list: ['code', 'name', 'phone', 'credit_days', 'credit_limit', 'default_delivery', 'active'], search: ['code', 'name', 'phone', 'tax_id'],
  },
  customer_prices: {
    key: 'customer_prices', title: 'ราคาพิเศษรายลูกค้า', table: 'customer_prices', write: ['sales'], order: 'id',
    help: 'เมื่อออกบิล/ใบสั่งขายให้ลูกค้ารายนี้ ระบบจะดึงราคานี้ให้อัตโนมัติ',
    fields: [{ key: 'customer_id', label: 'ลูกค้า', type: 'ref', ref: 'customers', required: true, span: 2 }, { key: 'item_id', label: 'สินค้า', type: 'ref', ref: 'items', required: true, span: 2 }, { key: 'price', label: 'ราคา', type: 'money', required: true }],
    list: ['customer_id', 'item_id', 'price'], search: [],
  },
  suppliers: {
    key: 'suppliers', title: 'ผู้ขาย / ซัพพลายเออร์', table: 'suppliers', write: ['purchasing', 'accounting'], order: 'code',
    fields: [code, name, { key: 'tax_id', label: 'เลขประจำตัวผู้เสียภาษี', type: 'text' }, { key: 'branch', label: 'สาขา', type: 'text' },
      { key: 'address', label: 'ที่อยู่', type: 'textarea', span: 2 }, { key: 'phone', label: 'โทรศัพท์', type: 'text' }, { key: 'contact', label: 'ผู้ติดต่อ', type: 'text' },
      { key: 'credit_days', label: 'เครดิต (วัน)', type: 'number', default: 0 }, active, note],
    list: ['code', 'name', 'phone', 'credit_days', 'active'], search: ['code', 'name', 'phone', 'tax_id'],
  },
  carriers: { key: 'carriers', title: 'บริษัทขนส่ง', table: 'carriers', write: ['sales', 'warehouse'], order: 'name', fields: [name, { key: 'phone', label: 'โทรศัพท์', type: 'text' }, active], list: ['name', 'phone', 'active'], search: ['name'] },
  accounts: {
    key: 'accounts', title: 'ผังบัญชี', table: 'accounts', write: ['accounting'], order: 'code',
    fields: [code, name, { key: 'type', label: 'หมวด', type: 'select', required: true, default: 'expense', options: [{ value: 'asset', label: 'สินทรัพย์' }, { value: 'liability', label: 'หนี้สิน' }, { value: 'equity', label: 'ส่วนของเจ้าของ' }, { value: 'income', label: 'รายได้' }, { value: 'expense', label: 'ค่าใช้จ่าย' }] },
      { key: 'parent_id', label: 'อยู่ภายใต้หัวบัญชี', type: 'ref', ref: 'group_accounts' },
      { key: 'is_group', label: 'เป็นหัวบัญชี (ห้ามลงรายการ)', type: 'checkbox', default: false },
      { key: 'is_cash', label: 'บัญชีเงินสด/ธนาคาร', type: 'checkbox', default: false }, active],
    list: ['code', 'name', 'type', 'is_group', 'is_cash', 'active'], search: ['code', 'name'],
  },
  departments: { key: 'departments', title: 'แผนก', table: 'departments', write: ['hr'], order: 'code', fields: [code, name, active], list: ['code', 'name', 'active'], search: ['code', 'name'] },
  employees: {
    key: 'employees', title: 'พนักงาน', table: 'employees', write: ['hr'], order: 'code',
    fields: [code, { key: 'full_name', label: 'ชื่อ-นามสกุล', type: 'text', required: true, span: 2 },
      { key: 'department_id', label: 'แผนก', type: 'ref', ref: 'departments' }, { key: 'position', label: 'ตำแหน่ง', type: 'text' },
      { key: 'pay_type', label: 'ประเภทค่าจ้าง', type: 'select', required: true, default: 'monthly', options: [{ value: 'monthly', label: 'รายเดือน' }, { value: 'daily', label: 'รายวัน' }] },
      { key: 'rate', label: 'เงินเดือน / ค่าแรงต่อวัน', type: 'money', required: true, default: 0 },
      { key: 'sso_enabled', label: 'หักประกันสังคม', type: 'checkbox', default: true },
      { key: 'bank_name', label: 'ธนาคาร', type: 'text' }, { key: 'bank_account', label: 'เลขบัญชี', type: 'text' },
      { key: 'phone', label: 'โทรศัพท์', type: 'text' }, { key: 'start_date', label: 'วันเริ่มงาน', type: 'date' }, active],
    list: ['code', 'full_name', 'department_id', 'position', 'pay_type', 'rate', 'active'], search: ['code', 'full_name'],
  },
}
