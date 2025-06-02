import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/lib/auth'
import { db } from '@/app/lib/db'
import { stripe } from '@/app/lib/stripe'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  // Get user from DB
  const user = await db.user.findUnique({ where: { email: session.user.email } })
  if (!user || !user.stripeSubscriptionId) {
    return NextResponse.json({ error: 'No active subscription found.' }, { status: 400 })
  }

  if (!stripe) {
    return NextResponse.json({ error: 'Stripe not initialized' }, { status: 500 })
  }

  try {
    // Set cancel_at_period_end to true
    await stripe.subscriptions.update(user.stripeSubscriptionId, {
      cancel_at_period_end: true,
    })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Stripe cancel error:', error)
    return NextResponse.json({ error: 'Failed to cancel subscription.' }, { status: 500 })
  }
} 