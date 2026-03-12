# Event Radar — Observability Design

## Problem

当前系统的可观测性有明显短板：
- Pipeline 内部完全静默 — 事件经过 classify → dedup → filter → enrich → deliver 各环节没有任何日志
- 不知道哪些事件被 filter 拦住了、为什么拦住
- 不知道 historical enrichment 是否命中、耗时多少
- delivery 成功/失败没有结构化日志
- 没有 dashboard，只能手动 curl `/metrics` 和 `/health`
- 排查问题只能 `docker logs` 翻文本日志

## Design: 三层可观测性

### Layer 1: Structured Pipeline Logging

在 event pipeline 的每个决策点加结构化日志（JSON），用 Fastify 自带的 pino logger。

```
[pipeline] {event_id, source, title_preview, stage, decision, reason, duration_ms}
```

关键决策点：
| Stage | Log When | Fields |
|-------|----------|--------|
| classify | always | severity, matched_rule |
| dedup | duplicate found | match_type, story_id |
| filter | always (pass or block) | pass, reason, source_tier (primary/secondary) |
| historical | query complete | confidence, match_count, duration_ms |
| historical | timeout | duration_ms |
| delivery | always | channels[], success_count, fail_count, duration_ms |
| grace-period | suppressed | uptime_ms |

Filter blocks 用 `level: debug`，其余用 `level: info`。生产环境设 `LOG_LEVEL=info` 则看不到 filter blocks 的细节，debug 模式全开。

### Layer 2: New Metrics

补充 Prometheus 指标：

```typescript
// Alert filter metrics
alert_filter_total{decision="pass|block", source, reason_category}
alert_filter_blocked_total{reason="stale|retrospective|no_keyword|social_noise|cooldown|..."}

// Historical enrichment
historical_enrichment_total{result="hit|miss|timeout|error"}
historical_enrichment_duration_seconds{} // histogram

// Pipeline throughput (funnel)
pipeline_funnel_total{stage="ingested|classified|deduped|stored|filtered|enriched|delivered"}

// Delivery details
delivery_errors_total{channel, error_type}

// Startup
startup_grace_period_suppressed_total{}

// Scanner seen buffer
scanner_seen_buffer_size{scanner}
```

### Layer 3: `/api/v1/dashboard` — One-stop Status API

一个 API 返回管理员需要的一切：

```json
GET /api/v1/dashboard

{
  "system": {
    "status": "healthy",
    "version": "0.0.1",
    "uptime_seconds": 3600,
    "started_at": "2026-03-12T15:26:31Z",
    "grace_period_active": false,
    "db": "connected",
    "memory_mb": 136
  },
  "scanners": {
    "total": 13,
    "healthy": 10,
    "degraded": 2,
    "down": 1,
    "details": [
      {"name": "breaking-news", "status": "healthy", "last_scan": "2s ago", "events_today": 42, "errors_today": 0},
      {"name": "reddit", "status": "degraded", "last_scan": "3m ago", "events_today": 0, "errors_today": 15, "in_backoff": true},
      ...
    ]
  },
  "pipeline": {
    "today": {
      "ingested": 1250,
      "deduplicated": 980,
      "stored": 270,
      "filtered_out": 195,
      "delivered": 75,
      "delivery_errors": 2
    },
    "filter_breakdown": {
      "stale": 45,
      "retrospective": 30,
      "no_keyword": 80,
      "social_noise": 25,
      "cooldown": 10,
      "passed": 75
    },
    "last_delivery": {
      "event_title": "Oil prices surge...",
      "channel": "discord",
      "at": "2026-03-12T16:05:00Z",
      "historical_match": true
    }
  },
  "historical": {
    "total_events": 2423,
    "enrichment_hit_rate": "32%",
    "avg_duration_ms": 45,
    "timeouts_today": 0,
    "market_context": {
      "vix": 22.5,
      "spy": 502.1,
      "regime": "sideways",
      "updated_at": "5m ago"
    }
  },
  "delivery": {
    "channels": {
      "discord": {"status": "active", "sent_today": 75, "errors_today": 0, "last_sent": "2m ago"},
      "bark": {"status": "active", "sent_today": 12, "errors_today": 2, "last_sent": "15m ago"},
      "telegram": {"status": "not_configured"}
    }
  },
  "alerts": [
    {"level": "warn", "message": "reddit scanner in backoff (403)", "since": "2h ago"},
    {"level": "warn", "message": "fedwatch API returning 404", "since": "30m ago"}
  ]
}
```

## Implementation Plan

### PR 1: Pipeline Logging + Filter Metrics (最关键)

**Files:**
- `packages/backend/src/app.ts` — 在 pipeline 各阶段加 structured log
- `packages/backend/src/metrics.ts` — 新增 filter/enrichment/funnel metrics
- `packages/backend/src/pipeline/alert-filter.ts` — check() 返回 reason_category

### PR 2: Dashboard API

**Files:**
- `packages/backend/src/routes/dashboard.ts` — 聚合所有状态数据的单一端点
- 从 metrics registry + DB + scanner registry + market cache 拉数据
- 无需额外存储

### PR 3 (Optional): Log Drain / Alerting

- Docker log driver → 文件 rotation（防止日志吃满磁盘）
- Scanner down > 30min → 自动 Bark push 通知管理员
- Delivery 连续失败 > 5 次 → 通知

## Quick Wins (可以直接做)

1. Pipeline structured logging — 最大收益，立刻能看到事件流经每个阶段
2. Dashboard API — 一个 curl 了解全局
3. Filter metrics — 知道过滤了什么、为什么

## Log Format Example

```json
{"level":"info","source":"breaking-news","title":"Oil surge...","stage":"filter","pass":true,"reason":"keyword: surge","tier":"secondary"}
{"level":"info","source":"breaking-news","title":"Oil surge...","stage":"historical","confidence":"medium","matches":5,"duration_ms":42}
{"level":"info","source":"breaking-news","title":"Oil surge...","stage":"delivery","channels":["discord","bark"],"ok":2,"fail":0,"duration_ms":230}
{"level":"debug","source":"breaking-news","title":"Why TSLA dropped...","stage":"filter","pass":false,"reason":"retrospective article"}
```
