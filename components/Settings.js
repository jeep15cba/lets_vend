import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import Navigation from './Navigation'

export default function Settings() {
  const { user, signOut } = useAuth()
  const [activeTab, setActiveTab] = useState('profile')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState({ type: '', text: '' })

  // Profile form state
  const [profileData, setProfileData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    companyName: ''
  })

  // DEX credentials form state
  const [dexCredentials, setDexCredentials] = useState({
    username: '',
    password: '',
    siteUrl: '',
    isConfigured: false
  })

  useEffect(() => {
    // Load user profile data from API to get complete information including company name
    loadProfileData()
    // Load existing DEX credentials
    loadDexCredentials()
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
          companyName: data.user.user_metadata?.company_name || data.companyName || ''
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
        setMessage({ type: 'success', text: 'Profile updated successfully!' })
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
        // Navigation will update automatically when user session refreshes with new metadata
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

  const tabs = [
    { id: 'profile', name: 'Profile', icon: 'user' },
    { id: 'dex', name: 'DEX Integration', icon: 'server' },
    { id: 'security', name: 'Security', icon: 'shield' }
  ]


  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />

      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="border-b border-gray-200">
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
              <div className="bg-white shadow rounded-lg">
                <div className="px-4 py-5 sm:p-6">
                  <h3 className="text-lg leading-6 font-medium text-gray-900">Profile Information</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Update your personal information and company details.
                  </p>

                  <form onSubmit={handleProfileSubmit} className="mt-6 space-y-6">
                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                      <div>
                        <label htmlFor="firstName" className="block text-sm font-medium text-gray-700">
                          First name
                        </label>
                        <input
                          type="text"
                          id="firstName"
                          value={profileData.firstName}
                          onChange={(e) => setProfileData({...profileData, firstName: e.target.value})}
                          className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        />
                      </div>

                      <div>
                        <label htmlFor="lastName" className="block text-sm font-medium text-gray-700">
                          Last name
                        </label>
                        <input
                          type="text"
                          id="lastName"
                          value={profileData.lastName}
                          onChange={(e) => setProfileData({...profileData, lastName: e.target.value})}
                          className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                        Email address
                      </label>
                      <input
                        type="email"
                        id="email"
                        value={profileData.email}
                        disabled
                        className="mt-1 block w-full border-gray-300 rounded-md shadow-sm bg-gray-50 text-gray-500 sm:text-sm"
                      />
                      <p className="mt-1 text-xs text-gray-500">Email cannot be changed here.</p>
                    </div>

                    <div>
                      <label htmlFor="companyName" className="block text-sm font-medium text-gray-700">
                        Company name
                      </label>
                      <input
                        type="text"
                        id="companyName"
                        value={profileData.companyName}
                        onChange={(e) => setProfileData({...profileData, companyName: e.target.value})}
                        className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      />
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={loading}
                        className="ml-3 inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                      >
                        {loading ? 'Saving...' : 'Save Profile'}
                      </button>
                    </div>
                  </form>
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
                        placeholder={dexCredentials.isConfigured ? "••••••••" : "Enter password"}
                        value={dexCredentials.password}
                        onChange={(e) => setDexCredentials({...dexCredentials, password: e.target.value})}
                        className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        required={!dexCredentials.isConfigured}
                      />
                      {dexCredentials.isConfigured && (
                        <p className="mt-1 text-xs text-gray-500">Leave blank to keep current password.</p>
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
                        {loading ? 'Saving...' : 'Save Credentials'}
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
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-medium text-gray-900">Change Password</h4>
                        <p className="text-sm text-gray-500">Update your account password.</p>
                      </div>
                      <button className="inline-flex justify-center py-2 px-4 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
                        Change Password
                      </button>
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
    server: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
      </svg>
    ),
    shield: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    )
  }

  return icons[icon] || null
}