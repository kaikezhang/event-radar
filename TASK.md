# Current Task: Alert Embed Quality Improvements

## Context
The Discord alert embed has several UX/formatting issues. Fix all of them in this PR.

## Changes Required

### 1. Hide Historical section when data has no real values (P0)
**File:** `packages/delivery/src/discord-webhook.ts`

When historical context exists but ALL numeric values are meaningless (all alphas are 0, all change values null), the section displays garbage like "0% win rate, +0.0% alpha". Fix:

```typescript
// Before rendering historical section, check if data is meaningful:
function hasRealHistoricalData(ctx: HistoricalContext): boolean {
  const hasNonZeroAlpha = ctx.topMatches.some(m => m.alphaT20 !== 0);
  const hasChanges = ctx.similarEvents?.some(e => 
    e.change1d != null || e.change1w != null || e.change1m != null
  ) ?? false;
  return hasNonZeroAlpha || hasChanges || ctx.avgAlphaT5 !== 0 || ctx.avgAlphaT20 !== 0;
}
// Only show Historical Pattern section if hasRealHistoricalData() returns true
```

### 2. Add Action field to embed (P1)
**File:** `packages/delivery/src/discord-webhook.ts`

The `enrichment.action` field exists (`🔴 立即关注` / `🟡 持续观察` / `🟢 仅供参考`) but is NOT rendered. Add it right after Tickers, before AI Analysis:

```typescript
if (enrichment?.action) {
  fields.push({ name: 'Action', value: enrichment.action, inline: true });
}
```

### 3. Replace markdown table with code block in Historical section (P1)
**File:** `packages/delivery/src/discord-webhook.ts`

Discord doesn't render markdown tables well. Replace with aligned code block:

```typescript
historyText += '```\n';
historyText += `Avg Alpha T+5  │ ${sign5}${(ctx.avgAlphaT5 * 100).toFixed(1)}%\n`;
historyText += `Avg Alpha T+20 │ ${sign20}${(ctx.avgAlphaT20 * 100).toFixed(1)}%\n`;
historyText += `Win Rate T+20  │ ${ctx.winRateT20.toFixed(0)}%\n`;
historyText += '```\n';
```

### 4. Fix embed title structure (P1)
**File:** `packages/delivery/src/discord-webhook.ts`

Current title crams too much info. Simplify:

```typescript
const title = `${SEVERITY_EMOJI[alert.severity]} ${alert.event.title}`;
```

Keep description as the AI analysis (summary + impact).

### 5. Move regimeContext out of AI Analysis (P1)
**File:** `packages/delivery/src/discord-webhook.ts`

Move `enrichment.regimeContext` from AI Analysis to Market Regime section:

```typescript
// In AI Analysis, REMOVE regimeContext append
// In Market Regime, ADD:
if (enrichment?.regimeContext) {
  regimeText += `\n\n*${enrichment.regimeContext}*`;
}
```

### 6. Hide amplification when both are 1x (P2)
**File:** `packages/delivery/src/discord-webhook.ts`

```typescript
if (rs.amplification.bullish !== 1 || rs.amplification.bearish !== 1) {
  regimeText += `\nBullish amp: ${rs.amplification.bullish}x | Bearish amp: ${rs.amplification.bearish}x`;
}
```

### 7. Move Source link before Historical section (P2)
**File:** `packages/delivery/src/discord-webhook.ts`

Move `🔗 Source` field right after AI Analysis, before Historical Pattern.

### 8. Show event price next to ticker (P2)
**File:** `packages/delivery/src/discord-webhook.ts`

If event_price available in metadata, show it:
```typescript
const eventPrice = alert.event.metadata?.event_price;
const priceStr = typeof eventPrice === 'number' ? ` @ $${eventPrice.toFixed(2)}` : '';
// Append priceStr to ticker display
```

## Testing
- Update `packages/delivery/src/__tests__/discord-webhook.test.ts` for all changes
- All existing tests must pass
- Run `pnpm build && pnpm test`

## Constraints
- TypeScript strict mode, ESM with `.js` extensions
- Branch: `fix/alert-embed-quality`
- Create PR, do NOT merge
