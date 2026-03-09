# Delivery Channels

Event Radar supports multiple alert delivery channels. The key requirement: **CRITICAL events must reach your phone in seconds, even if it's on silent.**

## Channel Comparison

| Channel | Platform | Latency | Critical Alert | Self-Hosted | Cost | Best For |
|---------|----------|---------|---------------|-------------|------|----------|
| **Bark** ⭐ | iOS only | <1s | ✅ YES | ✅ | Free | Primary iOS push |
| **ntfy** | iOS + Android + Desktop | <2s | ❌ No | ✅ | Free | Cross-platform |
| **Pushover** | iOS + Android | <1s | ✅ YES | ❌ (SaaS) | $5 one-time | Reliable fallback |
| **Telegram** | All platforms | <1s | ❌ No | ✅ Bot API | Free | Rich formatting, largest trading communities |
| **Discord** | All platforms | 1-3s | ❌ No | N/A | Free | Rich embeds, history |
| **WebSocket** | Browser | <0.5s | ❌ No | ✅ | Free | Dashboard live feed |
| **Email** | All | Minutes | ❌ No | ✅ | Free | Daily digest |

## Recommended Setup

```
CRITICAL events  → Bark (iOS critical alert, bypasses silent mode)
                 + Telegram (instant delivery, large trading community)
                 + Discord (rich embed for review)
                 + WebSocket (dashboard live feed)

HIGH events      → Bark (normal push)
                 + Telegram + Discord
                 + WebSocket

MEDIUM events    → Telegram + Discord + WebSocket

LOW events       → WebSocket only (dashboard)

Daily digest     → Email summary at market close
```

---

## ⭐ Bark (Primary — iOS)

**The #1 pick for iOS push notifications.**

