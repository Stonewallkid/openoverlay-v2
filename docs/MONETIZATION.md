# OpenOverlay Monetization

## Tier Comparison

| Feature | Free | Pro ($5/mo) | Creator ($15/mo) |
|---------|------|-------------|------------------|
| Draw on pages | Yes | Yes | Yes |
| Create annotations | Yes | Yes | Yes |
| Play races | Yes | Yes | Yes |
| Submit race times | Yes | Yes | Yes |
| Follow users | 50 max | Unlimited | Unlimited |
| Content visibility | Public only | Public/Followers/Private | Public/Followers/Private |
| Brush styles | Basic (3) | All (7+) | All + Custom |
| Custom colors | Limited palette | Full color picker | Full + saved palettes |
| Export drawings | No | PNG/SVG | PNG/SVG/JSON |
| Custom sprites | No | No | Yes (upload) |
| Course editor | Basic | Basic | Advanced tools |
| Analytics | No | Basic views | Full dashboard |
| API access | No | No | Yes |
| Verified badge | No | No | Yes |
| Priority support | No | Yes | Yes |
| Ads | Yes (minimal) | No | No |

## Implementation

### Stripe Integration

```typescript
// Pricing IDs (create in Stripe dashboard)
const PRICES = {
  pro_monthly: 'price_xxx',
  pro_yearly: 'price_xxx',    // 2 months free
  creator_monthly: 'price_xxx',
  creator_yearly: 'price_xxx' // 2 months free
};

// Checkout flow
async function createCheckout(userId: string, priceId: string) {
  const session = await stripe.checkout.sessions.create({
    customer_email: user.email,
    line_items: [{ price: priceId, quantity: 1 }],
    mode: 'subscription',
    success_url: `${BASE_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${BASE_URL}/billing/cancel`,
    metadata: { userId }
  });
  return session.url;
}
```

### Feature Gating

```typescript
// Middleware to check tier
function requireTier(minTier: 'free' | 'pro' | 'creator') {
  return (req: Request, res: Response, next: NextFunction) => {
    const tierLevel = { free: 0, pro: 1, creator: 2 };
    if (tierLevel[req.user.tier] < tierLevel[minTier]) {
      return res.status(403).json({
        error: 'upgrade_required',
        requiredTier: minTier,
        upgradeUrl: '/billing/checkout'
      });
    }
    next();
  };
}

// Usage
app.post('/drawings', requireTier('free'), createDrawing);
app.post('/drawings/private', requireTier('pro'), createPrivateDrawing);
app.post('/sprites/custom', requireTier('creator'), uploadCustomSprite);
```

### Client-Side Tier Awareness

```typescript
// In extension state
interface User {
  id: string;
  tier: 'free' | 'pro' | 'creator';
  tierExpiresAt: string | null;
}

// Feature checks
const features = {
  canUsePrivateContent: (user: User) => user.tier !== 'free',
  canUseAllBrushes: (user: User) => user.tier !== 'free',
  canUploadSprites: (user: User) => user.tier === 'creator',
  maxFollows: (user: User) => user.tier === 'free' ? 50 : Infinity,
};

// UI shows upgrade prompts
function BrushSelector() {
  const user = store.getState().user;
  const brushes = BRUSHES.map(brush => ({
    ...brush,
    locked: brush.proOnly && !features.canUseAllBrushes(user)
  }));

  return brushes.map(b =>
    b.locked
      ? <LockedBrush onClick={showUpgradeModal} />
      : <BrushButton brush={b} />
  );
}
```

## Revenue Projections

### Assumptions
- 10,000 MAU after 6 months
- 3% convert to Pro
- 0.5% convert to Creator
- 20% annual vs 80% monthly

### Monthly Revenue
```
Pro monthly:     10,000 * 0.03 * 0.8 * $5 = $1,200
Pro annual:      10,000 * 0.03 * 0.2 * $50/12 = $250
Creator monthly: 10,000 * 0.005 * 0.8 * $15 = $600
Creator annual:  10,000 * 0.005 * 0.2 * $150/12 = $125
───────────────────────────────────────────────────
Total MRR: ~$2,175
```

## Alternative Revenue Streams

### 1. Tips/Donations
Allow users to tip creators for drawings they like. Take 10% platform fee.

### 2. Marketplace (Future)
- Sell custom brush packs
- Sell sprite packs
- Commission system for custom drawings

### 3. Enterprise/API
- White-label for companies
- API access for integrations
- Volume licensing

## Stripe Webhook Events

Handle these events:

```typescript
switch (event.type) {
  case 'checkout.session.completed':
    // Upgrade user tier
    break;

  case 'customer.subscription.updated':
    // Handle plan changes
    break;

  case 'customer.subscription.deleted':
    // Downgrade to free
    break;

  case 'invoice.payment_failed':
    // Send warning, grace period
    break;
}
```
