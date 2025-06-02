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
    maxPages: 50, // Increased from 20 (per chunk limit)
    batchSize: 5, // Increased from 2 for better performance
    maxFileSize: 25,
    priority: 'low',
    monthlyPageLimit: 100, // 100 pages per month
    subscriptionPrice: 0,
    costPerPage: 0.0000805, // Updated for Flash 8B (half the cost)
    profitMargin: 0, // Free tier - no profit
    overageRate: 0.01 // $0.01 per page over limit
  },
  
  basic: {
    name: 'Basic ($4.99/month)',
    maxPages: 100, // Increased from 20 (per chunk limit)
    batchSize: 20, // Increased from 4 for much better async performance
    maxFileSize: 25,
    priority: 'normal',
    monthlyPageLimit: 500, // 500 pages per month
    subscriptionPrice: 4.99,
    costPerPage: 0.0000805, // Updated for Flash 8B
    profitMargin: 99, // Even higher profit margin with cheaper costs
    overageRate: 0.005 // $0.005 per page over limit
  },
  
  pro: {
    name: 'Pro ($14.99/month)',
    maxPages: 200, // Increased from 20 (per chunk limit)
    batchSize: 50, // Increased from 6 for much better async performance
    maxFileSize: 100,
    priority: 'normal',
    monthlyPageLimit: 2000, // 2000 pages per month  
    subscriptionPrice: 14.99,
    costPerPage: 0.0000805, // Updated for Flash 8B
    profitMargin: 99, // Even higher profit margin
    overageRate: 0.003 // $0.003 per page over limit
  },
  
  business: {
    name: 'Business ($39.99/month)',
    maxPages: -1, // Unlimited pages
    batchSize: 75, // Increased from 10 for maximum async performance
    maxFileSize: 500,
    priority: 'high',
    monthlyPageLimit: 15000, // 15k pages per month (increased from 10k)
    subscriptionPrice: 39.99,
    costPerPage: 0.0000805, // Updated for Flash 8B
    profitMargin: 97, // Higher profit margin with cheaper costs
    overageRate: 0.002 // $0.002 per page over limit
  },
  
  enterprise: {
    name: 'Enterprise ($99.99/month)',
    maxPages: -1, // Unlimited pages
    batchSize: 100, // Increased to 100 pages per batch as requested!
    maxFileSize: 2000, // 2GB max file size
    priority: 'high',
    monthlyPageLimit: 50000, // 50k pages per month
    subscriptionPrice: 99.99,
    costPerPage: 0.0000805, // Updated for Flash 8B
    profitMargin: 99, // Excellent margins with cheaper model
    overageRate: 0.001 // $0.001 per page over limit
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