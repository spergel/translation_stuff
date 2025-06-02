# Stripe Integration Setup Guide

## 🎯 What We've Built

✅ **Complete Stripe Integration System:**
- Beautiful pricing page (`/pricing`) with 4 tiers
- Checkout flow with secure payment processing
- Webhook handlers for subscription management
- Database schema for subscription tracking
- Upgrade prompts and limit enforcement

## 🚀 Next Steps to Go Live

### 1. Create Stripe Account & Products
1. **Sign up at [stripe.com](https://stripe.com)** (if you don't have an account)
2. **Go to Stripe Dashboard → Products**
3. **Create these 3 products:**

#### Basic Plan ($9.99/month)
```
Name: PDF Translator Basic
Description: 50 documents, 5GB storage, 1-year retention
Price: $9.99 USD monthly recurring
```

#### Pro Plan ($29.99/month)  
```
Name: PDF Translator Pro
Description: 500 documents, 25GB storage, unlimited retention
Price: $29.99 USD monthly recurring
```

#### Enterprise Plan ($99.99/month)
```
Name: PDF Translator Enterprise  
Description: Unlimited documents, 50GB storage, premium support
Price: $99.99 USD monthly recurring
```

### 2. Get API Keys & Price IDs
After creating products, you'll get:

**From Stripe Dashboard → Developers → API Keys:**
```bash
STRIPE_SECRET_KEY=sk_test_... (for testing) or sk_live_... (for production)
STRIPE_PUBLISHABLE_KEY=pk_test_... (for testing) or pk_live_... (for production)
```

**From each product page, copy the Price ID:**
```bash
STRIPE_BASIC_PRICE_ID=price_... 
STRIPE_PRO_PRICE_ID=price_...
STRIPE_ENTERPRISE_PRICE_ID=price_...
```

### 3. Set Up Webhooks
1. **Go to Stripe Dashboard → Developers → Webhooks**
2. **Add endpoint:** `https://yourdomain.com/api/stripe/webhooks`
3. **Select these events:**
   - `checkout.session.completed`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. **Copy the webhook signing secret:**
```bash
STRIPE_WEBHOOK_SECRET=whsec_...
```

### 4. Update Environment Variables
Add to your `.env.local`:

```bash
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_your_secret_key_here
STRIPE_PUBLISHABLE_KEY=pk_test_your_publishable_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here

# Product Price IDs (get these after creating products)
STRIPE_BASIC_PRICE_ID=price_basic_plan_id_here
STRIPE_PRO_PRICE_ID=price_pro_plan_id_here  
STRIPE_ENTERPRISE_PRICE_ID=price_enterprise_plan_id_here
```

### 5. Test the Flow
1. **Visit** `http://localhost:3002/pricing`
2. **Click "Upgrade to Basic"** (sign in first)
3. **Use Stripe test card:** `4242 4242 4242 4242`
4. **Complete checkout**
5. **Check your database** - user tier should update to "basic"

## 📋 Test Cards for Development

```
Success: 4242 4242 4242 4242
Decline: 4000 0000 0000 0002
Require 3D Secure: 4000 0025 0000 3155
```

Use any future date for expiry, any 3 digits for CVC, any ZIP code.

## 🔄 Webhook Testing
For local development, use [Stripe CLI](https://stripe.com/docs/stripe-cli):

```bash
# Install Stripe CLI
# Then forward webhooks to your local server
stripe listen --forward-to localhost:3002/api/stripe/webhooks
```

This will give you a webhook secret starting with `whsec_` for local testing.

## 🚀 Production Checklist

- [ ] Replace test API keys with live keys
- [ ] Update webhook endpoint to production URL
- [ ] Test complete user flow (signup → upgrade → payment)
- [ ] Verify webhooks are processing correctly
- [ ] Set up Stripe Dashboard monitoring

## 💡 Current Features Working

✅ **Pricing Page** - Beautiful tier comparison with upgrade buttons
✅ **Checkout Flow** - Secure Stripe checkout with user authentication  
✅ **Webhooks** - Automatic tier updates on payment success/failure
✅ **Usage Limits** - Enforced based on user's current tier
✅ **Upgrade Prompts** - Smart suggestions when users hit limits
✅ **Dashboard Integration** - Shows current tier and usage

## 🛠️ Files Created

```
app/
├── lib/stripe.ts              # Stripe config & pricing
├── api/stripe/
│   ├── checkout/route.ts      # Create checkout sessions  
│   └── webhooks/route.ts      # Handle subscription events
├── pricing/page.tsx           # Beautiful pricing page
├── components/
│   └── UpgradePrompt.tsx      # Smart upgrade suggestions
└── prisma/schema.prisma       # Updated with Stripe fields
```

Once you set up the environment variables and create the Stripe products, the entire subscription system will be live! 🎉 