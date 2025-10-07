import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase/client'
import Navigation from './Navigation'
import axios from 'axios'

export default function Settings() {
  const router = useRouter()
  const { user, signOut, isAdmin, isImpersonating, impersonateCompany, stopImpersonating, actualCompanyId, companyId } = useAuth()

  // Initialize activeTab from URL query parameter or default to 'profile'
  const [activeTab, setActiveTab] = useState(() => {
    const tab = router.query.tab
    return tab === 'dex' ? 'dex' : tab || 'profile'
  })
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState({ type: '', text: '' })

  // Profile form state
  const [profileData, setProfileData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    companyName: '',
    timezone: 'Australia/Brisbane'
  })

  // DEX credentials form state
  const [dexCredentials, setDexCredentials] = useState({
    username: '',
    password: '',
    siteUrl: '',
    isConfigured: false
  })

  // Password change form state
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  })

  const [showPasswordForm, setShowPasswordForm] = useState(false)

  // Admin - User list for impersonation
  const [users, setUsers] = useState([])

  // Mobile menu state
  const [menuOpen, setMenuOpen] = useState(false)

  // Subscription state
  const [subscription, setSubscription] = useState(null)
  const [tiers, setTiers] = useState([])
  const [loadingSubscription, setLoadingSubscription] = useState(false)

  // Machine types configuration
  const [machineTypes, setMachineTypes] = useState([
    { name: 'unknown', active: true },
    { name: 'beverage', active: true },
    { name: 'food', active: true }
  ])
  const [newMachineType, setNewMachineType] = useState('')
  const [editingType, setEditingType] = useState(null)
  const [machineTypeUsage, setMachineTypeUsage] = useState({})

  // Update active tab when URL query parameter changes
  useEffect(() => {
    if (router.query.tab) {
      setActiveTab(router.query.tab)
    }
  }, [router.query.tab])

  useEffect(() => {
    // Load user profile data from API to get complete information including company name
    loadProfileData()
    // Load existing DEX credentials
    loadDexCredentials()
    // Load company settings including machine types
    loadCompanySettings()
  }, [user?.id]) // Only re-run when user ID changes, not the whole user object

  const loadProfileData = async () => {
    try {
      const response = await fetch('/api/user/profile', {
        credentials: 'include'
      })
      if (response.ok) {
        const data = await response.json()

        const name = data.user.user_metadata?.name || ''
        const [firstName, ...lastNameParts] = name.split(' ')

        const profileData = {
          firstName: firstName || '',
          lastName: lastNameParts.join(' ') || '',
          email: data.user.email || '',
          companyName: data.user.user_metadata?.company_name || data.companyName || '',
          timezone: data.user.user_metadata?.timezone || 'Australia/Brisbane'
        }

        setProfileData(profileData)

        // Check if company name is missing due to RLS policy failure
        if (!data.companyName && data.user.user_metadata?.company_id) {
          console.log('🔧 Company name lookup failed - likely JWT/RLS sync issue')

          // Attempt fix once per session
          const fixAttempted = sessionStorage.getItem('rls-fix-attempted')
          if (!fixAttempted) {
            console.log('🔧 Attempting one-time metadata fix...')
            sessionStorage.setItem('rls-fix-attempted', 'true')
            await fixUserMetadata()
            // Also create user_credentials record for the new RLS policy
            await createUserCredential()
          }

          // Use fallback for company name display
          setProfileData(prev => ({
            ...prev,
            companyName: 'Company name unavailable (session refresh needed)'
          }))
        }
      } else if (user) {
        // Fallback to client-side user data if API fails
        const name = user.user_metadata?.name || ''
        const [firstName, ...lastNameParts] = name.split(' ')

        setProfileData({
          firstName: firstName || '',
          lastName: lastNameParts.join(' ') || '',
          email: user.email || '',
          companyName: user.user_metadata?.company_name || ''
        })
      }
    } catch (error) {
      console.error('Error loading profile data:', error)
      // Fallback to client-side user data if API fails
      if (user) {
        const name = user.user_metadata?.name || ''
        const [firstName, ...lastNameParts] = name.split(' ')

        setProfileData({
          firstName: firstName || '',
          lastName: lastNameParts.join(' ') || '',
          email: user.email || '',
          companyName: user.user_metadata?.company_name || ''
        })
      }
    }
  }

  const loadDexCredentials = async () => {
    try {
      const response = await fetch('/api/user/dex-credentials', {
        credentials: 'include'
      })
      if (response.ok) {
        const data = await response.json()

        setDexCredentials({
          username: data.username || '',
          password: '', // Never show password
          siteUrl: data.siteUrl || '',
          isConfigured: data.isConfigured || false
        })
      }
    } catch (error) {
      console.error('Error loading DEX credentials:', error)
    }
  }

  const loadCompanySettings = async () => {
    try {
      const response = await fetch('/api/settings/company', {
        credentials: 'include'
      })
      if (response.ok) {
        const data = await response.json()
        if (data.settings?.machineTypes) {
          // Convert old format (array of strings) to new format (array of objects)
          const types = Array.isArray(data.settings.machineTypes)
            ? data.settings.machineTypes.map(type =>
                typeof type === 'string'
                  ? { name: type, active: true }
                  : type
              )
            : []
          setMachineTypes(types)
        }
      }
    } catch (error) {
      console.error('Error loading company settings:', error)
    }
  }

  const loadMachineTypeUsage = async () => {
    try {
      const response = await fetch('/api/machines/type-usage', {
        credentials: 'include'
      })
      if (response.ok) {
        const data = await response.json()
        setMachineTypeUsage(data.usage || {})
      } else {
        console.warn('Failed to load machine type usage, will show 0 for all types')
        setMachineTypeUsage({})
      }
    } catch (error) {
      console.error('Error loading machine type usage:', error)
      setMachineTypeUsage({})
    }
  }

  const saveCompanySettings = async (newSettings) => {
    try {
      const response = await fetch('/api/settings/company', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          settings: {
            machineTypes: newSettings.machineTypes || machineTypes
          }
        })
      })

      if (response.ok) {
        return true
      } else {
        const error = await response.json()
        console.error('Error saving settings:', error)
        return false
      }
    } catch (error) {
      console.error('Error saving company settings:', error)
      return false
    }
  }

  const fixUserMetadata = async () => {
    try {
      const response = await fetch('/api/admin/fix-user-app-metadata', {
        method: 'POST',
        credentials: 'include'
      })
      if (response.ok) {
        console.log('🔧 User metadata fixed successfully')
        // Reload profile data to get the company name
        setTimeout(() => {
          loadProfileData()
        }, 1000) // Give it a moment for the metadata to update
      } else {
        console.error('Failed to fix user metadata:', response.status)
      }
    } catch (error) {
      console.error('Error fixing user metadata:', error)
    }
  }

  const createUserCredential = async () => {
    try {
      const response = await fetch('/api/admin/create-user-credential', {
        method: 'POST',
        credentials: 'include'
      })
      if (response.ok) {
        const data = await response.json()
        console.log('🔧 User credential created successfully:', data)
        // Reload profile data to see if company name now appears
        setTimeout(() => {
          loadProfileData()
        }, 1000) // Give it a moment for the RLS to be effective
      } else {
        console.error('Failed to create user credential:', response.status)
        const errorData = await response.json()
        console.error('Error details:', errorData)
      }
    } catch (error) {
      console.error('Error creating user credential:', error)
    }
  }

  const handleProfileSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMessage({ type: '', text: '' })

    try {
      const response = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(profileData),
      })

      if (response.ok) {
        // Refresh the Supabase session to get updated user metadata
        const { data: { session }, error: refreshError } = await supabase.auth.refreshSession()

        if (refreshError) {
          console.error('Error refreshing session:', refreshError)
        } else {
          console.log('🔧 Session refreshed, new timezone:', session?.user?.user_metadata?.timezone)
        }

        setMessage({ type: 'success', text: 'Profile updated successfully!' })

        // Reload profile data to reflect changes in the UI
        await loadProfileData()
      } else {
        throw new Error('Failed to update profile')
      }
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    } finally {
      setLoading(false)
    }
  }

  const handleDexCredentialsSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMessage({ type: '', text: '' })

    try {
      const response = await fetch('/api/user/dex-credentials', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          username: dexCredentials.username,
          password: dexCredentials.password,
          siteUrl: dexCredentials.siteUrl || 'https://dashboard.cantaloupe.online'
        }),
      })

      if (response.ok) {
        setMessage({ type: 'success', text: 'DEX credentials saved successfully!' })
        setDexCredentials(prev => ({ ...prev, isConfigured: true, password: '' }))

        // Refresh the session to pick up updated user metadata
        // This will trigger AuthContext's onAuthStateChange listener
        await supabase.auth.refreshSession()
      } else {
        const error = await response.json()
        throw new Error(error.message || 'Failed to save credentials')
      }
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    } finally {
      setLoading(false)
    }
  }

  const testDexConnection = async () => {
    setLoading(true)
    setMessage({ type: '', text: '' })

    try {
      const response = await fetch('/api/user/test-dex-connection', {
        method: 'POST',
        credentials: 'include'
      })

      const data = await response.json()

      if (data.success) {
        setMessage({
          type: 'success',
          text: data.message || 'Connection successful!'
        })
      } else {
        setMessage({
          type: 'error',
          text: data.error || 'Connection test failed'
        })
      }
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    } finally {
      setLoading(false)
    }
  }

  const handlePasswordChange = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMessage({ type: '', text: '' })

    // Validate passwords match
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setMessage({ type: 'error', text: 'New passwords do not match' })
      setLoading(false)
      return
    }

    // Validate password strength
    if (passwordData.newPassword.length < 8) {
      setMessage({ type: 'error', text: 'Password must be at least 8 characters' })
      setLoading(false)
      return
    }

    try {
      const response = await fetch('/api/user/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          currentPassword: passwordData.currentPassword,
          newPassword: passwordData.newPassword
        }),
      })

      const data = await response.json()

      if (response.ok) {
        setMessage({ type: 'success', text: 'Password changed successfully!' })
        setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' })
        setShowPasswordForm(false)
      } else {
        throw new Error(data.error || 'Failed to change password')
      }
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    } finally {
      setLoading(false)
    }
  }

  const loadUsers = async () => {
    if (!isAdmin) return

    try {
      const response = await fetch('/api/admin/list-users', {
        credentials: 'include'
      })
      if (response.ok) {
        const data = await response.json()
        setUsers(data.users || [])
      }
    } catch (error) {
      console.error('Error loading users:', error)
    }
  }

  // Load machine type usage when Configuration tab is active
  useEffect(() => {
    if (activeTab === 'configuration') {
      loadMachineTypeUsage()
    }
  }, [activeTab])

  // Load users when Admin tab is active
  useEffect(() => {
    if (activeTab === 'admin' && isAdmin) {
      loadUsers()
    }
  }, [activeTab, isAdmin])

  // Load subscription data when Subscription tab is active
  useEffect(() => {
    if (activeTab === 'subscription') {
      loadSubscriptionData()
    }
  }, [activeTab])

  const loadSubscriptionData = async () => {
    try {
      setLoadingSubscription(true)
      const [subResponse, tiersResponse] = await Promise.all([
        axios.get('/api/subscription'),
        axios.get('/api/subscription/tiers')
      ])

      if (subResponse.data.success) {
        setSubscription(subResponse.data.subscription)
      }

      if (tiersResponse.data.success) {
        setTiers(tiersResponse.data.tiers)
      }
    } catch (err) {
      console.error('Error fetching subscription data:', err)
      setMessage({ type: 'error', text: err.message })
    } finally {
      setLoadingSubscription(false)
    }
  }

  const tabs = [
    { id: 'profile', name: 'Profile', icon: 'user' },
    { id: 'configuration', name: 'Configuration', icon: 'cog' },
    { id: 'dex', name: 'DEX Integration', icon: 'server' },
    { id: 'subscription', name: 'Subscription', icon: 'credit-card' },
    { id: 'security', name: 'Security', icon: 'shield' },
    ...(isAdmin ? [{ id: 'admin', name: 'Admin', icon: 'admin' }] : [])
  ]

  const getStatusBadge = (status) => {
    const badges = {
      trial: 'bg-blue-100 text-blue-800',
      active: 'bg-green-100 text-green-800',
      past_due: 'bg-yellow-100 text-yellow-800',
      canceled: 'bg-red-100 text-red-800',
      suspended: 'bg-gray-100 text-gray-800',
      promotional: 'bg-purple-100 text-purple-800'
    }
    return badges[status] || 'bg-gray-100 text-gray-800'
  }


  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />

      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          {/* Mobile Header with Hamburger Menu */}
          <div className="sm:hidden mb-4">
            <div className="flex items-center justify-between bg-white rounded-lg shadow p-4">
              <h1 className="text-lg font-semibold text-gray-900">Settings</h1>
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="p-2 rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-100"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  {menuOpen ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  )}
                </svg>
              </button>
            </div>
          </div>

          {/* Mobile Dropdown Menu */}
          {menuOpen && (
            <div className="sm:hidden mb-6 bg-white rounded-lg shadow-lg border border-gray-200 p-4">
              <div className="flex flex-col space-y-3">
                <a
                  href="/devices"
                  className="bg-white text-gray-700 hover:text-gray-900 px-4 py-2 rounded-lg border border-gray-200 transition-colors text-sm text-center"
                >
                  ← Devices
                </a>
                <button
                  onClick={signOut}
                  className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors text-sm"
                >
                  Sign Out
                </button>
              </div>
            </div>
          )}

          {/* Desktop Tab Navigation */}
          <div className="border-b border-gray-200 hidden sm:block">
            <nav className="-mb-px flex space-x-8">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`${
                    activeTab === tab.id
                      ? 'border-indigo-500 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  } whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm flex items-center`}
                >
                  <TabIcon icon={tab.icon} className="mr-2 h-5 w-5" />
                  {tab.name}
                </button>
              ))}
            </nav>
          </div>

          {/* Mobile Tab Selector - Card Style */}
          <div className="sm:hidden mb-4">
            <div className="grid grid-cols-2 gap-2">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`p-3 rounded-lg border-2 transition-all ${
                    activeTab === tab.id
                      ? 'bg-indigo-100 border-indigo-500 text-indigo-700 font-semibold shadow-md'
                      : 'bg-white border-gray-200 text-gray-700 hover:border-indigo-300 hover:bg-indigo-50'
                  }`}
                >
                  <div className="flex flex-col items-center gap-1">
                    <TabIcon icon={tab.icon} className="h-5 w-5" />
                    <span className="text-xs text-center">{tab.name}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6">
            {message.text && (
              <div className={`mb-4 p-4 rounded-md ${
                message.type === 'success'
                  ? 'bg-green-50 border border-green-200 text-green-600'
                  : 'bg-red-50 border border-red-200 text-red-600'
              }`}>
                {message.text}
              </div>
            )}

            {activeTab === 'profile' && (
              <div>
                <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">Profile Information</h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* First Name Card */}
                  <div className="bg-white shadow rounded-lg p-6 border border-gray-200 hover:border-indigo-300 transition-colors">
                    <div className="flex items-center mb-3">
                      <svg className="h-5 w-5 text-indigo-600 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      <label htmlFor="firstName" className="block text-sm font-medium text-gray-700">
                        First Name
                      </label>
                    </div>
                    <input
                      type="text"
                      id="firstName"
                      value={profileData.firstName}
                      onChange={(e) => setProfileData({...profileData, firstName: e.target.value})}
                      className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      placeholder="Enter first name"
                    />
                  </div>

                  {/* Last Name Card */}
                  <div className="bg-white shadow rounded-lg p-6 border border-gray-200 hover:border-indigo-300 transition-colors">
                    <div className="flex items-center mb-3">
                      <svg className="h-5 w-5 text-indigo-600 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      <label htmlFor="lastName" className="block text-sm font-medium text-gray-700">
                        Last Name
                      </label>
                    </div>
                    <input
                      type="text"
                      id="lastName"
                      value={profileData.lastName}
                      onChange={(e) => setProfileData({...profileData, lastName: e.target.value})}
                      className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      placeholder="Enter last name"
                    />
                  </div>

                  {/* Email Card */}
                  <div className="bg-white shadow rounded-lg p-6 border border-gray-200">
                    <div className="flex items-center mb-3">
                      <svg className="h-5 w-5 text-gray-400 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                        Email Address
                      </label>
                    </div>
                    <input
                      type="email"
                      id="email"
                      value={profileData.email}
                      disabled
                      className="block w-full border-gray-300 rounded-md shadow-sm bg-gray-50 text-gray-500 sm:text-sm cursor-not-allowed"
                    />
                    <p className="mt-2 text-xs text-gray-500">Email cannot be changed</p>
                  </div>

                  {/* Company Name Card */}
                  <div className="bg-white shadow rounded-lg p-6 border border-gray-200 hover:border-indigo-300 transition-colors">
                    <div className="flex items-center mb-3">
                      <svg className="h-5 w-5 text-indigo-600 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                      <label htmlFor="companyName" className="block text-sm font-medium text-gray-700">
                        Company Name
                      </label>
                    </div>
                    <input
                      type="text"
                      id="companyName"
                      value={profileData.companyName}
                      onChange={(e) => setProfileData({...profileData, companyName: e.target.value})}
                      className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      placeholder="Enter company name"
                    />
                  </div>

                  {/* Timezone Card */}
                  <div className="bg-white shadow rounded-lg p-6 border border-gray-200 hover:border-indigo-300 transition-colors sm:col-span-2">
                    <div className="flex items-center mb-3">
                      <svg className="h-5 w-5 text-indigo-600 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <label htmlFor="timezone" className="block text-sm font-medium text-gray-700">
                        Timezone
                      </label>
                    </div>
                    <select
                      id="timezone"
                      value={profileData.timezone}
                      onChange={(e) => setProfileData({...profileData, timezone: e.target.value})}
                      className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    >
                      <option value="Australia/Brisbane">Brisbane (AEST - No daylight saving)</option>
                      <option value="Australia/Sydney">Sydney (AEST/AEDT - With daylight saving)</option>
                      <option value="Australia/Melbourne">Melbourne (AEST/AEDT - With daylight saving)</option>
                      <option value="Australia/Adelaide">Adelaide (ACST/ACDT - With daylight saving)</option>
                      <option value="Australia/Perth">Perth (AWST - No daylight saving)</option>
                      <option value="Australia/Darwin">Darwin (ACST - No daylight saving)</option>
                    </select>
                    <p className="mt-2 text-xs text-gray-500">Choose your timezone for accurate date/time display</p>
                  </div>
                </div>

                {/* Save Button */}
                <div className="mt-6 flex justify-end">
                  <button
                    onClick={handleProfileSubmit}
                    disabled={loading}
                    className="inline-flex justify-center py-2 px-6 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? 'Saving...' : 'Save Profile'}
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'dex' && (
              <div className="bg-white shadow rounded-lg">
                <div className="px-4 py-5 sm:p-6">
                  <h3 className="text-lg leading-6 font-medium text-gray-900">DEX Platform Integration</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Configure your Cantaloupe DEX platform credentials to access vending machine data.
                  </p>

                  {dexCredentials.isConfigured && (
                    <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-md">
                      <div className="flex">
                        <div className="flex-shrink-0">
                          <svg className="h-5 w-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                        </div>
                        <div className="ml-3">
                          <p className="text-sm text-green-700">
                            DEX credentials are configured and active.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  <form onSubmit={handleDexCredentialsSubmit} className="mt-6 space-y-6">
                    <div>
                      <label htmlFor="siteUrl" className="block text-sm font-medium text-gray-700">
                        DEX Site URL
                      </label>
                      <input
                        type="url"
                        id="siteUrl"
                        value={dexCredentials.siteUrl || 'https://dashboard.cantaloupe.online'}
                        readOnly
                        className="mt-1 block w-full bg-gray-100 border-gray-300 rounded-md shadow-sm sm:text-sm text-gray-600 cursor-not-allowed"
                      />
                      <p className="mt-1 text-xs text-gray-500">Standard Cantaloupe platform URL (read-only)</p>
                    </div>

                    <div>
                      <label htmlFor="dexUsername" className="block text-sm font-medium text-gray-700">
                        Username
                      </label>
                      <input
                        type="text"
                        id="dexUsername"
                        value={dexCredentials.username}
                        onChange={(e) => setDexCredentials({...dexCredentials, username: e.target.value})}
                        className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        required
                      />
                    </div>

                    <div>
                      <label htmlFor="dexPassword" className="block text-sm font-medium text-gray-700">
                        Password
                      </label>
                      <input
                        type="password"
                        id="dexPassword"
                        placeholder={dexCredentials.isConfigured ? "••••••••••••" : "Enter password"}
                        value={dexCredentials.password}
                        onChange={(e) => setDexCredentials({...dexCredentials, password: e.target.value})}
                        className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        required
                      />
                      {dexCredentials.isConfigured && !dexCredentials.password && (
                        <p className="mt-1 text-xs text-gray-500">Password is saved. Enter to update.</p>
                      )}
                    </div>

                    <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
                      <div className="flex">
                        <div className="flex-shrink-0">
                          <svg className="h-5 w-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                        </div>
                        <div className="ml-3">
                          <p className="text-sm text-yellow-700">
                            <strong>Security Notice:</strong> Your credentials are encrypted and stored securely.
                            They are only used to authenticate with the DEX platform on your behalf.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-between">
                      <button
                        type="button"
                        onClick={testDexConnection}
                        disabled={loading || !dexCredentials.isConfigured}
                        className="inline-flex justify-center py-2 px-4 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                      >
                        {loading ? 'Testing...' : 'Test Connection'}
                      </button>

                      <button
                        type="submit"
                        disabled={loading}
                        className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                      >
                        {loading ? 'Saving...' : (dexCredentials.isConfigured ? 'Update Credentials' : 'Save Credentials')}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {activeTab === 'security' && (
              <div className="bg-white shadow rounded-lg">
                <div className="px-4 py-5 sm:p-6">
                  <h3 className="text-lg leading-6 font-medium text-gray-900">Security Settings</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Manage your account security and authentication settings.
                  </p>

                  <div className="mt-6 space-y-6">
                    <div>
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-medium text-gray-900">Change Password</h4>
                          <p className="text-sm text-gray-500">Update your account password.</p>
                        </div>
                        <button
                          onClick={() => setShowPasswordForm(!showPasswordForm)}
                          className="inline-flex justify-center py-2 px-4 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                        >
                          {showPasswordForm ? 'Cancel' : 'Change Password'}
                        </button>
                      </div>

                      {showPasswordForm && (
                        <form onSubmit={handlePasswordChange} className="mt-4 space-y-4 bg-gray-50 p-4 rounded-md">
                          <div>
                            <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-700">
                              Current Password
                            </label>
                            <input
                              type="password"
                              id="currentPassword"
                              value={passwordData.currentPassword}
                              onChange={(e) => setPasswordData({...passwordData, currentPassword: e.target.value})}
                              className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                              required
                            />
                          </div>

                          <div>
                            <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700">
                              New Password
                            </label>
                            <input
                              type="password"
                              id="newPassword"
                              value={passwordData.newPassword}
                              onChange={(e) => setPasswordData({...passwordData, newPassword: e.target.value})}
                              className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                              required
                              minLength={8}
                            />
                            <p className="mt-1 text-xs text-gray-500">Must be at least 8 characters long.</p>
                          </div>

                          <div>
                            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
                              Confirm New Password
                            </label>
                            <input
                              type="password"
                              id="confirmPassword"
                              value={passwordData.confirmPassword}
                              onChange={(e) => setPasswordData({...passwordData, confirmPassword: e.target.value})}
                              className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                              required
                            />
                          </div>

                          <div className="flex justify-end">
                            <button
                              type="submit"
                              disabled={loading}
                              className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                            >
                              {loading ? 'Changing Password...' : 'Update Password'}
                            </button>
                          </div>
                        </form>
                      )}
                    </div>

                    <div className="border-t border-gray-200 pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-medium text-gray-900">Sign Out</h4>
                          <p className="text-sm text-gray-500">Sign out of your account on this device.</p>
                        </div>
                        <button
                          onClick={signOut}
                          className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                        >
                          Sign Out
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'subscription' && (
              <div>
                {loadingSubscription && (
                  <div className="text-center py-12">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
                    <p className="mt-4 text-gray-600">Loading subscription details...</p>
                  </div>
                )}

                {!loadingSubscription && subscription && (
                  <>
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
                      <div className="flex items-center justify-between mb-6">
                        <h2 className="text-xl font-semibold text-gray-900">Current Subscription</h2>
                        <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusBadge(subscription.subscription_status)}`}>
                          {subscription.subscription_status?.charAt(0).toUpperCase() + subscription.subscription_status?.slice(1)}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <p className="text-sm text-gray-500 mb-1">Current Plan</p>
                          <p className="text-2xl font-bold text-indigo-600">{subscription.tier_name || 'No tier selected'}</p>
                          {subscription.is_promotional && (
                            <span className="inline-block mt-2 px-2 py-1 bg-purple-100 text-purple-800 text-xs font-medium rounded">
                              Promotional Account
                            </span>
                          )}
                        </div>

                        <div>
                          <p className="text-sm text-gray-500 mb-1">Machines</p>
                          <p className="text-2xl font-bold text-gray-900">
                            {subscription.machine_count} / {subscription.is_promotional ? '∞' : subscription.machine_limit}
                          </p>
                          {subscription.is_at_limit && !subscription.is_promotional && (
                            <p className="text-sm text-red-600 mt-1">⚠️ Machine limit reached</p>
                          )}
                        </div>

                        <div>
                          <p className="text-sm text-gray-500 mb-1">Billing Cycle</p>
                          <p className="text-lg font-medium text-gray-900 capitalize">{subscription.billing_cycle || 'N/A'}</p>
                        </div>

                        <div>
                          <p className="text-sm text-gray-500 mb-1">Current Price</p>
                          <p className="text-lg font-medium text-gray-900">
                            {subscription.current_price === 0 ? 'Free' : `$${subscription.current_price}/${subscription.billing_cycle === 'yearly' ? 'year' : 'month'}`}
                          </p>
                        </div>
                      </div>

                      {subscription.promotional_notes && (
                        <div className="mt-4 p-3 bg-purple-50 border border-purple-200 rounded">
                          <p className="text-sm text-purple-800">
                            <strong>Promotional Note:</strong> {subscription.promotional_notes}
                          </p>
                        </div>
                      )}

                      {subscription.tier_features && subscription.tier_features.length > 0 && (
                        <div className="mt-6">
                          <p className="text-sm font-medium text-gray-700 mb-2">Current Features:</p>
                          <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {subscription.tier_features.map((feature, idx) => (
                              <li key={idx} className="flex items-start">
                                <svg className="h-5 w-5 text-green-500 mt-0.5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                <span className="text-sm text-gray-700">{feature}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>

                    {!subscription.is_promotional && tiers.length > 0 && (
                      <div>
                        <h2 className="text-xl font-semibold text-gray-900 mb-4">Available Plans</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                          {tiers.map((tier) => {
                            const isCurrentTier = tier.name === subscription.tier_name
                            const isBetterTier = tier.machine_limit > subscription.machine_limit

                            return (
                              <div
                                key={tier.id}
                                className={`bg-white rounded-lg shadow-sm border-2 p-6 ${
                                  isCurrentTier
                                    ? 'border-indigo-500 ring-2 ring-indigo-500'
                                    : 'border-gray-200 hover:border-indigo-300'
                                }`}
                              >
                                {isCurrentTier && (
                                  <span className="inline-block mb-3 px-2 py-1 bg-indigo-100 text-indigo-800 text-xs font-medium rounded">
                                    Current Plan
                                  </span>
                                )}

                                <h3 className="text-lg font-bold text-gray-900 mb-2">{tier.name}</h3>
                                <p className="text-sm text-gray-600 mb-4">{tier.description}</p>

                                <div className="mb-4">
                                  <p className="text-3xl font-bold text-gray-900">
                                    ${tier.price_monthly}
                                    <span className="text-base font-normal text-gray-500">/mo</span>
                                  </p>
                                  {tier.price_yearly > 0 && (
                                    <p className="text-sm text-gray-500">
                                      or ${tier.price_yearly}/year (save ${(tier.price_monthly * 12 - tier.price_yearly).toFixed(0)})
                                    </p>
                                  )}
                                </div>

                                <div className="mb-4">
                                  <p className="text-sm font-medium text-gray-700">
                                    Up to {tier.machine_limit === 999999 ? 'Unlimited' : tier.machine_limit} machines
                                  </p>
                                </div>

                                {tier.features && tier.features.length > 0 && (
                                  <ul className="space-y-2 mb-6">
                                    {tier.features.slice(0, 4).map((feature, idx) => (
                                      <li key={idx} className="flex items-start text-sm text-gray-600">
                                        <svg className="h-4 w-4 text-green-500 mt-0.5 mr-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                        {feature}
                                      </li>
                                    ))}
                                  </ul>
                                )}

                                {!isCurrentTier && isBetterTier && (
                                  <button
                                    onClick={() => setMessage({ type: 'info', text: 'Contact support to upgrade your plan' })}
                                    className="w-full bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 transition-colors font-medium"
                                  >
                                    Upgrade
                                  </button>
                                )}

                                {!isCurrentTier && !isBetterTier && (
                                  <button
                                    disabled
                                    className="w-full bg-gray-200 text-gray-500 px-4 py-2 rounded-md cursor-not-allowed font-medium"
                                  >
                                    Lower Tier
                                  </button>
                                )}

                                {isCurrentTier && (
                                  <button
                                    disabled
                                    className="w-full bg-gray-100 text-gray-500 px-4 py-2 rounded-md cursor-not-allowed font-medium"
                                  >
                                    Current Plan
                                  </button>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {subscription.is_promotional && (
                      <div className="bg-purple-50 border border-purple-200 rounded-lg p-6">
                        <h3 className="text-lg font-medium text-purple-900 mb-2">Promotional Account</h3>
                        <p className="text-purple-800">
                          You have unlimited access to all features. Plan upgrades are not available for promotional accounts.
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {activeTab === 'configuration' && (
              <div className="bg-white shadow rounded-lg">
                <div className="px-4 py-5 sm:p-6">
                  <h3 className="text-lg leading-6 font-medium text-gray-900">Configuration</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Manage system configuration options for your vending machines.
                  </p>

                  {/* Machine Types Section */}
                  <div className="mt-8">
                    <h4 className="text-base font-medium text-gray-900">Machine Types</h4>
                    <p className="mt-1 text-sm text-gray-500">
                      Define the machine types available for your vending machines. These types will be used in CSV imports and exports.
                      Inactive types cannot be used in new imports but existing machines will retain their type.
                    </p>

                    <div className="mt-4">
                      {/* Machine Types Table */}
                      <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 rounded-lg mb-4">
                        <table className="min-w-full divide-y divide-gray-300">
                          <thead className="bg-gray-50">
                            <tr>
                              <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900">Type Name</th>
                              <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Status</th>
                              <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Machines Using</th>
                              <th scope="col" className="relative py-3.5 pl-3 pr-4">
                                <span className="sr-only">Actions</span>
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200 bg-white">
                            {machineTypes.map((type) => {
                              const count = machineTypeUsage[type.name] || 0
                              const isDefaultType = type.name === 'unknown'
                              const canDeactivate = !isDefaultType && (count === 0 || type.active === false)

                              return (
                                <tr key={type.name}>
                                  <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900">
                                    {type.name}
                                    {isDefaultType && (
                                      <span className="ml-2 text-xs text-gray-500">(default)</span>
                                    )}
                                  </td>
                                  <td className="whitespace-nowrap px-3 py-4 text-sm">
                                    {type.active ? (
                                      <span className="inline-flex items-center rounded-md bg-green-50 px-2 py-1 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
                                        Active
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center rounded-md bg-gray-50 px-2 py-1 text-xs font-medium text-gray-600 ring-1 ring-inset ring-gray-500/10">
                                        Inactive
                                      </span>
                                    )}
                                  </td>
                                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                                    {count} {count === 1 ? 'machine' : 'machines'}
                                  </td>
                                  <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm">
                                    <button
                                      onClick={async () => {
                                        const newTypes = machineTypes.map(t =>
                                          t.name === type.name ? { ...t, active: !t.active } : t
                                        )
                                        setMachineTypes(newTypes)
                                        const saved = await saveCompanySettings({ machineTypes: newTypes })
                                        if (saved) {
                                          setMessage({ type: 'success', text: `Machine type "${type.name}" ${type.active ? 'deactivated' : 'activated'}` })
                                          await loadMachineTypeUsage() // Refresh counts
                                        } else {
                                          setMessage({ type: 'error', text: 'Failed to save settings' })
                                          setMachineTypes(machineTypes) // Revert on error
                                        }
                                      }}
                                      disabled={!canDeactivate && type.active}
                                      className="text-indigo-600 hover:text-indigo-900 disabled:text-gray-400 disabled:cursor-not-allowed font-medium"
                                      title={
                                        isDefaultType && type.active
                                          ? 'Cannot deactivate: This is the default type used during data capture'
                                          : !canDeactivate && type.active
                                          ? `Cannot deactivate: ${count} machines currently using this type`
                                          : ''
                                      }
                                    >
                                      {type.active ? 'Deactivate' : 'Activate'}
                                    </button>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Add New Machine Type */}
                      <div className="border-t border-gray-200 pt-4">
                        <h5 className="text-sm font-medium text-gray-900 mb-2">Add New Machine Type</h5>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={newMachineType}
                            onChange={(e) => setNewMachineType(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                            placeholder="Enter new machine type (e.g., snack, combo)"
                            className="flex-1 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                            onKeyPress={async (e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                const exists = machineTypes.some(t => t.name === newMachineType)
                                if (newMachineType && !exists) {
                                  const newTypes = [...machineTypes, { name: newMachineType, active: true }]
                                  setMachineTypes(newTypes)
                                  const saved = await saveCompanySettings({ machineTypes: newTypes })
                                  if (saved) {
                                    setNewMachineType('')
                                    setMessage({ type: 'success', text: `Machine type "${newMachineType}" added` })
                                    await loadMachineTypeUsage()
                                  } else {
                                    setMessage({ type: 'error', text: 'Failed to save settings' })
                                    setMachineTypes(machineTypes) // Revert on error
                                  }
                                } else if (exists) {
                                  setMessage({ type: 'error', text: `Machine type "${newMachineType}" already exists` })
                                }
                              }
                            }}
                          />
                          <button
                            onClick={async () => {
                              const exists = machineTypes.some(t => t.name === newMachineType)
                              if (newMachineType && !exists) {
                                const newTypes = [...machineTypes, { name: newMachineType, active: true }]
                                setMachineTypes(newTypes)
                                const saved = await saveCompanySettings({ machineTypes: newTypes })
                                if (saved) {
                                  setNewMachineType('')
                                  setMessage({ type: 'success', text: `Machine type "${newMachineType}" added` })
                                  await loadMachineTypeUsage()
                                } else {
                                  setMessage({ type: 'error', text: 'Failed to save settings' })
                                  setMachineTypes(machineTypes) // Revert on error
                                }
                              } else if (exists) {
                                setMessage({ type: 'error', text: `Machine type "${newMachineType}" already exists` })
                              }
                            }}
                          disabled={!newMachineType}
                          className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-gray-300 disabled:cursor-not-allowed"
                        >
                          Add Type
                        </button>
                        <p className="mt-2 text-xs text-gray-500">
                          Note: Machine types are lowercase alphanumeric with hyphens/underscores only.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            )}

            {activeTab === 'admin' && isAdmin && (
              <div className="bg-white shadow rounded-lg">
                <div className="px-4 py-5 sm:p-6">
                  <h3 className="text-lg leading-6 font-medium text-gray-900">Admin - User Impersonation</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    View and debug user accounts by impersonating their company access.
                  </p>

                  {isImpersonating && (
                    <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-md">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          <svg className="h-5 w-5 text-yellow-400 mr-2" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                          <p className="text-sm font-medium text-yellow-800">
                            Currently impersonating company ID: {companyId}
                          </p>
                        </div>
                        <button
                          onClick={stopImpersonating}
                          className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                        >
                          Stop Impersonating
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="mt-6">
                    <h4 className="text-sm font-medium text-gray-900 mb-4">All Users</h4>
                    <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 rounded-lg">
                      <table className="min-w-full divide-y divide-gray-300">
                        <thead className="bg-gray-50">
                          <tr>
                            <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900">Company ID</th>
                            <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Company Name</th>
                            <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">DEX Credentials</th>
                            <th scope="col" className="relative py-3.5 pl-3 pr-4">
                              <span className="sr-only">Actions</span>
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 bg-white">
                          {users.length === 0 ? (
                            <tr>
                              <td colSpan="4" className="text-center py-4 text-sm text-gray-500">
                                No users found
                              </td>
                            </tr>
                          ) : (
                            users.map((userRecord) => (
                              <tr key={userRecord.companyId}>
                                <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-mono text-gray-900">
                                  {userRecord.companyId?.substring(0, 8)}...
                                </td>
                                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-900">
                                  {userRecord.companyName}
                                </td>
                                <td className="whitespace-nowrap px-3 py-4 text-sm">
                                  {userRecord.hasDexCredentials ? (
                                    <span className="inline-flex items-center rounded-md bg-green-50 px-2 py-1 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
                                      ✓ Configured
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center rounded-md bg-gray-50 px-2 py-1 text-xs font-medium text-gray-600 ring-1 ring-inset ring-gray-500/10">
                                      Not Configured
                                    </span>
                                  )}
                                </td>
                                <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm">
                                  <button
                                    onClick={() => {
                                      impersonateCompany(userRecord.companyId)
                                      setMessage({ type: 'success', text: `Now viewing data for: ${userRecord.companyName}` })
                                    }}
                                    disabled={isImpersonating && companyId === userRecord.companyId}
                                    className="text-indigo-600 hover:text-indigo-900 disabled:text-gray-400 disabled:cursor-not-allowed font-medium"
                                  >
                                    {isImpersonating && companyId === userRecord.companyId ? 'Active' : 'Impersonate'}
                                  </button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function TabIcon({ icon, className }) {
  const icons = {
    user: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
    'credit-card': (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
      </svg>
    ),
    server: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
      </svg>
    ),
    shield: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
    cog: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    admin: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
      </svg>
    )
  }

  return icons[icon] || null
}