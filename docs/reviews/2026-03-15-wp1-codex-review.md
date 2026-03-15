# WP1 Review — PR #111

## 🔍 Round 1 Review (Codex)

1. **Critical — legacy DB labels are silently downgraded to `🟢 Background` on read.**  
   [`packages/shared/src/schemas/llm-types.ts`](/home/kaike/.openclaw/workspace/event-radar/packages/shared/src/schemas/llm-types.ts#L63) now treats any non-enum `action` as `DEFAULT_ENRICHMENT_ACTION`, and [`packages/backend/src/services/scorecard-semantics.ts`](/home/kaike/.openclaw/workspace/event-radar/packages/backend/src/services/scorecard-semantics.ts#L36) uses that schema when reading stored `llm_enrichment`. After this deploy, existing rows containing `🔴 ACT NOW` / `🟡 WATCH` / `🟢 FYI` will no longer parse as their original level; they will all be rewritten in memory to `🟢 Background`. That breaks the plan’s backward-compat requirement that existing alerts “keep old labels” and that the UI render what is stored. It also corrupts scorecard/history semantics for pre-migration data.

2. **High — scorecard aggregation still buckets on the raw stored string, so mixed old/new data will split into duplicate buckets.**  
   [`packages/backend/src/services/scorecard-aggregation.ts`](/home/kaike/.openclaw/workspace/event-radar/packages/backend/src/services/scorecard-aggregation.ts#L117) groups on `row.actionLabel`, and [`packages/backend/src/services/scorecard-aggregation.ts`](/home/kaike/.openclaw/workspace/event-radar/packages/backend/src/services/scorecard-aggregation.ts#L187) passes through `enrichment?.action` unchanged. With real historical data, `🔴 ACT NOW` and `🔴 High-Quality Setup` become separate buckets instead of one red-tier bucket. [`packages/web/src/lib/api.ts`](/home/kaike/.openclaw/workspace/event-radar/packages/web/src/lib/api.ts#L247) then strips only the emoji, so the UI will still show `ACT NOW` for legacy rows rather than the canonical WP1 label. The plan explicitly called for “bucket by emoji prefix, display new label”; this PR doesn’t implement that.

3. **Medium — the planned transition contract (`signal` alias + frontend fallback) is not implemented.**  
   WP1 says “API returns both `action` and `signal` during transition” and “Frontend reads `signal`, falls back to `action`.” The delivery feed route still returns only `action` in [`packages/backend/src/routes/delivery-feed.ts`](/home/kaike/.openclaw/workspace/event-radar/packages/backend/src/routes/delivery-feed.ts#L280), the dashboard route still models only `action` in [`packages/backend/src/routes/dashboard.ts`](/home/kaike/.openclaw/workspace/event-radar/packages/backend/src/routes/dashboard.ts#L161), and the web types still expose only `actionLabel` in [`packages/web/src/types/index.ts`](/home/kaike/.openclaw/workspace/event-radar/packages/web/src/types/index.ts#L65). That means the rename is only cosmetic today and will still require a future contract-breaking sweep.

4. **Medium — label references are still inconsistent inside the scorecard surface, and tests do not cover the transition cases.**  
   [`packages/backend/src/services/alert-scorecard.ts`](/home/kaike/.openclaw/workspace/event-radar/packages/backend/src/services/alert-scorecard.ts#L244) still emits `Original action label: ...` in `notes.items`, so the Event Detail page will show “signal” in one block and “action” again in verification notes. On coverage: the updated schema test only proves the new labels parse, not that legacy labels remain readable/normalized, and the push-policy tests only swap fixtures to the new strings. There is still no test for old labels continuing to route via emoji-prefix matching, and no mixed old/new scorecard-bucket test to catch the split described above.

## Checked Separately

- `push-policy` does use emoji-prefix matching now, which satisfies the critical Eng review item.
- The DB field itself still remains `action`; there is no schema migration in this PR.
- `discord-webhook.ts`, `Scorecard.tsx`, `EventDetail.tsx`, and `README.md` were updated in the expected direction.
