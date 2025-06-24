import Stripe from 'stripe'

// Server-side Stripe initialization
let stripeInstance: Stripe | null = null

if (typeof window === 'undefined') {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is not set in environment variables')
  }
  
  // Log available environment variables (but not their values)
  console.log('Available Stripe-related env vars:', {
    STRIPE_SECRET_KEY: !!process.env.STRIPE_SECRET_KEY,
    NEXT_PUBLIC_STRIPE_BASIC_PRICE_ID: !!process.env.NEXT_PUBLIC_STRIPE_BASIC_PRICE_ID,
    NEXT_PUBLIC_STRIPE_PRO_PRICE_ID: !!process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID,
    NEXT_PUBLIC_STRIPE_ENTERPRISE_PRICE_ID: !!process.env.NEXT_PUBLIC_STRIPE_ENTERPRISE_PRICE_ID,
  })

  stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2025-05-28.basil',
    typescript: true,
  })
}

export const stripe = stripeInstance

// Safe to use on client side - no sensitive data
export const SUBSCRIPTION_PLANS = {
  free: {
    name: 'Free',
    priceId: null,
    price: 0,
    period: null,
    features: {
      documents: 5,
      storage: '5GB',
      retention: '30 days',
      priority: 'Standard',
      support: 'Community',
      extras: ['Basic translation features', 'PDF and HTML output'],
    },
    limits: {
      documentsCount: 5,
      storageBytes: 5 * 1024 * 1024 * 1024, // 5GB
    }
  },
  pro: {
    name: 'Pro',
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID,
    price: 9.99,
    period: 'month',
    features: {
      documents: 500,
      storage: '25GB',
      retention: 'Unlimited',
      priority: 'Priority processing with Gemini 2.0 Flash',
      support: 'Priority support',
      extras: [
        'All free features',
        'Batch processing',
        'Custom glossaries',
        'API access',
        'Gemini 2.0 Flash translations',
        'Advanced export options'
      ],
    },
    limits: {
      documentsCount: 500,
      storageBytes: 25 * 1024 * 1024 * 1024, // 25GB
    }
  },
  enterprise: {
    name: 'Enterprise',
    priceId: process.env.NEXT_PUBLIC_STRIPE_ENTERPRISE_PRICE_ID,
    price: 49.99,
    period: 'month',
    features: {
      documents: 'Unlimited',
      storage: '100GB',
      retention: 'Unlimited',
      priority: 'Highest priority with dedicated support',
      support: '24/7 dedicated support',
      extras: [
        'All Pro features',
        'Custom integrations',
        'Dedicated account manager',
        'SLA guarantees',
        'Custom deployment options',
        'Team management'
      ],
    },
    limits: {
      documentsCount: Infinity,
      storageBytes: 100 * 1024 * 1024 * 1024, // 100GB
    }
  }
} as const

export type SubscriptionPlan = keyof typeof SUBSCRIPTION_PLANS

// Helper function to get plan details - safe for client side
export function getPlanDetails(planName: SubscriptionPlan) {
  return SUBSCRIPTION_PLANS[planName]
}

// Helper function to check if user has reached limits - safe for client side
export function hasReachedLimit(
  currentCount: number,
  planName: SubscriptionPlan,
  limitType: 'documents' | 'storage'
) {
  const plan = SUBSCRIPTION_PLANS[planName]
  
  if (limitType === 'documents') {
    return plan.limits.documentsCount !== -1 && currentCount >= plan.limits.documentsCount
  }
  
  return false
}

// Get upgrade suggestions - safe for client side
export function getUpgradeSuggestion(
  currentPlan: SubscriptionPlan,
  documentsCount: number,
  storageBytes: number
) {
  const plans = Object.entries(SUBSCRIPTION_PLANS) as [SubscriptionPlan, typeof SUBSCRIPTION_PLANS[SubscriptionPlan]][]
  
  for (const [planKey, plan] of plans) {
    if (planKey === currentPlan) continue
    
    const canHandle = (plan.limits.documentsCount === -1 || documentsCount <= plan.limits.documentsCount) &&
                     storageBytes <= plan.limits.storageBytes
    
    if (canHandle) {
      return {
        suggested: planKey,
        reason: documentsCount > SUBSCRIPTION_PLANS[currentPlan].limits.documentsCount 
          ? 'document limit' 
          : 'storage limit'
      }
    }
  }
  
  return null
} 