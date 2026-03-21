# Sprint Tracker — Event Radar Improvement Plan

## 执行状态

### Phase 1 (S0-S5) — 2026-03-21 上午完成

| Sprint | 状态 | PR(s) | 备注 |
|--------|------|-------|------|
| S0: Bug 修复 | ✅ 完成 | #181 | 底部导航、tabs、scorecard mobile、hide light mode |
| S1: 股价集成 | ✅ 完成 | #182 | Feed API join outcomes + cards + detail + outcome badges |
| S2: 命中率 Reframe | ✅ 完成 | #183 | Scorecard hero 重构 + Advanced Analytics 折叠 + Similar Events |
| S3: 留存机制 | ✅ 完成 | #184 | VAPID push + permission denied UX + daily briefing + outcome stats |
| S4: UX 打磨 | ✅ 完成 | #185 | Thesis preview + blue accent + loading states + WS status + filters |
| S5: Smart Feed | ✅ 完成 | #186 | Smart Feed mode + global event search + empty state |

### Phase 2 (S6-S10) — 2026-03-21 下午完成

| Sprint | 状态 | PR(s) | 备注 |
|--------|------|-------|------|
| S6: Feed 价格修复 | ✅ 完成 | #188 | Root cause: LLM enrichment ticker 没被 outcome tracker 提取 |
| S7: Outcome 展示 | ✅ 完成 | #189 | Backfill 7,363 events + outcome badge fix |
| S8: 通知渠道 | ✅ 完成 | #190 | Discord webhook 通知 + Settings UI |
| S9+10: 最终打磨 | ✅ 完成 | #191, #192 | Test fix + event search + onboarding preview |

### 附加修复

| PR | 内容 |
|----|------|
| #174-#176 | Redis Streams EventBus (3 PRs) |
| #177 | Redis Dedup Window |
| #178 | Vitest coverage reporting |
| #179-#180 | QA review fixes (2 rounds) |
| #187 | Event search tab + Feed overflow |

## QA Scores

| 时间 | 分数 | 状态 |
|------|------|------|
| 改进前 (v1) | 72/100 | NOT READY |
| S0 Bug 修后 | 88/100 | CONDITIONAL |
| Phase 1 完成后 | 93.3/100 | SHIP READY |
| Phase 2 完成后 | 96.7/100 | SHIP READY ✅ |

## 全部完成 ✅

19 个 PR merged，QA 72 → 96.7，1516/1516 tests passing。
