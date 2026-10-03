import type { Role } from '../lib/auth'

export interface MenuItem { to: string; label: string; roles?: Role[] }
export interface MenuGroup { label: string; icon: string; roles: Role[]; items: MenuItem[] }

const EX: Role = 'executive'

export const MENU: MenuGroup[] = [
  { label: 'ภาพรวม', icon: '📊', roles: [], items: [{ to: '/', label: 'แดชบอร์ด' }] },
  {
    label: 'ขาย', icon: '🧾', roles: ['sales', 'accounting', EX], items: [
      { to: '/d/quotations', label: 'ใบเสนอราคา', roles: ['sales', 'accounting', EX] },
      { to: '/d/sales_orders', label: 'ใบสั่งขาย' },
      { to: '/d/sales_invoices', label: 'บิลส่งของ / ใบกำกับภาษี' },
      { to: '/d/credit_notes', label: 'ใบลดหนี้ / รับคืน', roles: ['sales', 'accounting', EX] },
      { to: '/d/receipts', label: 'รับชำระเงิน', roles: ['sales', 'accounting', EX] },
      { to: '/r/ar', label: 'ลูกหนี้คงค้าง', roles: ['sales', 'accounting', EX] },
      { to: '/r/sales', label: 'รายงานยอดขาย', roles: ['sales', 'accounting', EX] },
      { to: '/m/customers', label: 'ลูกค้า' },
      { to: '/m/customer_prices', label: 'ราคาพิเศษรายลูกค้า', roles: ['sales', 'accounting', EX] },
      { to: '/m/carriers', label: 'บริษัทขนส่ง' },
    ],
  },
  {
    label: 'จัดซื้อ', icon: '🛒', roles: ['purchasing', 'warehouse', 'production', 'accounting', EX], items: [
      { to: '/d/purchase_requests', label: 'ใบขอซื้อ' },
      { to: '/d/purchase_orders', label: 'ใบสั่งซื้อ', roles: ['purchasing', 'warehouse', 'accounting', EX] },
      { to: '/d/goods_receipts', label: 'รับสินค้า / ตั้งหนี้', roles: ['purchasing', 'warehouse', 'accounting', EX] },
      { to: '/d/supplier_payments', label: 'จ่ายชำระหนี้', roles: ['purchasing', 'accounting', EX] },
      { to: '/r/ap', label: 'เจ้าหนี้คงค้าง', roles: ['purchasing', 'accounting', EX] },
      { to: '/m/suppliers', label: 'ผู้ขาย' },
    ],
  },
  {
    label: 'คลังสินค้า', icon: '📦', roles: ['warehouse', 'production', 'purchasing', 'sales', 'accounting', EX], items: [
      { to: '/stock', label: 'สต๊อกคงเหลือ' },
      { to: '/stock/card', label: 'สต๊อกการ์ด (ความเคลื่อนไหว)' },
      { to: '/stock/lots', label: 'ล็อต / วันหมดอายุ' },
      { to: '/d/stock_adjustments', label: 'รับ / เบิก / โอน / ตรวจนับ', roles: ['warehouse', 'production', 'accounting', EX] },
      { to: '/m/items', label: 'สินค้า / วัตถุดิบ' },
      { to: '/m/item_categories', label: 'หมวดหมู่สินค้า' },
      { to: '/m/units', label: 'หน่วยนับ' },
      { to: '/m/warehouses', label: 'คลัง' },
    ],
  },
  {
    label: 'ผลิต', icon: '🏭', roles: ['production', 'warehouse', 'accounting', EX], items: [
      { to: '/d/production_orders', label: 'ใบผลิต / บันทึกแพ็ค' },
      { to: '/d/boms', label: 'สูตรการผลิต (BOM)' },
      { to: '/r/production', label: 'รายงานการผลิต' },
    ],
  },
  {
    label: 'บัญชี', icon: '📒', roles: ['accounting', EX], items: [
      { to: '/d/expenses', label: 'บันทึกค่าใช้จ่าย' },
      { to: '/d/journal_entries', label: 'สมุดรายวันทั่วไป' },
      { to: '/r/tb', label: 'งบทดลอง' },
      { to: '/r/gl', label: 'บัญชีแยกประเภท' },
      { to: '/r/pl', label: 'งบกำไรขาดทุน' },
      { to: '/r/bs', label: 'งบแสดงฐานะการเงิน' },
      { to: '/r/vat', label: 'รายงานภาษีซื้อ / ภาษีขาย' },
      { to: '/m/accounts', label: 'ผังบัญชี' },
      { to: '/settings/gl', label: 'ผูกบัญชีอัตโนมัติ' },
    ],
  },
  {
    label: 'บุคคล', icon: '👷', roles: ['hr', EX], items: [
      { to: '/hr/attendance', label: 'ลงเวลาทำงาน' },
      { to: '/d/payroll_runs', label: 'เงินเดือน / ค่าแรง' },
      { to: '/m/employees', label: 'พนักงาน' },
      { to: '/m/departments', label: 'แผนก' },
    ],
  },
  {
    label: 'ตั้งค่าระบบ', icon: '⚙️', roles: ['admin'], items: [
      { to: '/settings/users', label: 'ผู้ใช้งานและสิทธิ์' },
      { to: '/settings/company', label: 'ข้อมูลบริษัท / ปิดงวด' },
      { to: '/settings/audit', label: 'ประวัติการแก้ไขข้อมูล' },
    ],
  },
]
