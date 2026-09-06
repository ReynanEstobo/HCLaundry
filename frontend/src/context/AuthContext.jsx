import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext({})

export const useAuth = () => useContext(AuthContext)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [role, setRole] = useState(null)
  const [staffName, setStaffName] = useState(null)
  const [loading, setLoading] = useState(true)

  async function fetchStaffRole(authUser) {
    if (!authUser) { setRole(null); setStaffName(null); return }
    const { data } = await supabase
      .from('staff')
      .select('role, full_name')
      .eq('auth_id', authUser.id)
      .maybeSingle()
    if (data) {
      setRole(data.role)
      setStaffName(data.full_name)
    } else {
      // No staff record — treat as admin (for seed user / owner)
      setRole('admin')
      setStaffName(null)
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user ?? null
      setUser(u)
      fetchStaffRole(u).then(() => setLoading(false))
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null
      setUser(u)
      fetchStaffRole(u)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signIn = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ user, role, staffName, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}
