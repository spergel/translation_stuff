import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/app/lib/stripe'
import { db } from '@/app/lib/db'
import Stripe from 'stripe'

const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET!

export async function POST(request: NextRequest) {
  if (!stripe) {
    console.error('Stripe not initialized')
    return NextResponse.json({ error: 'Stripe is not properly initialized' }, { status: 500 })
  }

  const body = await request.text()
  const signature = request.headers.get('stripe-signature')!

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(body, signature, endpointSecret)
  } catch (err) {
    console.error('Webhook signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  console.log('Received webhook event:', event.type)

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        
        if (session.mode === 'subscription') {
          const subscriptionId = session.subscription as string
          const userId = session.metadata?.userId
          const plan = session.metadata?.plan as string

          if (userId && plan && subscriptionId) {
            // Get the subscription details
            const subscription = await stripe.subscriptions.retrieve(subscriptionId)
            
            // Update user with subscription info
            await db.user.update({
              where: { id: userId },
              data: {
                tier: plan,
                stripeSubscriptionId: subscriptionId,
                stripeSubscriptionStatus: subscription.status,
                subscriptionPeriodEnd: new Date((subscription as any).current_period_end * 1000),
              }
            })

            console.log(`Updated user ${userId} to ${plan} tier`)
          }
        }
        break
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice
        const subscriptionId = (invoice as any).subscription as string

        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId)
          const customerId = subscription.customer as string

          if (customerId) {
            // Find user by Stripe customer ID
            const user = await db.user.findFirst({
              where: { stripeCustomerId: customerId }
            })

            if (user) {
              // Update subscription status and period
              await db.user.update({
                where: { id: user.id },
                data: {
                  stripeSubscriptionStatus: subscription.status,
                  subscriptionPeriodEnd: new Date((subscription as any).current_period_end * 1000),
                }
              })

              console.log(`Payment succeeded for user ${user.id}`)
            }
          }
        }
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        const subscriptionId = (invoice as any).subscription as string

        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId)
          const customerId = subscription.customer as string

          if (customerId) {
            // Find user by Stripe customer ID
            const user = await db.user.findFirst({
              where: { stripeCustomerId: customerId }
            })

            if (user) {
              // Update subscription status
              await db.user.update({
                where: { id: user.id },
                data: {
                  stripeSubscriptionStatus: subscription.status,
                }
              })

              console.log(`Payment failed for user ${user.id}`)
            }
          }
        }
        break
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        const customerId = subscription.customer as string

        if (customerId) {
          // Find user by Stripe customer ID
          const user = await db.user.findFirst({
            where: { stripeCustomerId: customerId }
          })

          if (user) {
            // Determine new tier based on subscription
            let newTier = 'free'
            if (subscription.status === 'active' && subscription.items.data.length > 0) {
              const priceId = subscription.items.data[0].price.id
              
              // Map price ID to tier
              if (priceId === process.env.STRIPE_BASIC_PRICE_ID) newTier = 'basic'
              else if (priceId === process.env.STRIPE_PRO_PRICE_ID) newTier = 'pro'
              else if (priceId === process.env.STRIPE_ENTERPRISE_PRICE_ID) newTier = 'enterprise'
            }

            await db.user.update({
              where: { id: user.id },
              data: {
                tier: newTier,
                stripeSubscriptionStatus: subscription.status,
                subscriptionPeriodEnd: new Date((subscription as any).current_period_end * 1000),
              }
            })

            console.log(`Updated user ${user.id} subscription to ${newTier}`)
          }
        }
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const customerId = subscription.customer as string

        if (customerId) {
          // Find user by Stripe customer ID
          const user = await db.user.findFirst({
            where: { stripeCustomerId: customerId }
          })

          if (user) {
            // Downgrade to free tier
            await db.user.update({
              where: { id: user.id },
              data: {
                tier: 'free',
                stripeSubscriptionStatus: 'canceled',
                stripeSubscriptionId: null,
                subscriptionPeriodEnd: null,
              }
            })

            console.log(`Downgraded user ${user.id} to free tier`)
          }
        }
        break
      }

      default:
        console.log(`Unhandled event type: ${event.type}`)
    }

    return NextResponse.json({ received: true })

  } catch (error) {
    console.error('Webhook processing error:', error)
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    )
  }
}

// Disable body parsing for webhooks
export const dynamic = 'force-dynamic' 