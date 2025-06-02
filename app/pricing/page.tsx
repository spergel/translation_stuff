'use client'

import { useState, useEffect } from 'react'
import { useSession, signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Header from '../components/Header'
import { Check, Zap, Crown, Building, AlertCircle } from 'lucide-react'
import { SUBSCRIPTION_PLANS } from '../lib/stripe'

export default function PricingPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Validate price IDs on component mount
  useEffect(() => {
    const missingPriceIds = Object.entries(SUBSCRIPTION_PLANS)
      .filter(([key, plan]) => key !== 'free' && !plan.priceId)
      .map(([key]) => key)

    if (missingPriceIds.length > 0) {
      setError(`Missing Stripe price IDs for: ${missingPriceIds.join(', ')}`)
    }
  }, [])

  const handleUpgrade = async (planKey: string) => {
    if (!session?.user) {
      // Redirect to sign in and then back to pricing
      signIn('google', { callbackUrl: '/pricing' })
      return
    }

    const plan = SUBSCRIPTION_PLANS[planKey as keyof typeof SUBSCRIPTION_PLANS]
    if (!plan.priceId) {
      alert('This plan is not properly configured. Please contact support.')
      return
    }

    setLoading(planKey)
    setError(null)

    try {
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          plan: planKey,
          returnUrl: '/pricing',
        }),
      })

      const data = await response.json()
      console.log('Checkout response:', data)

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create checkout session')
      }

      if (!data.checkoutUrl) {
        throw new Error('No checkout URL returned')
      }

      console.log('Redirecting to:', data.checkoutUrl)
      window.location.href = data.checkoutUrl

    } catch (error) {
      console.error('Checkout error details:', error)
      setError(error instanceof Error ? error.message : 'Failed to start checkout. Please try again.')
    } finally {
      setLoading(null)
    }
  }

  // Downgrade handler
  const handleDowngrade = async () => {
    setLoading('downgrade')
    setError(null)
    try {
      const response = await fetch('/api/stripe/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to cancel subscription')
      // Optionally, refresh session or page
      router.refresh?.() // Next.js 13+ or fallback
      window.location.reload()
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to cancel subscription. Please try again.')
    } finally {
      setLoading(null)
    }
  }

  // Convert plans object to array for mapping
  const plans = Object.entries(SUBSCRIPTION_PLANS).map(([key, plan]) => {
    const icons = {
      free: <Zap className="h-8 w-8 text-amber-600" />,
      basic: <Check className="h-8 w-8 text-blue-600" />,
      pro: <Crown className="h-8 w-8 text-purple-600" />,
      enterprise: <Building className="h-8 w-8 text-emerald-600" />
    }

    const descriptions = {
      free: 'Perfect for trying out our service',
      basic: 'Great for individuals and small projects',
      pro: 'Most popular for professionals',
      enterprise: 'For teams and organizations'
    }

    return {
      key,
      ...plan,
      popular: key === 'pro',
      icon: icons[key as keyof typeof icons],
      description: descriptions[key as keyof typeof descriptions]
    }
  }).filter(plan => plan.key !== 'free') // Exclude free plan from display

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary-50 to-white">
      <Header />
      
      <main className="max-w-7xl mx-auto py-16 px-4 sm:px-6 lg:px-8">
        {/* Downgrade to Free Button */}
        {session?.user && session.user.tier !== 'free' && (
          <div className="flex justify-center mb-10">
            <button
              onClick={handleDowngrade}
              disabled={loading === 'downgrade'}
              className="py-3 px-8 rounded-xl bg-gradient-to-r from-gray-200 to-gray-100 text-primary-300 font-semibold shadow hover:from-gray-300 hover:to-gray-200 border border-gray-300 transition-all duration-200"
            >
              {loading === 'downgrade' ? 'Processing...' : 'Downgrade to Free'}
            </button>
          </div>
        )}

        {/* Hero Section */}
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold text-primary-300 mb-6 font-serif">
            Choose Your Perfect Plan
          </h1>
          <p className="text-xl text-primary-200 max-w-2xl mx-auto leading-relaxed">
            Transform your documents with AI-powered translation. Simple pricing, powerful features.
          </p>
        </div>

        {error && (
          <div className="max-w-md mx-auto mb-8 p-4 bg-red-50 border border-red-200 rounded-lg shadow-sm">
            <div className="flex items-center text-red-700">
              <AlertCircle className="h-5 w-5 mr-2" />
              <p className="text-sm">{error}</p>
            </div>
          </div>
        )}

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-7xl mx-auto">
          {plans.map((plan) => (
            <div
              key={plan.key}
              className={`relative bg-white rounded-2xl shadow-xl border-2 transition-all duration-300 hover:shadow-2xl transform hover:-translate-y-1 ${
                plan.popular 
                  ? 'border-purple-400 ring-4 ring-purple-50' 
                  : 'border-amber-200 hover:border-amber-300'
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-5 left-1/2 transform -translate-x-1/2">
                  <span className="bg-gradient-to-r from-purple-600 to-purple-700 text-white px-6 py-2 rounded-full text-sm font-medium shadow-lg">
                    Most Popular
                  </span>
                </div>
              )}

              <div className="p-8">
                {/* Plan Header */}
                <div className="text-center mb-8">
                  <div className="flex justify-center mb-4">
                    <div className={`p-3 rounded-full ${
                      plan.popular ? 'bg-purple-50' : 'bg-amber-50'
                    }`}>
                      {plan.icon}
                    </div>
                  </div>
                  <h3 className="text-2xl font-bold text-primary-300 mb-3">
                    {plan.name}
                  </h3>
                  <p className="text-sm text-primary-200 mb-6">
                    {plan.description}
                  </p>
                  <div className="mb-6">
                    <span className="text-4xl font-bold text-primary-300">
                      ${plan.price}
                    </span>
                    {plan.period && (
                      <span className="text-primary-200 ml-2">/{plan.period}</span>
                    )}
                  </div>
                </div>

                {/* Core Features */}
                <div className="space-y-4 mb-8">
                  <div className="flex items-center">
                    <div className={`p-1 rounded-full ${
                      plan.popular ? 'bg-purple-50' : 'bg-amber-50'
                    } mr-3`}>
                      <Check className="h-4 w-4 text-green-600" />
                    </div>
                    <span className="text-sm text-primary-300">
                      {typeof (plan.features as any).documents === 'number' 
                        ? `${(plan.features as any).documents.toLocaleString()} documents stored`
                        : (plan.features as any).documents === 'Unlimited'
                          ? 'Unlimited documents stored'
                          : (plan.features as any).documents
                      }
                    </span>
                  </div>
                  <div className="flex items-center">
                    <div className={`p-1 rounded-full ${
                      plan.popular ? 'bg-purple-50' : 'bg-amber-50'
                    } mr-3`}>
                      <Check className="h-4 w-4 text-green-600" />
                    </div>
                    <span className="text-sm text-primary-300">
                      {plan.features.storage} storage
                    </span>
                  </div>
                  <div className="flex items-center">
                    <div className={`p-1 rounded-full ${
                      plan.popular ? 'bg-purple-50' : 'bg-amber-50'
                    } mr-3`}>
                      <Check className="h-4 w-4 text-green-600" />
                    </div>
                    <span className="text-sm text-primary-300">
                      {plan.features.retention} retention
                    </span>
                  </div>
                  <div className="flex items-center">
                    <div className={`p-1 rounded-full ${
                      plan.popular ? 'bg-purple-50' : 'bg-amber-50'
                    } mr-3`}>
                      <Check className="h-4 w-4 text-green-600" />
                    </div>
                    <span className="text-sm text-primary-300">
                      {plan.features.priority}
                    </span>
                  </div>
                  <div className="flex items-center">
                    <div className={`p-1 rounded-full ${
                      plan.popular ? 'bg-purple-50' : 'bg-amber-50'
                    } mr-3`}>
                      <Check className="h-4 w-4 text-green-600" />
                    </div>
                    <span className="text-sm text-primary-300">
                      {plan.features.support}
                    </span>
                  </div>
                </div>

                {/* Additional Features */}
                <div className="space-y-3 mb-8 pt-6 border-t border-gray-100">
                  <p className="text-xs font-semibold text-primary-200 uppercase tracking-wider mb-4">Included Features</p>
                  {plan.features.extras.map((feature, index) => (
                    <div key={index} className="flex items-center">
                      <div className={`p-1 rounded-full ${
                        plan.popular ? 'bg-purple-50' : 'bg-amber-50'
                      } mr-3`}>
                        <Check className="h-3 w-3 text-green-600" />
                      </div>
                      <span className="text-sm text-primary-300">
                        {feature}
                      </span>
                    </div>
                  ))}
                </div>

                {/* CTA Button */}
                <div className="text-center">
                  {plan.key === 'free' ? (
                    <button 
                      disabled
                      className="w-full py-3 px-6 rounded-xl bg-gray-100 text-gray-500 cursor-not-allowed font-medium"
                    >
                      Current Plan
                    </button>
                  ) : session?.user?.tier === plan.key ? (
                    <button 
                      disabled
                      className="w-full py-3 px-6 rounded-xl bg-gray-100 text-gray-500 cursor-not-allowed font-medium"
                    >
                      Current Plan
                    </button>
                  ) : (
                    <button
                      onClick={() => handleUpgrade(plan.key)}
                      disabled={loading === plan.key}
                      className={`w-full py-3 px-6 rounded-xl font-medium transition-all duration-200 ${
                        plan.popular 
                          ? 'bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white shadow-lg hover:shadow-xl' 
                          : 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white shadow-lg hover:shadow-xl'
                      }`}
                    >
                      {loading === plan.key ? (
                        <div className="flex items-center justify-center">
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                          Processing...
                        </div>
                      ) : (
                        `Upgrade to ${plan.name}`
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* FAQ Section */}
        <div className="mt-24">
          <h2 className="text-3xl font-bold text-primary-300 text-center mb-12">
            Frequently Asked Questions
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <div className="bg-white rounded-xl p-6 shadow-lg border border-amber-100">
              <h3 className="font-semibold text-lg text-primary-300 mb-3">
                Can I change my plan anytime?
              </h3>
              <p className="text-primary-200">
                Yes! You can upgrade or downgrade your plan at any time. Changes take effect immediately.
              </p>
            </div>
            <div className="bg-white rounded-xl p-6 shadow-lg border border-amber-100">
              <h3 className="font-semibold text-lg text-primary-300 mb-3">
                What happens if I cancel?
              </h3>
              <p className="text-primary-200">
                You'll keep access until your current billing period ends, then you'll be moved to the free plan.
              </p>
            </div>
            <div className="bg-white rounded-xl p-6 shadow-lg border border-amber-100">
              <h3 className="font-semibold text-lg text-primary-300 mb-3">
                Do you offer student discounts?
              </h3>
              <p className="text-primary-200">
                Yes! Users with .edu email addresses automatically get Pro features for free.
              </p>
            </div>
            <div className="bg-white rounded-xl p-6 shadow-lg border border-amber-100">
              <h3 className="font-semibold text-lg text-primary-300 mb-3">
                What payment methods do you accept?
              </h3>
              <p className="text-primary-200">
                We accept all major credit cards through Stripe's secure payment processing.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
} 