import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { invalidateRefs } from './refs'
import { loadSettings } from './settings'
import { supabase } from './supabase'

export type Role = 'admin' | 'executive' | 'warehouse' | 'production' | 'purchasing' | 'sales' | 'accounting' | 'hr'
export const ROLE_LABEL: Record<Role, string> = {
  admin: 'ผู้ดูแลระบบ', executive: 'ผู้บริหาร', warehouse: 'คลังสินค้า', production: 'ฝ่ายผลิต',
  purchasing: 'จัดซื้อ', sales: 'ฝ่ายขาย', accounting: 'บัญชี', hr: 'บุคคล',
}

export interface Profile { id: string; email: string; full_name: string; roles: Role[]; active: boolean }

interface AuthCtx {
  session: Session | null
  profile: Profile | null
  loading: boolean
  /** true if user has any of the roles (admin always true) */
  can: (...roles: Role[]) => boolean
  reload: () => Promise<void>
}
const Ctx = createContext<AuthCtx>(null as unknown as AuthCtx)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  async function loadProfile(s: Session | null) {
    if (!s) { setProfile(null); return }
    const { data } = await supabase.from('profiles').select('*').eq('id', s.user.id).maybeSingle()
    setProfile((data as Profile) ?? null)
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      await loadProfile(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((e, s) => {
      if (e === 'SIGNED_IN' || e === 'SIGNED_OUT') { invalidateRefs(); loadSettings(true) }
      setSession(s)
      setTimeout(() => loadProfile(s), 0)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const can = (...roles: Role[]) => {
    const r = profile?.active ? profile.roles : []
    if (r.includes('admin')) return true
    if (roles.length === 0) return r.length > 0
    return roles.some((x) => r.includes(x))
  }

  return (
    <Ctx.Provider value={{ session, profile, loading, can, reload: () => loadProfile(session) }}>
      {children}
    </Ctx.Provider>
  )
}
export const useAuth = () => useContext(Ctx)
