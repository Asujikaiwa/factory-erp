import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { MENU } from '../config/menu'
import { ROLE_LABEL, useAuth } from '../lib/auth'
import { useSettings } from '../lib/settings'
import { supabase } from '../lib/supabase'

export default function Layout() {
  const { profile, can } = useAuth()
  const settings = useSettings()
  const [open, setOpen] = useState(false)
  const loc = useLocation()
  const groups = MENU.filter((g) => g.roles.length === 0 || can(...g.roles))

  return (
    <div className="flex h-full">
      {/* sidebar */}
      <aside className={`no-print fixed inset-y-0 left-0 z-40 w-64 transform overflow-y-auto bg-brand-900 text-brand-50 transition-transform lg:static lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="border-b border-white/10 px-4 py-4">
          <div className="text-xs uppercase tracking-wider text-brand-100/70">Factory ERP</div>
          <div className="truncate font-semibold">{settings.name}</div>
        </div>
        <nav className="p-2 text-sm">
          {groups.map((g) => (
            <div key={g.label} className="mb-2">
              <div className="px-3 pt-2 pb-1 text-xs font-semibold text-brand-100/60">{g.icon} {g.label}</div>
              {g.items.filter((i) => !i.roles || can(...i.roles)).map((i) => (
                <NavLink key={i.to} to={i.to} end={i.to === '/' || i.to === '/stock'} onClick={() => setOpen(false)}
                  className={({ isActive }) => `block rounded-md px-3 py-1.5 ${isActive ? 'bg-white/15 text-white' : 'text-brand-50/85 hover:bg-white/10'}`}>
                  {i.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      {open && <div className="no-print fixed inset-0 z-30 bg-black/30 lg:hidden" onClick={() => setOpen(false)} />}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-2.5">
          <button className="btn-ghost px-2 lg:hidden" onClick={() => setOpen(true)} aria-label="เมนู">☰</button>
          <div className="min-w-0 flex-1 truncate text-sm text-slate-500">{loc.pathname === '/' ? 'แดชบอร์ด' : ''}</div>
          <div className="text-right text-sm leading-tight">
            <div className="font-medium">{profile?.full_name}</div>
            <div className="text-xs text-slate-500">{profile?.roles.map((r) => ROLE_LABEL[r]).join(', ')}</div>
          </div>
          <button className="btn-secondary" onClick={() => supabase.auth.signOut()}>ออกจากระบบ</button>
        </header>
        <main className="min-w-0 flex-1 overflow-auto p-4 lg:p-6"><Outlet /></main>
      </div>
    </div>
  )
}
