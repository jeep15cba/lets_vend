import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { useAuth } from '../contexts/AuthContext'
import Navigation from '../components/Navigation'
import axios from 'axios'

export default function SubscriptionPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [subscription, setSubscription] = useState(null)
  const [tiers, setTiers] = useState([])
  const [loadingData, setLoadingData] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!user && !loading) {
      router.push('/login')
    }
  }, [user, loading, router])

  useEffect(() => {
    if (!user) return

    const fetchData = async () => {
      try {
        setLoadingData(true)

        // Fetch current subscription and available tiers in parallel
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
        setError(err.message)
      } finally {
        setLoadingData(false)
      }
    }

    fetchData()
  }, [user])

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-600"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

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
    <>
      <Head>
        <title>Subscription - VendTrack</title>
        <meta name="description" content="Manage your VendTrack subscription" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <Navigation />

      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">Subscription Management</h1>

          {/* Error State */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-red-800">{error}</p>
            </div>
          )}

          {/* Loading State */}
          {loadingData && (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
              <p className="mt-4 text-gray-600">Loading subscription details...</p>
            </div>
          )}

          {/* Current Subscription */}
          {!loadingData && subscription && (
            <>
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
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

              {/* Available Tiers */}
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
                              onClick={() => alert('Contact support to upgrade your plan')}
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

              {/* Promotional Account Notice */}
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
      </div>
    </>
  )
}
