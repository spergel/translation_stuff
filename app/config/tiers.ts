// SaaS Tier Configuration
export interface TierConfig {
  name: string
  maxPages: number // -1 for unlimited
  batchSize: number // How many pages to process concurrently
  maxFileSize: number // Max file size in MB
  priority: 'low' | 'normal' | 'high'
  // NEW: Pricing and business model fields
  monthlyPageLimit: number // Monthly page allowance
  subscriptionPrice: number // Monthly price in USD
  costPerPage: number // Our cost per page
  profitMargin: number // Profit margin percentage
  overageRate?: number // Price per page over limit
}

export const TIER_CONFIGS: Record<string, TierConfig> = {
  free: {
    name: 'Free',
    maxPages: 20, // Per chunk limit (was 10)
    batchSize: 1,
    maxFileSize: 10,
    priority: 'low',
    monthlyPageLimit: 100, // 100 pages per month
    subscriptionPrice: 0,
    costPerPage: 0.000161,
    profitMargin: 0, // Free tier - no profit
    overageRate: 0.01 // $0.01 per page over limit
  },
  
  starter: {
    name: 'Starter ($4.99/month)',
    maxPages: 20, // Per chunk limit (consistent across tiers)
    batchSize: 2,
    maxFileSize: 25,
    priority: 'normal',
    monthlyPageLimit: 500, // 500 pages per month
    subscriptionPrice: 4.99,
    costPerPage: 0.000161,
    profitMargin: 98, // ~98% profit margin (cost: $0.08, price: $4.99)
    overageRate: 0.005 // $0.005 per page over limit
  },
  
  pro: {
    name: 'Pro ($14.99/month)',
    maxPages: 20, // Per chunk limit (consistent across tiers)
    batchSize: 3,
    maxFileSize: 100,
    priority: 'normal',
    monthlyPageLimit: 2000, // 2000 pages per month  
    subscriptionPrice: 14.99,
    costPerPage: 0.000161,
    profitMargin: 98, // ~98% profit margin (cost: $0.32, price: $14.99)
    overageRate: 0.003 // $0.003 per page over limit
  },
  
  business: {
    name: 'Business ($39.99/month)',
    maxPages: 20, // Per chunk limit (consistent across tiers)
    batchSize: 5,
    maxFileSize: 500,
    priority: 'high',
    monthlyPageLimit: 15000, // 15k pages per month (increased from 10k)
    subscriptionPrice: 39.99,
    costPerPage: 0.000161,
    profitMargin: 94, // ~94% profit margin (cost: $2.42, price: $39.99)
    overageRate: 0.002 // $0.002 per page over limit
  }
}

// Helper function to calculate tier economics
export function calculateTierEconomics(tierKey: string) {
  const tier = TIER_CONFIGS[tierKey]
  const monthlyCost = tier.monthlyPageLimit * tier.costPerPage
  const monthlyRevenue = tier.subscriptionPrice
  const monthlyProfit = monthlyRevenue - monthlyCost
  const actualMargin = ((monthlyProfit / monthlyRevenue) * 100)
  
  return {
    tierName: tier.name,
    monthlyPageLimit: tier.monthlyPageLimit,
    subscriptionPrice: tier.subscriptionPrice,
    monthlyCost: monthlyCost,
    monthlyProfit: monthlyProfit,
    actualMargin: actualMargin,
    breakEvenPages: Math.ceil(tier.subscriptionPrice / tier.costPerPage)
  }
}

// Usage monitoring for subscription management
export interface UsageTracking {
  userId: string
  tierKey: string
  currentPeriodStart: Date
  currentPeriodEnd: Date
  pagesUsed: number
  documentsProcessed: number
  overagePages: number
  overageCharges: number
} 