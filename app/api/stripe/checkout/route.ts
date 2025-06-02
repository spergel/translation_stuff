import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/lib/auth'
import { stripe, SUBSCRIPTION_PLANS, SubscriptionPlan } from '@/app/lib/stripe'
import { db } from '@/app/lib/db'

export async function POST(request: NextRequest) {
  try {
    if (!stripe) {
      console.error('Stripe not initialized')
      return NextResponse.json({ error: 'Stripe is not properly initialized. Check your environment variables.' }, { status: 500 })
    }

    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      console.error('No authenticated user')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { plan, returnUrl } = body

    console.log('Received checkout request:', { plan, returnUrl })

    if (!plan || !SUBSCRIPTION_PLANS[plan as SubscriptionPlan]) {
      console.error('Invalid plan:', plan)
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
    }

    const selectedPlan = SUBSCRIPTION_PLANS[plan as SubscriptionPlan]
    
    if (!selectedPlan.priceId) {
      console.error('Missing price ID for plan:', plan)
      return NextResponse.json({ error: 'Plan does not have a price ID' }, { status: 400 })
    }

    // Get or create Stripe customer
    const user = await db.user.findUnique({
      where: { email: session.user.email }
    })

    if (!user) {
      console.error('User not found:', session.user.email)
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    let customerId = user.stripeCustomerId

    if (!customerId) {
      console.log('Creating new Stripe customer for user:', user.id)
      // Create Stripe customer
      const customer = await stripe.customers.create({
        email: session.user.email,
        name: session.user.name || undefined,
        metadata: {
          userId: user.id,
        },
      })

      customerId = customer.id

      // Update user with Stripe customer ID
      await db.user.update({
        where: { id: user.id },
        data: { stripeCustomerId: customerId }
      })
    }

    console.log('Creating checkout session for customer:', customerId)

    // Create checkout session
    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      billing_address_collection: 'required',
      line_items: [
        {
          price: selectedPlan.priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: new URL('/dashboard?success=true&session_id={CHECKOUT_SESSION_ID}', process.env.NEXTAUTH_URL || 'http://localhost:3000').toString(),
      cancel_url: new URL(returnUrl || '/pricing', process.env.NEXTAUTH_URL || 'http://localhost:3000').toString() + '?canceled=true',
      metadata: {
        userId: user.id,
        plan: plan,
      },
      subscription_data: {
        metadata: {
          userId: user.id,
          plan: plan,
        },
      },
    })

    console.log('Checkout session created:', checkoutSession.id)

    return NextResponse.json({ 
      checkoutUrl: checkoutSession.url,
      sessionId: checkoutSession.id 
    })

  } catch (error) {
    console.error('Checkout error:', error instanceof Error ? error.message : error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create checkout session' }, 
      { status: 500 }
    )
  }
} 