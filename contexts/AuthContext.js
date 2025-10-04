import { createContext, useContext, useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase/client'

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
  const [companyId, setCompanyId] = useState(null)
  const [role, setRole] = useState(null)
  const [loading, setLoading] = useState(true)
  const [hasCredentials, setHasCredentials] = useState(false)
  // Removed credentialsLoading - no longer needed with metadata approach
  const router = useRouter()

  // Helper function to extract hasCredentials from user metadata
  const getHasCredentialsFromUser = (userObj) => {
    return !!(userObj?.user_metadata?.hasValidCredentials)
  }

  // Simple credentials check function for backward compatibility
  // Now just reads from user metadata - no API calls needed
  const checkCredentialsStatus = async () => {
    const credentialsFromMetadata = getHasCredentialsFromUser(user)
    console.log('🔧 checkCredentialsStatus: Reading from user metadata:', credentialsFromMetadata)
    setHasCredentials(credentialsFromMetadata)
  }

  useEffect(() => {

    // Get initial session
    const getInitialSession = async () => {
      try {
        console.log('🔧 AuthContext: Getting initial session...')
        const { data: { session } } = await supabase.auth.getSession()
        console.log('🔧 AuthContext: Session result:', !!session, session?.user?.email)

        if (session?.user) {
          console.log('🔧 AuthContext: Setting user from session:', session.user.email)
          setUser(session.user)
          setCompanyId(session.user.user_metadata?.company_id || session.user.app_metadata?.company_id)
          setRole(session.user.user_metadata?.role || session.user.app_metadata?.role || 'user')

          // Set hasCredentials from user metadata (no API call needed!)
          const credentialsFromMetadata = getHasCredentialsFromUser(session.user)
          console.log('🔧 AuthContext: Setting hasCredentials from user metadata:', credentialsFromMetadata)
          setHasCredentials(credentialsFromMetadata)
        } else {
          console.log('🔧 AuthContext: No session found')
        }

        setLoading(false)
      } catch (error) {
        console.error('Error getting session:', error)
        setLoading(false)
      }
    }

    getInitialSession()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session?.user) {
          setUser(session.user)
          setCompanyId(session.user.user_metadata?.company_id || session.user.app_metadata?.company_id)
          setRole(session.user.user_metadata?.role || session.user.app_metadata?.role || 'user')

          // Set hasCredentials from user metadata
          const credentialsFromMetadata = getHasCredentialsFromUser(session.user)
          console.log('🔧 AuthContext: Auth change - setting hasCredentials from metadata:', credentialsFromMetadata)
          setHasCredentials(credentialsFromMetadata)
        } else {
          setUser(null)
          setCompanyId(null)
          setRole(null)
          setHasCredentials(false)
        }

        setLoading(false)
      }
    )

    return () => {
      if (subscription) {
        subscription.unsubscribe()
      }
    }
  }, [router])

  const signIn = async (email, password) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) throw error

      return { user: data.user, error: null }
    } catch (error) {
      return { user: null, error: error.message }
    }
  }

  const signUp = async (email, password, metadata = {}) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: metadata
        }
      })

      if (error) throw error

      return { user: data.user, error: null }
    } catch (error) {
      return { user: null, error: error.message }
    }
  }

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
      return { error: null }
    } catch (error) {
      console.error('Error signing out:', error.message)
      return { error: error.message }
    }
  }

  const resetPassword = async (email) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })

      if (error) throw error

      return { error: null }
    } catch (error) {
      return { error: error.message }
    }
  }

  const updatePassword = async (newPassword) => {
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      })

      if (error) throw error

      return { error: null }
    } catch (error) {
      return { error: error.message }
    }
  }

  const value = {
    user,
    companyId,
    role,
    loading,
    signIn,
    signUp,
    signOut,
    resetPassword,
    updatePassword,
    isAdmin: role === 'admin',
    isAuthenticated: !!user,
    hasCompanyAccess: !!companyId,
    isDevMode: false,
    hasCredentials,
    checkCredentialsStatus, // Kept for backward compatibility - now reads from user metadata
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}