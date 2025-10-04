import Link from 'next/link'
import { useRouter } from 'next/router'
import { useAuth } from '../contexts/AuthContext'

export default function Navigation() {
  const router = useRouter()
  const { user, signOut, hasCredentials } = useAuth()

  console.log('🔧 Navigation: hasCredentials =', hasCredentials, 'user =', !!user)

  // Base navigation items
  const baseNavigation = [
    { name: 'Settings', href: '/settings' }
  ]

  // Protected navigation items (require credentials)
  const protectedNavigation = [
    { name: 'Devices', href: '/devices' },
    { name: 'DEX Data', href: '/dex' },
  ]

  // Combine navigation based on credential status
  const navigation = hasCredentials ? [...protectedNavigation, ...baseNavigation] : baseNavigation

  return (
    <nav className="bg-white shadow">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <Link href={hasCredentials ? "/devices" : "/settings"} className="flex-shrink-0 flex items-center">
              <svg className="h-8 w-8 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              <span className="ml-2 text-xl font-bold text-gray-900">VendTrack</span>
            </Link>
            <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
              {!hasCredentials && (
                <div className="inline-flex items-center px-1 pt-1 text-sm text-gray-400">
                  Configure credentials in Settings to access navigation
                </div>
              )}
              {navigation.map((item) => {
                const isActive = router.pathname === item.href
                const isProtected = protectedNavigation.some(nav => nav.href === item.href)

                if (isProtected && !hasCredentials) {
                  return (
                    <div
                      key={item.name}
                      className="border-transparent text-gray-300 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium cursor-not-allowed"
                      title="Credentials required"
                    >
                      {item.name}
                    </div>
                  )
                }

                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`${
                      isActive
                        ? 'border-indigo-500 text-gray-900'
                        : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                    } inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium`}
                  >
                    {item.name}
                  </Link>
                )
              })}
            </div>
          </div>
          <div className="hidden sm:ml-6 sm:flex sm:items-center">
            <div className="ml-3 relative">
              <div className="flex items-center space-x-4">
                <span className="text-gray-700 text-sm">
                  {user?.user_metadata?.name || user?.email}
                </span>
                <button
                  onClick={signOut}
                  className="text-gray-500 hover:text-gray-700 px-3 py-2 rounded-md text-sm font-medium"
                >
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </nav>
  )
}