# 🛰️ Event Radar

**The open-source, real-time event intelligence platform for traders.**

Event Radar monitors 30+ data sources — from SEC filings to presidential social media posts — classifies market-moving events with AI, and delivers actionable alerts in seconds, not hours.

> "The edge isn't in the analysis. It's in knowing first."

---

## What Is This?

Event Radar is a **full-stack event-driven trading intelligence system**. It bridges the gap between when information becomes public and when most traders find out.

When Block filed its 8-K restructuring announcement at 4:05 PM, CNBC didn't report it until 5-6 PM. By then, the stock had already moved 23%. Event Radar would have pushed that alert within 30 seconds.

**This is not a trading bot.** It doesn't execute trades. It gives you the information edge to make better decisions, faster.

---

## Core Capabilities

- **🔍 Multi-Source Scanning** — 30+ data sources across 6 tiers (see [Sources](docs/SOURCES.md))
- **🤖 AI Classification** — Event type, severity, direction signal, confidence score
- **⚡ Real-Time Alerts** — Sub-minute latency from source to your screen
- **📊 Professional Dashboard** — Bloomberg-inspired UI with live feed, charts, and analytics
- **🔗 Multi-Signal Correlation** — Cross-reference events across sources for higher conviction
- **📈 Backtesting** — Validate strategies against historical event data
- **🏥 Full Observability** — Prometheus metrics, Grafana dashboards, health monitoring

---

## Documentation

| Document | Description |
|----------|-------------|
| [**Vision**](docs/VISION.md) | Why this exists, who it's for, what success looks like |
| [**Sources**](docs/SOURCES.md) | Complete data source catalog (6 tiers, 30+ sources) |
| [**Architecture**](docs/ARCHITECTURE.md) | System design, data flow, component overview |
| [**Frontend**](docs/FRONTEND.md) | Dashboard UI design, panels, interactions |
| [**Delivery**](docs/DELIVERY.md) | Alert channels (Bark, ntfy, Discord, push strategy) |
| [**References**](docs/REFERENCES.md) | Open-source projects we build on |
| [**Roadmap**](docs/ROADMAP.md) | Phased development plan with milestones |

---

## Quick Links

- 📐 [Architecture Diagram](docs/ARCHITECTURE.md#system-diagram)
- 🗺️ [Roadmap](docs/ROADMAP.md)
- 🧱 [Tech Stack](docs/ARCHITECTURE.md#tech-stack)
- 📡 [All Data Sources](docs/SOURCES.md)

---

## Status

🚧 **Pre-Alpha** — Documentation and planning phase.

---

## License

MIT
