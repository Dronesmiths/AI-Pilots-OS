# AI Pilots OS

AI Pilots OS is the command-and-control CRM for managing voice agents and autonomous SEO fleets. 

This repository has been rebuilt from a "Scorched Earth" foundation—stripping away all legacy bloat to create a lean, fast orchestration engine.

---

## 🏗️ Architecture: Two Layers

The system strictly divides **Control** from **Execution**:

| Layer | Where | Role | Rule |
|---|---|---|---|
| **CRM (This Repo)** | Vercel (Next.js) | Control + State + UI | **NEVER runs jobs.** Acts as a queue and dashboard. |
| **Drones** | EC2 (Cron Workers) | Publishing | **ALL content generation happens here.** |

### CRM Components
- **Voice Agent Infrastructure:** Core Twilio and Vapi handlers, call records, and insights.
- **War Room Dashboard:** The central UI for operators to manage SEO campaigns and view drone output.
- **Jules Engine APIs:** Enqueues cards (tasks) onto the master calendar for drones to pick up.

---

## 🚁 The Drone Fleet (Jules Engine)

Drones live on separate EC2 instances and run on cron timers. They poll the CRM's database for scheduled tasks ("cards"), generate the content, push it to the client's GitHub (triggering Cloudflare Pages), and mark the card as "Live".

| Drone | Target | Action |
|---|---|---|
| `location-drone` | 📍 Local SEO | Generates geo-targeted location/service pages. |
| `blog-drone` | 📝 Freshness | Creates PAA-style articles for daily signals. |
| `cornerstone-drone`| 🏛️ Authority | Builds massive 4000+ word pillar pages. |
| `qa-drone` | 🤖 Answers | Manufactures Q&A pairs from "People Also Ask" queries. |
| `repair-drone` | 🔧 Maintenance | Fixes broken internal links, images, and GSC issues. |

---

## 🛠️ Current State: Clean Slate

This workspace has been purged of legacy Nova AI governance bloat. 
- **MongoDB:** Reduced from 208 collections to 5 core collections.
- **Models:** Only 5 core models remain (`User`, `Tenant`, `Workspace`, `CallRecord`, `VoiceInsight`).
- **File Structure:** ~80 essential files.

### Next Steps / Roadmap
1. **Onboarding Flow:** Rebuild the Cloudflare API, GitHub Repo, and GSC connection flow.
2. **Jules Engine APIs:** Rebuild the endpoints that populate the 60-day War Room calendar.
3. **War Room UI:** Connect the visual dashboard to the new, simplified calendar logic.
