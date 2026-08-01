# RecoAI — Project Context

**App Name:** RecoAI (working name)  
**Type:** Public Shopify App — AI-Powered Product Recommendations  
**SRS Version:** 1.0 | August 1, 2026

---

## What We're Building

RecoAI is a multi-tenant SaaS Shopify app that analyzes merchant catalogs, order history, and shopper behavior to deliver personalized product recommendations on the storefront. Merchants configure placements and strategies via an embedded Admin UI (Polaris + App Bridge). Recommendations are rendered via Theme App Extensions (Online Store 2.0 only).

---

## MVP Scope (v1 Launch)

### In Scope
- OAuth 2.0 installation + embedded session token auth
- Catalog & order sync via webhooks + nightly reconciliation
- GDPR mandatory webhooks (`customers/data_request`, `customers/redact`, `shop/redact`)
- Lightweight async tracking script (App Embed Block)
- Event types: `product_view`, `collection_view`, `search`, `add_to_cart`, `remove_from_cart`, `checkout_start`, `purchase`, `recommendation_impression`, `recommendation_click`
- Recommendation strategies: collaborative filtering, content/embedding similarity, association rules, trending/best-sellers fallback, recently viewed (session-based)
- Placements: product page, cart, home, collection, search results (low/no results)
- Admin: enable/disable placements, strategy selection, item count, title, grid/carousel style, exclusion rules, onboarding wizard
- Analytics: impressions, clicks, CTR, add-to-cart rate, attributed revenue, date-range dashboard, CSV export
- Billing: Shopify Billing API, tiered plans (Free/Starter, Growth, Pro), free trial, graceful degradation on lapse/cap

### Out of Scope (v1)
- Native mobile SDKs
- Email/SMS recommendation injection
- Multi-platform (non-Shopify)
- Custom per-merchant foundation model training
- Checkout UI Extensions / post-purchase (Plus-only — future phase)
- A/B testing (v1.1 — Should-Have)
- Merchandising pin/override (v1.1 — Should-Have)
- Role-based admin access (v1)

---

## Key Users

| User | Goal |
|---|---|
| Merchant Admin | Install, configure placements, view analytics, manage billing |
| Storefront Shopper | Sees recommendation widgets; passive event consumer |
| App Support (internal) | Troubleshoot sync/serving issues |

---

## Architecture Summary

```
Shopify Admin (App Bridge) ──► App Backend API (OAuth, config, billing, analytics)
Storefront TAE Widget ────────► Recommendation Serving API (<150ms p95)
Shopify Webhooks ─────────────► Sync/Webhook Worker (queue-based)
                                      │
                    PostgreSQL + Redis + Vector Store (pgvector)
                                      │
                              ML Pipeline (batch jobs)
```

---

## Critical Constraints

- Online Store 2.0 Theme App Extensions only — no `theme.liquid` injection
- GraphQL Admin API (REST legacy for new endpoints)
- Tracking script < 15KB gzipped, async/deferred
- Recommendation API p95 < 150ms
- Per-shop data isolation (no cross-tenant leakage)
- Shopify App Store review compliance (GDPR webhooks, privacy policy, performance)

---

## Billing Tiers (MVP)

| Tier | Placements | Strategies | Sessions/Orders Cap |
|---|---|---|---|
| Free/Starter | 1–2 widget types | Trending + content-based | Capped |
| Growth | All placements | + CF + association rules | Standard cap |
| Pro/Plus | All + advanced analytics export | All strategies | Higher/no cap |

---

## Success Criteria for MVP Launch

1. Merchant can install → configure → see live recommendations in < 10 minutes
2. Recommendations serve in < 150ms p95 with cold-start fallback
3. Storefront degrades gracefully if backend unavailable
4. GDPR webhooks implemented and tested
5. Billing via Shopify Billing API with trial + downgrade handling
6. Passes Shopify App Store automated review checklist

---

## Reference Documents

| File | Purpose |
|---|---|
| `Docs/SRS_Shopify_AI_Recommendations_App.md` | Full SRS with requirement IDs (FR-*, NFR-*) |
| `docs/tech-stack.md` | Technology choices and conventions |
| `docs/uiux.md` | Admin UI and storefront widget design specs |
| `docs/sprints.md` | Phase/sprint plan and agent prompts |
