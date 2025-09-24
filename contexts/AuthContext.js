import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext({})

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // DEV MODE: Skip auth if Supabase not configured
    if (!supabase) {
      console.log('🔧 DEV MODE: Supabase not configured, using fake auth')
      // Set fake user for development
      setUser({
        id: 'dev-user',
        email: 'dev@example.com',
        user_metadata: { name: 'Dev User' }
      })
      setLoading(false)
      return
    }

    // Get initial session
    const getInitialSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      setUser(session?.user ?? null)
      setLoading(false)
    }

    getInitialSession()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setUser(session?.user ?? null)
        setLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const signUp = async (email, password) => {
    if (!supabase) {
      // DEV MODE: Fake successful signup
      console.log('🔧 DEV MODE: Fake signup successful')
      setUser({
        id: 'dev-user',
        email: email,
        user_metadata: { name: 'Dev User' }
      })
      return { data: { user: { email } }, error: null }
    }
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    })
    return { data, error }
  }

  const signIn = async (email, password) => {
    if (!supabase) {
      // DEV MODE: Fake successful login
      console.log('🔧 DEV MODE: Fake login successful')
      setUser({
        id: 'dev-user',
        email: email,
        user_metadata: { name: 'Dev User' }
      })
      return { data: { user: { email } }, error: null }
    }
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    return { data, error }
  }

  const signOut = async () => {
    if (!supabase) {
      console.log('🔧 DEV MODE: Fake logout')
      setUser(null)
      return { error: null }
    }
    const { error } = await supabase.auth.signOut()
    return { error }
  }

  const value = {
    user,
    loading,
    signUp,
    signIn,
    signOut,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}