- **Repo**: [github.com/Finb/Bark](https://github.com/Finb/Bark) (7,700 ⭐)
- **Server**: [github.com/Finb/bark-server](https://github.com/Finb/bark-server) (3,400 ⭐)
- **Why Bark over everything else**:
  - **Critical Alerts** on iOS — the killer feature. Bypasses silent mode, Do Not Disturb, and Focus modes. Your phone WILL ring for a CRITICAL event, even at 3 AM. No other self-hosted solution does this reliably on iOS.
  - Dead simple API: `GET /push?title=SEC 8-K&body=XYZ restructuring`
  - Self-hosted (Docker one-liner: `docker run -p 8080:8080 finab/bark-server`)
  - Encrypted push notifications
  - Custom sounds
  - Grouping by topic (we group by severity tier)
  - iOS app is native, polished, and free

### API Usage

```bash
# Normal notification
curl "https://bark.yourdomain.com/YOUR_KEY/Event Radar/SEC 8-K: XYZ restructuring detected"

# Critical alert (bypasses silent/DND)
curl "https://bark.yourdomain.com/YOUR_KEY/🔴 CRITICAL/Trump: 200% tariffs on China" \
  -d "level=critical&sound=alarm"

# With URL (tap to open SEC filing)
curl "https://bark.yourdomain.com/YOUR_KEY/title/body?url=https://sec.gov/..."

# Grouped by severity
curl "https://bark.yourdomain.com/YOUR_KEY/title/body?group=critical"
```

### Notification Levels

| Level | Behavior | Use For |
|-------|----------|---------|
| `active` | Normal notification | HIGH events |
| `timeSensitive` | Breaks through Focus mode | HIGH events during market hours |
| `critical` | Bypasses DND + silent, plays sound | CRITICAL only (Trump tariffs, flash crash, etc.) |
| `passive` | Silent, shows in notification center | MEDIUM events |

### Setup

```yaml
# docker-compose.yml addition
bark-server:
  image: finab/bark-server
  ports:
    - "127.0.0.1:8080:8080"
  volumes:
    - ./bark-data:/data
  restart: unless-stopped
```

---

## Telegram (Cross-Platform — Priority Above Discord)

- **API**: [t.me/BotAPI](https://core.telegram.org/bots/api)
- **Why**: Largest active trading communities outside of Discord. Free, easy to implement, supports rich formatting with Markdown and inline buttons.
- **Perfect for**: Active trading communities, quick mobile access.

### API Usage

```bash
# Send message
curl -X POST "https://api.telegram.org/bot<TOKEN>/sendMessage" \
  -d "chat_id=<CHAT_ID>" \
  -d "text=🔴 CRITICAL: Trump posted about tariffs" \
  -d "parse_mode=Markdown" \
  -d "reply_markup={\"inline_keyboard\":[[{\"text\":\"View SEC Filing\",\"url\":\"https://sec.gov/...\"}]]}"
```

### When to use Telegram
- Primary channel for active retail trading communities
- Above Discord in priority for communities that live in Telegram
- Below Bark for iOS users who need critical alerts

---

## ntfy (Secondary — Cross-Platform)

- **Repo**: [github.com/binwiederhier/ntfy](https://github.com/binwiederhier/ntfy) (29,000 ⭐)
- **Why**: Best cross-platform option. Works on iOS, Android, and desktop browsers. Can use the public ntfy.sh server (no setup) or self-host.
- **Limitation**: iOS critical alerts are NOT supported (Apple restriction for non-native apps). Notifications may be delayed if app is backgrounded.

### API Usage

```bash
# Simple
curl -d "SEC 8-K: XYZ restructuring" ntfy.sh/event-radar-critical

# With priority + tags
curl -H "Title: 🔴 CRITICAL Event" \
     -H "Priority: urgent" \
     -H "Tags: warning,chart_with_upwards_trend" \
     -d "Trump posted: tariffs on China" \
     ntfy.sh/event-radar-alerts
```

### When to use ntfy over Bark
- Android users
- Desktop browser notifications
- Quick setup without self-hosting (ntfy.sh public server)
- Want topic-based subscription model

---

## Pushover (Reliable Fallback)

- **Website**: [pushover.net](https://pushover.net) — $5 one-time per platform
- **Why**: Most reliable delivery. Supports iOS critical alerts. Zero maintenance.
- **Trade-off**: Not self-hosted, $5 cost, 10K messages/month limit.

Good as a fallback for when Bark server is down.

---

## Discord (Rich History)

Already integrated in Phase 0. Discord excels at:
- Rich embeds with color-coded severity
- Searchable history (find past events)
- Channel-based organization (one channel per severity or per tier)
- Team collaboration (discuss events in threads)

Not good for: instant mobile alerts (notification delay, easy to miss).

---

## WebSocket (Dashboard)

The dashboard's live connection. Sub-second delivery to the browser.
Not a standalone alert channel — requires the dashboard to be open.

---

## Email (Digest)

Daily summary email at market close:
- Top events of the day
- Classification accuracy stats
- Scanner health summary
- Upcoming catalysts (earnings, PDUFA dates)

Low priority — implement in Phase 5.

---

## Delivery Reliability

What happens when a delivery channel fails:

1. **Retry with exponential backoff**: 3 attempts (1s → 5s → 30s)
2. **Fallback chain**: If Bark fails → try Pushover → try ntfy
3. **Dead letter queue**: Failed deliveries are logged and viewable in dashboard
4. **Cross-channel deduplication**: One event = max one notification per channel
5. **Event grouping**: Related events within 30min window → single "developing story" notification with count badge

---

## Alert Routing Logic

```typescript
function routeAlert(event: Event) {
  // Always: WebSocket (dashboard) + Storage
  emit('websocket', event);
  store(event);

  // Discord: everything MEDIUM+
  if (event.severity >= 'MEDIUM') {
    send('discord', event);
  }

  // Bark: HIGH+ with appropriate level
  if (event.severity === 'CRITICAL') {
    send('bark', event, { level: 'critical', sound: 'alarm' });
  } else if (event.severity === 'HIGH') {
    send('bark', event, { level: 'timeSensitive' });
  }

  // ntfy: mirror Bark for cross-platform users
  if (event.severity >= 'HIGH') {
    send('ntfy', event, { priority: event.severity === 'CRITICAL' ? 5 : 4 });
  }
}
```

---

## Configuration

```yaml
# config.yaml
delivery:
  bark:
    enabled: true
    server: "https://bark.yourdomain.com"
    key: "YOUR_DEVICE_KEY"
    minSeverity: "HIGH"         # Only push HIGH+
    criticalSound: "alarm"
    
  ntfy:
    enabled: false              # Enable for Android/desktop
    server: "https://ntfy.sh"   # or self-hosted
    topic: "event-radar"
    minSeverity: "HIGH"
    
  discord:
    enabled: true
    webhookUrl: "https://discord.com/api/webhooks/..."
    minSeverity: "MEDIUM"
    
  pushover:
    enabled: false              # Fallback
    userKey: "..."
    apiToken: "..."
    minSeverity: "CRITICAL"     # Only for critical fallback
    
  email:
    enabled: false
    smtp: { host, port, user, pass }
    to: "you@example.com"
    schedule: "daily-close"     # Daily digest at 4:30 PM ET
```

---

*See [Architecture](ARCHITECTURE.md) for how delivery fits in the pipeline.*
*See [Roadmap](ROADMAP.md) — Bark + Discord in Phase 0, ntfy in Phase 1, email in Phase 5.*
