import { Route, Routes } from 'react-router-dom'
import { DocEditor, DocList } from './components/DocPage'
import Layout from './components/Layout'
import MasterPage from './components/MasterPage'
import { Spinner } from './components/ui'
import { useAuth } from './lib/auth'
import { AuditLog, CompanySettings, GlMapping, Users } from './pages/Admin'
import Attendance from './pages/Attendance'
import Dashboard from './pages/Dashboard'
import Login, { Pending } from './pages/Login'
import PrintDoc from './pages/Print'
import { ApReport, ArReport, BalanceSheet, GeneralLedger, ProductionReport, ProfitLoss, SalesReport, TrialBalance, VatReport } from './pages/Reports'
import { LotExpiry, StockBalance, StockCard } from './pages/Stock'

export default function App() {
  const { session, profile, loading, can } = useAuth()
  if (loading) return <Spinner />
  if (!session) return <Login />
  if (!profile || !can()) return <Pending />
  return (
    <Routes>
      <Route path="/print/:docKey/:id" element={<PrintDoc />} />
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="d/:docKey" element={<DocList />} />
        <Route path="d/:docKey/:id" element={<DocEditor />} />
        <Route path="m/:masterKey" element={<MasterPage />} />
        <Route path="stock" element={<StockBalance />} />
        <Route path="stock/card" element={<StockCard />} />
        <Route path="stock/lots" element={<LotExpiry />} />
        <Route path="r/ar" element={<ArReport />} />
        <Route path="r/ap" element={<ApReport />} />
        <Route path="r/sales" element={<SalesReport />} />
        <Route path="r/production" element={<ProductionReport />} />
        <Route path="r/tb" element={<TrialBalance />} />
        <Route path="r/gl" element={<GeneralLedger />} />
        <Route path="r/pl" element={<ProfitLoss />} />
        <Route path="r/bs" element={<BalanceSheet />} />
        <Route path="r/vat" element={<VatReport />} />
        <Route path="hr/attendance" element={<Attendance />} />
        <Route path="settings/users" element={<Users />} />
        <Route path="settings/company" element={<CompanySettings />} />
        <Route path="settings/gl" element={<GlMapping />} />
        <Route path="settings/audit" element={<AuditLog />} />
        <Route path="*" element={<div className="p-10 text-center text-slate-400">ไม่พบหน้านี้</div>} />
      </Route>
    </Routes>
  )
}
