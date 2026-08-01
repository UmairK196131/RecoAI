# RecoAI — Sprint Plan & Agent Prompts

**Project:** AI-Powered Product Recommendations Shopify App  
**Methodology:** Agile, one complete functionality per sprint  
**Agent Model:** One dedicated agent per sprint

---

## How to Use This Document

1. Run sprints in order within each phase (dependencies are sequential).
2. Copy the **Agent Prompt** block for the target sprint into a new Cursor agent session.
3. Each agent must read the referenced docs before coding.
4. On sprint completion, the agent must: **run build → fix all errors → push to GitHub**.

---

## Phase Overview

| Phase | Name | Sprints | Outcome |
|---|---|---|---|
| 1 | Foundation & Auth | 1–3 | Runnable Shopify app with DB and OAuth |
| 2 | Data Sync Pipeline | 4–5 | Catalog and orders synced from Shopify |
| 3 | Event Tracking | 6–7 | Storefront behavioral events captured |
| 4 | Recommendation Engine | 8–11 | AI strategies + serving API live |
| 5 | Storefront Widgets | 12–13 | Recommendation blocks on storefront |
| 6 | Admin Dashboard | 14–16 | Merchant configuration UI complete |
| 7 | Analytics | 17 | Performance dashboard + CSV export |
| 8 | Billing & Monetization | 18 | Shopify Billing + usage gating |
| 9 | Launch Readiness | 19 | Security, compliance, App Store prep |

---

## Phase 1: Foundation & Auth

### Sprint 1 — Project Scaffolding & Dev Environment

**Deliverable:** Monorepo scaffold, Docker Compose (Postgres + Redis), Shopify app config, CI lint/build pipeline.

**Requirements:** FR-AUTH-01 (partial), NFR-MAINT-01, tech-stack repo structure

**Agent Prompt:**

```
You are implementing Sprint 1 of the RecoAI Shopify AI Recommendations App.

## Required Reading (read ALL before coding)
- docs/context.md — project scope and MVP boundaries
- docs/tech-stack.md — technology choices, repo structure, conventions
- docs/uiux.md — design system baseline (Polaris for future sprints)
- Docs/SRS_Shopify_AI_Recommendations_App.md — Sections 3, 8.6, 12

## Sprint Goal
Deliver a runnable project scaffold with local dev environment and Shopify app configuration.

## Tasks
1. Initialize the Shopify Remix app using the official `@shopify/shopify-app-remix` template (or equivalent per tech-stack.md).
2. Set up monorepo structure per docs/tech-stack.md:
   - apps/web (Remix admin app)
   - extensions/reco-theme (empty Theme App Extension placeholder)
   - packages/database (Prisma schema placeholder)
3. Add docker-compose.yml with PostgreSQL 15 (pgvector enabled) and Redis 7.
4. Configure shopify.app.toml with app name "RecoAI", required scopes from tech-stack.md, and API version.
5. Add GitHub Actions workflow: install, lint, typecheck, build on push.
6. Add .env.example with all required environment variables documented.
7. Add README with local setup steps (docker compose, npm install, shopify app dev).

## Acceptance Criteria
- [ ] `docker compose up` starts Postgres + Redis
- [ ] `npm run build` succeeds with zero errors
- [ ] `shopify app dev` starts without config errors
- [ ] Repo structure matches docs/tech-stack.md target layout
- [ ] No secrets committed

## Sprint Completion Protocol
1. Run `npm run build` (and lint/typecheck if configured).
2. Fix ALL build, lint, and type errors.
3. Commit with message: `feat(sprint-1): project scaffolding and dev environment`
4. Push code to GitHub.
5. Report: files created, commands verified, any blockers.
```

---

### Sprint 2 — Database Schema & Data Models

**Deliverable:** Full Prisma schema, migrations, seed script, tenant-isolated query helpers.

**Requirements:** Section 6 (Data Model), NFR-SEC-05, FR-AUTH-03

**Agent Prompt:**

```
You are implementing Sprint 2 of the RecoAI Shopify AI Recommendations App.

## Required Reading (read ALL before coding)
- docs/context.md — MVP scope and data entities
- docs/tech-stack.md — PostgreSQL, Prisma, pgvector, tenant isolation conventions
- docs/uiux.md — (skim for entity fields needed by admin UI later)
- Docs/SRS_Shopify_AI_Recommendations_App.md — Section 6 (Data Model), Section 8.4 (Security)

## Sprint Goal
Deliver the complete database schema with migrations and type-safe access layer.

## Tasks
1. Implement Prisma schema in packages/database for ALL entities from SRS Section 6:
   - Shop, Product, ProductVariant, Collection, Customer, BehavioralEvent, Order,
     RecommendationPlacement, RecommendationLog, ProductEmbedding (pgvector), ABTestExperiment
2. Enable pgvector extension; define embedding vector column on ProductEmbedding.
3. Add indexes: shop_id on all tenant tables, composite indexes for analytics queries.
4. Create migration and verify it runs against docker-compose Postgres.
5. Implement Shop-scoped query helper/middleware pattern enforcing shop_id filter (NFR-SEC-05).
6. Add encrypted field placeholder for shop access_token (AES-256-GCM utility in packages/database or apps/web).
7. Add npm scripts: `db:migrate`, `db:seed` (minimal seed: one test shop).

## Acceptance Criteria
- [ ] `npm run db:migrate` applies schema cleanly on fresh DB
- [ ] All SRS Section 6 entities present with correct relationships
- [ ] pgvector column works (test insert/query)
- [ ] Tenant isolation helper documented and used in example query
- [ ] `npm run build` succeeds

## Sprint Completion Protocol
1. Run `npm run build` and `npm run db:migrate`.
2. Fix ALL errors.
3. Commit: `feat(sprint-2): database schema and data models`
4. Push code to GitHub.
5. Report: schema summary, migration status, any deviations from SRS.
```

---

### Sprint 3 — OAuth, Session Auth & App Lifecycle

**Deliverable:** Full Shopify OAuth install flow, session token auth for embedded app, uninstall webhook with data purge scheduling.

**Requirements:** FR-AUTH-01 through FR-AUTH-05, NFR-SEC-02, NFR-SEC-04

**Agent Prompt:**

```
You are implementing Sprint 3 of the RecoAI Shopify AI Recommendations App.

## Required Reading (read ALL before coding)
- docs/context.md — auth requirements and MVP scope
- docs/tech-stack.md — Shopify app framework, session tokens, encryption
- docs/uiux.md — admin shell placeholder page
- Docs/SRS_Shopify_AI_Recommendations_App.md — Section 4.1 (FR-AUTH-*), Section 8.4

## Sprint Goal
Deliver complete app installation, authentication, and uninstall lifecycle.

## Tasks
1. Implement Shopify OAuth 2.0 authorization code flow (FR-AUTH-01).
2. Request minimum scopes per tech-stack.md (FR-AUTH-02).
3. Store shop access tokens encrypted at rest using AES-256-GCM (FR-AUTH-03, NFR-SEC-02).
4. Implement App Bridge session token verification on all /app/* routes (FR-AUTH-04, NFR-SEC-04).
5. Register and handle `app/uninstalled` webhook: mark shop status deleted, schedule data purge per retention policy (FR-AUTH-05).
6. Create minimal embedded admin home page at /app using Polaris Page + App Bridge NavMenu (per uiux.md nav structure).
7. Add health check endpoint `/health`.

## Acceptance Criteria
- [ ] App installs on dev store via OAuth without errors
- [ ] Embedded /app page loads inside Shopify Admin iframe
- [ ] Session token auth rejects unauthenticated requests
- [ ] Uninstall webhook marks shop and logs purge job
- [ ] Access tokens stored encrypted in DB
- [ ] `npm run build` succeeds

## Sprint Completion Protocol
1. Run `npm run build`.
2. Fix ALL errors.
3. Commit: `feat(sprint-3): OAuth, session auth, and app lifecycle`
4. Push code to GitHub.
5. Report: auth flow tested, webhook registered, any manual Shopify Partner Dashboard steps needed.
```

---

## Phase 2: Data Sync Pipeline

### Sprint 4 — Catalog Sync & Product Webhooks

**Deliverable:** Initial full catalog sync on install + real-time product/collection/inventory webhooks.

**Requirements:** FR-SYNC-01, FR-SYNC-02, FR-SYNC-06, NFR-AVAIL-03

**Agent Prompt:**

```
You are implementing Sprint 4 of the RecoAI Shopify AI Recommendations App.

## Required Reading (read ALL before coding)
- docs/context.md — sync scope and architecture
- docs/tech-stack.md — BullMQ queue, GraphQL Admin API, webhook HMAC
- docs/uiux.md — (no UI this sprint)
- Docs/SRS_Shopify_AI_Recommendations_App.md — Section 4.2 (FR-SYNC-01, 02, 06), Section 7.3

## Sprint Goal
Deliver catalog ingestion: full sync on install and webhook-driven incremental updates.

## Tasks
1. Implement initial full catalog sync job triggered post-install (FR-SYNC-01):
   - Products, variants, images, collections, metafields, inventory levels
   - Upsert into Product, ProductVariant, Collection tables
2. Register webhooks with HMAC verification (NFR-SEC-03):
   - products/create, products/update, products/delete
   - collections/update
   - inventory_levels/update
3. Process webhooks via BullMQ queue (idempotent handlers, NFR-AVAIL-03).
4. Implement GraphQL cost-aware throttling with exponential backoff (FR-SYNC-06).
5. Add admin API endpoint: GET /api/sync/status — returns last sync time, product count, errors.
6. Log structured sync events (NFR-MAINT-01).

## Acceptance Criteria
- [ ] Full sync populates products/variants/collections for dev store
- [ ] Product update webhook updates DB within seconds
- [ ] Product delete webhook removes/archives product
- [ ] HMAC validation rejects invalid webhook payloads
- [ ] Rate limit backoff prevents API ban
- [ ] `npm run build` succeeds

## Sprint Completion Protocol
1. Run `npm run build`.
2. Fix ALL errors.
3. Commit: `feat(sprint-4): catalog sync and product webhooks`
4. Push code to GitHub.
5. Report: sync counts from test store, webhook topics registered.
```

---

### Sprint 5 — Order Sync, GDPR Webhooks & Nightly Reconciliation

**Deliverable:** Order webhook ingestion, mandatory GDPR webhooks, nightly full re-sync job.

**Requirements:** FR-SYNC-03, FR-SYNC-04, FR-SYNC-05, Section 11.1

**Agent Prompt:**

```
You are implementing Sprint 5 of the RecoAI Shopify AI Recommendations App.

## Required Reading (read ALL before coding)
- docs/context.md — GDPR and data retention requirements
- docs/tech-stack.md — queue jobs, cron scheduling
- docs/uiux.md — (no UI this sprint)
- Docs/SRS_Shopify_AI_Recommendations_App.md — Section 4.2 (FR-SYNC-03, 04, 05), Section 11 (Security & Compliance)

## Sprint Goal
Deliver order data ingestion, GDPR compliance webhooks, and nightly reconciliation.

## Tasks
1. Register and process order webhooks (FR-SYNC-03):
   - orders/create, orders/updated, orders/paid
   - Upsert Order table with line_items, customer_id, total_price
2. Register and process GDPR mandatory webhooks (FR-SYNC-04):
   - customers/data_request — compile and return customer behavioral data
   - customers/redact — delete/anonymize customer PII and events
   - shop/redact — purge all shop data per retention policy
3. Register customers/create, customers/update webhooks for minimal Customer cache.
4. Implement nightly full re-sync cron job (FR-SYNC-05) reconciling catalog drift.
5. Implement data purge job for uninstall shops (48-hour purge per SRS 6.2).
6. Add sync status fields to Shop model: last_order_sync, last_reconciliation.

## Acceptance Criteria
- [ ] Test order creates Order record with line items
- [ ] GDPR redact webhook deletes customer events
- [ ] Nightly job registered and runnable via manual trigger
- [ ] Uninstalled shop data purge job works
- [ ] All webhook handlers idempotent
- [ ] `npm run build` succeeds

## Sprint Completion Protocol
1. Run `npm run build`.
2. Fix ALL errors.
3. Commit: `feat(sprint-5): order sync, GDPR webhooks, and reconciliation`
4. Push code to GitHub.
5. Report: GDPR webhook test results, order sync sample.
```

---

## Phase 3: Event Tracking

### Sprint 6 — Theme App Extension & Tracking Script

**Deliverable:** Theme App Extension with App Embed Block injecting async tracking script (<15KB gzipped).

**Requirements:** FR-EVT-01, FR-EVT-02, NFR-PERF-02, NFR-PERF-03

**Agent Prompt:**

```
You are implementing Sprint 6 of the RecoAI Shopify AI Recommendations App.

## Required Reading (read ALL before coding)
- docs/context.md — event types and tracking scope
- docs/tech-stack.md — TAE structure, vanilla JS, bundle size limits
- docs/uiux.md — Tracking Embed section (no visible UI)
- Docs/SRS_Shopify_AI_Recommendations_App.md — Section 4.3 (FR-EVT-01, 02), Section 8.1 (NFR-PERF-02, 03)

## Sprint Goal
Deliver the Theme App Extension tracking embed and lightweight storefront event capture.

## Tasks
1. Create extensions/reco-theme Theme App Extension with App Embed Block (FR-EVT-01).
2. Build tracking script (vanilla JS, no React):
   - Async/deferred load; bundle < 15KB gzipped (NFR-PERF-02)
   - Capture events (FR-EVT-02): product_view, collection_view, search, add_to_cart,
     remove_from_cart, checkout_start, purchase
3. Generate anonymous session ID (cookie/localStorage); link customer ID if logged in (FR-EVT-03).
4. Script must not block rendering or degrade LCP > 100ms (NFR-PERF-03).
5. Add Theme Editor schema for embed (enable/disable toggle only).
6. Document merchant activation steps in README (enable app embed in Theme Editor).

## Acceptance Criteria
- [ ] App embed appears in Theme Editor → App embeds
- [ ] Tracking script loads async on storefront
- [ ] product_view fires on product page visit (console log or network tab in dev)
- [ ] Bundle size < 15KB gzipped (report actual size)
- [ ] No visible DOM elements from tracking embed
- [ ] `npm run build` succeeds

## Sprint Completion Protocol
1. Run `npm run build` (including extension build).
2. Fix ALL errors.
3. Commit: `feat(sprint-6): theme app extension and tracking script`
4. Push code to GitHub.
5. Report: bundle size, events verified on dev storefront.
```

---

### Sprint 7 — Event Ingestion API, Batching & Consent

**Deliverable:** Backend event ingestion endpoint, client-side batching, Shopify Customer Privacy API integration.

**Requirements:** FR-EVT-03, FR-EVT-04, FR-EVT-05, Section 11.1

**Agent Prompt:**

```
You are implementing Sprint 7 of the RecoAI Shopify AI Recommendations App.

## Required Reading (read ALL before coding)
- docs/context.md — privacy and consent requirements
- docs/tech-stack.md — API routes, BehavioralEvent model, queue
- docs/uiux.md — storefront error states (consent denied)
- Docs/SRS_Shopify_AI_Recommendations_App.md — Section 4.3 (FR-EVT-03, 04, 05), Section 11.1

## Sprint Goal
Deliver event ingestion pipeline with batching and consent-aware tracking.

## Tasks
1. Create POST /api/events endpoint accepting batched events (FR-EVT-04):
   - Validate shop domain / shop_id
   - Rate limit per shop
   - Bulk insert into BehavioralEvent table
2. Update tracking script to batch events (buffer 10 events or 5s flush) and POST to API.
3. Integrate Shopify Customer Privacy API in tracking script (FR-EVT-05):
   - Check consent before setting tracking cookies or storing PII
   - Respect analytics vs marketing consent categories
4. Associate session_id for guests; customer_id for logged-in shoppers (FR-EVT-03).
5. Add recommendation event types to schema: recommendation_impression, recommendation_click (for Sprint 12).
6. Add event ingestion metrics logging.

## Acceptance Criteria
- [ ] Events batch and POST without blocking page
- [ ] Events stored in BehavioralEvent table with correct shop_id isolation
- [ ] Consent denied → no tracking cookie set; no PII stored
- [ ] Consent granted → session tracking works
- [ ] API rejects cross-shop event injection
- [ ] `npm run build` succeeds

## Sprint Completion Protocol
1. Run `npm run build`.
2. Fix ALL errors.
3. Commit: `feat(sprint-7): event ingestion, batching, and consent`
4. Push code to GitHub.
5. Report: sample events in DB, consent flow tested.
```

---

## Phase 4: Recommendation Engine

### Sprint 8 — Product Embeddings & Content-Based Similarity

**Deliverable:** Embedding pipeline on product create/update + content-based "similar products" strategy.

**Requirements:** FR-REC-01(b), Section 5.2 (new product cold-start), Section 5.3

**Agent Prompt:**

```
You are implementing Sprint 8 of the RecoAI Shopify AI Recommendations App.

## Required Reading (read ALL before coding)
- docs/context.md — recommendation strategies and cold-start
- docs/tech-stack.md — pgvector, embedding model choice, ML worker
- docs/uiux.md — (no UI this sprint)
- Docs/SRS_Shopify_AI_Recommendations_App.md — Section 5.1, 5.2, 5.3, FR-REC-01

## Sprint Goal
Deliver product embedding generation and content-based similarity recommendations.

## Tasks
1. Implement embedding job (Node @xenova/transformers OR Python FastAPI per tech-stack.md):
   - Input: product title + description + tags + product_type
   - Output: vector stored in ProductEmbedding (pgvector)
2. Trigger embedding on product create/update webhook (near real-time per Section 5.3).
3. Implement nightly full re-embedding sanity pass job.
4. Implement `content_similarity` strategy:
   - Given product_id, find top-K nearest neighbors via pgvector cosine similarity
   - Filter: active products, in-stock (if inventory data available)
5. Add model_version field tracking for rollback (NFR-MAINT-02).
6. Unit tests for similarity query with seeded embeddings.

## Acceptance Criteria
- [ ] Embeddings generated for all synced products
- [ ] Similar products returned for a test product_id
- [ ] New product gets embedding on webhook within minutes
- [ ] pgvector query performs in < 50ms for 10K products
- [ ] `npm run build` succeeds

## Sprint Completion Protocol
1. Run `npm run build` and tests.
2. Fix ALL errors.
3. Commit: `feat(sprint-8): product embeddings and content-based similarity`
4. Push code to GitHub.
5. Report: embedding model used, sample similar products output.
```

---

### Sprint 9 — Trending, Best-Sellers & Cold-Start Fallback

**Deliverable:** Trending score calculation job + cold-start fallback logic for new stores/products/shoppers.

**Requirements:** FR-REC-01(d), FR-REC-04, Section 5.2

**Agent Prompt:**

```
You are implementing Sprint 9 of the RecoAI Shopify AI Recommendations App.

## Required Reading (read ALL before coding)
- docs/context.md — cold-start handling rules
- docs/tech-stack.md — batch jobs, Redis cache
- docs/uiux.md — (no UI this sprint)
- Docs/SRS_Shopify_AI_Recommendations_App.md — Section 5.1, 5.2, FR-REC-01(d), FR-REC-04

## Sprint Goal
Deliver trending/best-seller rankings and cold-start fallback strategy.

## Tasks
1. Implement trending score job (rolling window, recalculate every few hours per Section 5.3):
   - Signals: recent order volume, product_view events, sales velocity
   - Store scores in Redis or DB trending_scores table
2. Implement `trending` / `best_sellers` recommendation strategy returning top-K products.
3. Implement cold-start fallback logic (FR-REC-04, Section 5.2):
   - New store (< 50 orders): content_similarity + trending
   - New product: content_similarity immediately
   - Anonymous shopper: trending + content based on current product view
4. Implement `recently_viewed` session-based strategy using BehavioralEvent session data.
5. Strategy selector function: picks appropriate strategy based on data availability thresholds.

## Acceptance Criteria
- [ ] Trending job runs and produces ranked product list
- [ ] New store with zero orders gets trending recommendations (not empty)
- [ ] New product gets content-based recommendations
- [ ] Recently viewed returns session products in order
- [ ] Cold-start thresholds configurable via env or config
- [ ] `npm run build` succeeds

## Sprint Completion Protocol
1. Run `npm run build` and tests.
2. Fix ALL errors.
3. Commit: `feat(sprint-9): trending scores and cold-start fallback`
4. Push code to GitHub.
5. Report: trending top-10 sample, cold-start test scenarios.
```

---

### Sprint 10 — Collaborative Filtering & Association Rules

**Deliverable:** Daily batch jobs for CF co-purchase model and association rule mining (frequently bought together).

**Requirements:** FR-REC-01(a,c), Section 5.1, Section 5.3

**Agent Prompt:**

```
You are implementing Sprint 10 of the RecoAI Shopify AI Recommendations App.

## Required Reading (read ALL before coding)
- docs/context.md — CF and association rule use cases
- docs/tech-stack.md — Python ML worker or Node batch, model registry
- docs/uiux.md — strategy names for merchant UI ("Customers also bought", "Frequently bought together")
- Docs/SRS_Shopify_AI_Recommendations_App.md — Section 5.1, 5.3, FR-REC-01(a,c)

## Sprint Goal
Deliver collaborative filtering and association rule recommendation strategies.

## Tasks
1. Implement daily batch job reading Order line_items per shop:
   - Build co-purchase matrix (product pairs from same orders)
2. Implement `collaborative_filtering` strategy (FR-REC-01a):
   - "Customers who bought X also bought Y"
   - Minimum order threshold before activating (configurable, default 50 orders)
3. Implement association rule mining (FR-REC-01c):
   - Apriori or FP-Growth style market-basket analysis
   - `frequently_bought_together` strategy returning product bundles
4. Store precomputed CF/association results in DB or Redis for fast serving.
5. Schedule: CF incremental daily + full weekly retrain; association rules daily (Section 5.3).
6. Version models in model registry (NFR-MAINT-02).

## Acceptance Criteria
- [ ] CF strategy returns co-purchase recommendations for products with sufficient data
- [ ] Association rules return "frequently bought together" sets
- [ ] Shops below order threshold fall back to content/trending (no empty results)
- [ ] Batch jobs runnable via CLI trigger for dev testing
- [ ] `npm run build` succeeds

## Sprint Completion Protocol
1. Run `npm run build` and tests.
2. Fix ALL errors.
3. Commit: `feat(sprint-10): collaborative filtering and association rules`
4. Push code to GitHub.
5. Report: sample CF and FBT outputs, order threshold behavior.
```

---

### Sprint 11 — Recommendation Serving API, Caching & Business Rules

**Deliverable:** Low-latency public serving API with Redis cache, business rule post-filters, and session re-ranking.

**Requirements:** FR-REC-02, FR-REC-03, FR-REC-06, FR-REC-07, NFR-PERF-01, NFR-AVAIL-02

**Agent Prompt:**

```
You are implementing Sprint 11 of the RecoAI Shopify AI Recommendations App.

## Required Reading (read ALL before coding)
- docs/context.md — serving architecture and performance targets
- docs/tech-stack.md — Redis cache, API design, response format
- docs/uiux.md — storefront error states (hide on failure)
- Docs/SRS_Shopify_AI_Recommendations_App.md — Section 4.4 (FR-REC-02 through 07), Section 8.1, Appendix 13.1

## Sprint Goal
Deliver the Recommendation Serving API — the core runtime endpoint for storefront widgets.

## Tasks
1. Create GET /api/recommendations endpoint (FR-REC-02):
   - Params: shop, placement_type, product_id (optional), session_id, cart_product_ids
   - Response format per SRS Appendix 13.1
   - Target p95 < 150ms (NFR-PERF-01)
2. Implement strategy routing: resolve placement config → call appropriate strategy function.
3. Implement business rule post-filters (FR-REC-03):
   - Exclude out-of-stock, excluded collections/products/tags, price range, cart items
4. Implement Redis cache per shop/product/placement with configurable TTL (FR-REC-06).
5. Implement session re-ranking using current session views (FR-REC-07).
6. Graceful degradation (NFR-AVAIL-02): on error, return cached result or empty (never 500 to storefront).
7. Add response timing middleware; log p95 metrics.

## Acceptance Criteria
- [ ] API returns recommendations for all implemented strategies
- [ ] Post-filters correctly exclude out-of-stock and cart items
- [ ] Cache hit reduces response time measurably
- [ ] p95 < 150ms on local benchmark (report numbers)
- [ ] Error returns empty recommendations array, not HTTP 500
- [ ] `npm run build` succeeds

## Sprint Completion Protocol
1. Run `npm run build` and tests.
2. Fix ALL errors.
3. Commit: `feat(sprint-11): recommendation serving API, caching, and business rules`
4. Push code to GitHub.
5. Report: benchmark timings, sample API responses per strategy.
```

---

## Phase 5: Storefront Widgets

### Sprint 12 — Recommendation Widget App Blocks (Grid & Carousel)

**Deliverable:** Theme App Extension recommendation blocks with grid/carousel layouts, Theme Editor settings, API integration.

**Requirements:** FR-REC-05 (partial), Section 7.5, NFR-AVAIL-02

**Agent Prompt:**

```
You are implementing Sprint 12 of the RecoAI Shopify AI Recommendations App.

## Required Reading (read ALL before coding)
- docs/context.md — placement types and widget behavior
- docs/tech-stack.md — TAE App Blocks, vanilla JS widget, lazy loading
- docs/uiux.md — Storefront Widget Visual Specs, Theme Editor Settings Schema, CSS strategy, accessibility
- Docs/SRS_Shopify_AI_Recommendations_App.md — Section 4.4 (FR-REC-05), Section 7.5, Section 8.1

## Sprint Goal
Deliver storefront recommendation widget blocks with grid and carousel layouts.

## Tasks
1. Add App Blocks to extensions/reco-theme for recommendation widget (per uiux.md):
   - Product card: image, title, price, optional quick-add button
   - Grid layout (2–4 columns responsive)
   - Carousel layout (horizontal scroll, arrows, snap on mobile)
2. Implement Theme Editor settings schema (uiux.md): heading, item count, layout, columns, show price, show ATC.
3. Widget JS fetches from /api/recommendations (Sprint 11) with placement_type and context.
4. Lazy-load images; explicit width/height to prevent CLS (uiux.md).
5. Track recommendation_impression and recommendation_click events (FR-EVT-02).
6. Error handling: hide block on API failure (uiux.md, NFR-AVAIL-02).
7. CSS: BEM classes (recoai-*), minimal scoped styles, dark theme support.

## Acceptance Criteria
- [ ] Widget renders on storefront with real recommendations
- [ ] Grid and carousel layouts work on mobile and desktop
- [ ] Theme Editor settings change widget appearance live
- [ ] Impression/click events fire correctly
- [ ] API failure hides block without breaking page
- [ ] `npm run build` succeeds

## Sprint Completion Protocol
1. Run `npm run build` (including extension).
2. Fix ALL errors.
3. Commit: `feat(sprint-12): recommendation widget blocks grid and carousel`
4. Push code to GitHub.
5. Report: screenshots or storefront URL, layout tests on mobile.
```

---

### Sprint 13 — All Placement Types & Storefront Integration

**Deliverable:** Widget blocks for all MVP placements: product page, cart, home, collection, search results.

**Requirements:** FR-REC-05, Section 7.2

**Agent Prompt:**

```
You are implementing Sprint 13 of the RecoAI Shopify AI Recommendations App.

## Required Reading (read ALL before coding)
- docs/context.md — all placement types in MVP
- docs/tech-stack.md — TAE block targeting, Liquid context variables
- docs/uiux.md — responsive breakpoints, empty states
- Docs/SRS_Shopify_AI_Recommendations_App.md — Section 4.4 (FR-REC-05), Section 7.2

## Sprint Goal
Deliver all MVP placement types integrated on the correct storefront pages.

## Tasks
1. Create placement-specific App Blocks (or single block with placement setting):
   - Product page: "You may also like" + "Frequently bought together"
   - Cart page/drawer: "Add these too"
   - Home page: "Trending now" + "Picks for you"
   - Collection page: related products
   - Search results: recommendations when low/no results
2. Pass correct context to API per placement (product_id, collection_id, search query, cart items).
3. Default strategy per placement type (sensible defaults if merchant hasn't configured).
4. Document Theme Editor placement guide: where to add each block in theme sections.
5. Verify all placements work on at least one OS 2.0 theme (Dawn).

## Acceptance Criteria
- [ ] Product page shows YMAL and FBT blocks with correct strategies
- [ ] Cart page shows complementary products excluding cart items
- [ ] Home page shows trending products
- [ ] Collection page shows related products
- [ ] Search low-results shows fallback recommendations
- [ ] All placements respect responsive breakpoints (uiux.md)
- [ ] `npm run build` succeeds

## Sprint Completion Protocol
1. Run `npm run build`.
2. Fix ALL errors.
3. Commit: `feat(sprint-13): all placement types and storefront integration`
4. Push code to GitHub.
5. Report: placement checklist with pass/fail per page.
```

---

## Phase 6: Admin Dashboard

### Sprint 14 — Admin Shell, Navigation & Dashboard Overview

**Deliverable:** Full App Bridge navigation, dashboard with KPI cards and setup checklist.

**Requirements:** FR-CFG-01 (partial), Section 7.4, NFR-USE-01

**Agent Prompt:**

```
You are implementing Sprint 14 of the RecoAI Shopify AI Recommendations App.

## Required Reading (read ALL before coding)
- docs/context.md — admin user goals
- docs/tech-stack.md — Polaris, App Bridge NavMenu, Remix routes
- docs/uiux.md — Navigation Structure, Dashboard page spec, Polaris Component Map
- Docs/SRS_Shopify_AI_Recommendations_App.md — Section 4.5 (FR-CFG-01), Section 7.4, Section 8.5

## Sprint Goal
Deliver the admin app shell with navigation and dashboard overview page.

## Tasks
1. Implement App Bridge NavMenu with routes per uiux.md:
   Dashboard, Placements, Analytics, Settings, Billing
2. Build Dashboard page (/app) per uiux.md:
   - Setup checklist card (4 steps: embed, tracking, placement, view store)
   - KPI cards: attributed revenue 30d, clicks, CTR, active placements (query real or placeholder data)
   - Quick action buttons
   - Empty state for new installs
3. Use Polaris components exclusively (NFR-USE-01, uiux.md Component Map).
4. Add Polaris AppProvider with i18n stub.
5. Ensure all /app routes require session token auth.

## Acceptance Criteria
- [ ] Navigation works in Shopify Admin embedded iframe
- [ ] Dashboard renders KPI cards and setup checklist
- [ ] Setup checklist reflects actual install state (embed enabled, etc.)
- [ ] Polaris design consistent with Shopify Admin
- [ ] `npm run build` succeeds

## Sprint Completion Protocol
1. Run `npm run build`.
2. Fix ALL errors.
3. Commit: `feat(sprint-14): admin shell, navigation, and dashboard`
4. Push code to GitHub.
5. Report: routes created, dashboard screenshot description.
```

---

### Sprint 15 — Placement Configuration UI & Live Preview

**Deliverable:** Placements list, placement editor with form fields, and live preview panel.

**Requirements:** FR-CFG-01, FR-CFG-02, FR-CFG-03

**Agent Prompt:**

```
You are implementing Sprint 15 of the RecoAI Shopify AI Recommendations App.

## Required Reading (read ALL before coding)
- docs/context.md — placement configuration scope
- docs/tech-stack.md — Remix loaders/actions, RecommendationPlacement model
- docs/uiux.md — Placements List, Placement Editor, Preview panel, ContextualSaveBar
- Docs/SRS_Shopify_AI_Recommendations_App.md — Section 4.5 (FR-CFG-01, 02, 03)

## Sprint Goal
Deliver full placement configuration UI with live preview.

## Tasks
1. Placements list page (/app/placements) per uiux.md:
   - IndexTable: name, type, strategy, status, items shown
   - Row actions: Edit, Enable/Disable
   - Create placement button
2. Placement editor (/app/placements/:id) per uiux.md:
   - Form: placement type, strategy, item count, heading, grid/carousel, columns, enable toggle
   - Persist to RecommendationPlacement table
3. Live preview panel (right column):
   - Mock product cards reflecting selected layout/settings
   - Updates on form change (client-side)
4. Polaris ContextualSaveBar on unsaved changes.
5. CRUD API routes with shop_id tenant isolation.

## Acceptance Criteria
- [ ] Merchant can create, edit, enable/disable placements
- [ ] All form fields from uiux.md present and saved to DB
- [ ] Live preview reflects layout and heading changes
- [ ] Enabled placement config drives serving API strategy selection
- [ ] `npm run build` succeeds

## Sprint Completion Protocol
1. Run `npm run build`.
2. Fix ALL errors.
3. Commit: `feat(sprint-15): placement configuration UI and live preview`
4. Push code to GitHub.
5. Report: CRUD flows tested, preview behavior.
```

---

### Sprint 16 — Exclusion Rules & Onboarding Wizard

**Deliverable:** Exclusion rules settings page and first-time onboarding wizard.

**Requirements:** FR-CFG-04, FR-CFG-06, NFR-USE-02

**Agent Prompt:**

```
You are implementing Sprint 16 of the RecoAI Shopify AI Recommendations App.

## Required Reading (read ALL before coding)
- docs/context.md — exclusion rules and onboarding goal (<10 min setup)
- docs/tech-stack.md — product/collection search API, shop settings storage
- docs/uiux.md — Exclusion Rules page, Onboarding Wizard steps, copy/tone
- Docs/SRS_Shopify_AI_Recommendations_App.md — Section 4.5 (FR-CFG-04, 06), Section 8.5 (NFR-USE-02)

## Sprint Goal
Deliver exclusion rules configuration and first-time onboarding wizard.

## Tasks
1. Exclusion rules page (/app/settings/exclusions) per uiux.md:
   - Multi-select products, collections, tags to exclude globally
   - Search-as-you-type product/collection picker (ResourceList)
   - Store in RecommendationPlacement.exclusion_rules or Shop settings JSON
2. Wire exclusion rules into serving API post-filters (Sprint 11).
3. Onboarding wizard (first visit detection) per uiux.md:
   - Step 1: Welcome
   - Step 2: Deep link to Theme Editor app embed activation
   - Step 3: Simplified first placement creation
   - Step 4: Success + view store link
   - Progress indicator
4. Mark onboarding complete in Shop record; skip wizard on return visits.
5. Update dashboard setup checklist to reflect wizard progress.

## Acceptance Criteria
- [ ] Excluded products never appear in recommendations
- [ ] Excluded collections/tags respected in all strategies
- [ ] New install shows onboarding wizard automatically
- [ ] Wizard completes in guided flow; merchant can reach live widget
- [ ] Setup achievable in < 10 minutes (NFR-USE-02)
- [ ] `npm run build` succeeds

## Sprint Completion Protocol
1. Run `npm run build`.
2. Fix ALL errors.
3. Commit: `feat(sprint-16): exclusion rules and onboarding wizard`
4. Push code to GitHub.
5. Report: exclusion test cases, onboarding flow walkthrough.
```

---

## Phase 7: Analytics

### Sprint 17 — Analytics Dashboard & CSV Export

**Deliverable:** Full analytics page with charts, per-placement breakdown, date ranges, and CSV export.

**Requirements:** FR-ANL-01, FR-ANL-02, FR-ANL-04

**Agent Prompt:**

```
You are implementing Sprint 17 of the RecoAI Shopify AI Recommendations App.

## Required Reading (read ALL before coding)
- docs/context.md — analytics metrics definitions (CTR, attributed revenue)
- docs/tech-stack.md — RecommendationLog model, Recharts, CSV generation
- docs/uiux.md — Analytics page spec, date range picker, export button
- Docs/SRS_Shopify_AI_Recommendations_App.md — Section 4.6 (FR-ANL-01, 02, 04)

## Sprint Goal
Deliver analytics dashboard with metrics, charts, and CSV export.

## Tasks
1. Ensure RecommendationLog populated from impression/click events (Sprint 12) with attribution logic:
   - Track converted boolean and attributed_order_id when purchase follows click
2. Analytics page (/app/analytics) per uiux.md:
   - Date range picker: 7d, 30d, 90d, custom
   - Summary cards: impressions, clicks, CTR, add-to-cart rate, attributed revenue
   - Line chart: clicks/impressions over time
   - Bar chart: top products by recommendation clicks
   - Table: per-placement breakdown
3. CSV export endpoint (FR-ANL-04): download analytics for selected date range.
4. Aggregate queries optimized with indexes; cache heavy aggregates in Redis.

## Acceptance Criteria
- [ ] Analytics reflect real impression/click data from storefront
- [ ] CTR and attributed revenue calculated correctly
- [ ] Charts render with Polaris-compatible styling
- [ ] CSV export downloads valid file with headers
- [ ] Date range filter works across all views
- [ ] `npm run build` succeeds

## Sprint Completion Protocol
1. Run `npm run build`.
2. Fix ALL errors.
3. Commit: `feat(sprint-17): analytics dashboard and CSV export`
4. Push code to GitHub.
5. Report: sample metrics, CSV format, query performance notes.
```

---

## Phase 8: Billing & Monetization

### Sprint 18 — Shopify Billing, Tiered Plans & Graceful Degradation

**Deliverable:** Billing page, plan subscription via Shopify Billing API, usage gating, and degradation on lapse/cap.

**Requirements:** FR-BILL-01 through FR-BILL-05, Section 10, Section 9.2

**Agent Prompt:**

```
You are implementing Sprint 18 of the RecoAI Shopify AI Recommendations App.

## Required Reading (read ALL before coding)
- docs/context.md — billing tiers and feature gating
- docs/tech-stack.md — Shopify Billing GraphQL mutations
- docs/uiux.md — Billing page spec, plan cards, usage meter, trial banner
- Docs/SRS_Shopify_AI_Recommendations_App.md — Section 4.7 (FR-BILL-*), Section 10, Section 9.2

## Sprint Goal
Deliver Shopify Billing integration with tiered plans and usage-based graceful degradation.

## Tasks
1. Define plans per context.md billing tiers:
   - Free/Starter: 1–2 placements, trending + content only, session cap
   - Growth: all placements, CF + association rules, standard cap
   - Pro: all features, higher cap, analytics export
2. Implement Shopify Billing API subscription flow (FR-BILL-01):
   - Create subscription, confirm, handle callback
   - Free trial 14 days (FR-BILL-03)
   - Upgrade/downgrade with proration (FR-BILL-04)
3. Register app_subscriptions/update webhook.
4. Billing page (/app/billing) per uiux.md: plan cards, current plan, usage meter.
5. Feature gating middleware (FR-BILL-02):
   - Check plan_tier before allowing placement types, strategies, exports
6. Graceful degradation (FR-BILL-05):
   - Subscription lapse or cap exceeded → trending-only recommendations
   - Admin banner prompting upgrade; storefront never breaks
7. Track monthly session count per shop for usage metering.

## Acceptance Criteria
- [ ] Merchant can subscribe to Growth/Pro plans via Shopify Billing
- [ ] Free trial activates without immediate charge
- [ ] Upgrade/downgrade flows work
- [ ] Free tier blocks CF strategies and extra placements
- [ ] Lapsed subscription degrades to trending-only on storefront
- [ ] Usage cap triggers degradation + upgrade notice
- [ ] `npm run build` succeeds

## Sprint Completion Protocol
1. Run `npm run build`.
2. Fix ALL errors.
3. Commit: `feat(sprint-18): Shopify billing, tiered plans, and degradation`
4. Push code to GitHub.
5. Report: plan definitions, gating test matrix, billing flow tested.
```

---

## Phase 9: Launch Readiness

### Sprint 19 — Security Hardening, Observability & App Store Prep

**Deliverable:** Security audit fixes, structured logging, health monitoring, privacy policy page, App Store checklist.

**Requirements:** NFR-SEC-*, NFR-AVAIL-*, NFR-MAINT-*, Section 9.1, Section 11

**Agent Prompt:**

```
You are implementing Sprint 19 of the RecoAI Shopify AI Recommendations App.

## Required Reading (read ALL before coding)
- docs/context.md — success criteria for MVP launch, compliance requirements
- docs/tech-stack.md — logging, monitoring, security conventions
- docs/uiux.md — copy/tone for any user-facing error messages added
- Docs/SRS_Shopify_AI_Recommendations_App.md — Section 8 (NFRs), Section 9, Section 11, Section 12

## Sprint Goal
Deliver launch-ready security, observability, and App Store compliance artifacts.

## Tasks
1. Security audit and fixes:
   - Verify TLS, HMAC on all webhooks (NFR-SEC-03), session tokens on admin routes (NFR-SEC-04)
   - Confirm per-shop isolation on every DB query (NFR-SEC-05)
   - Audit for secrets in code; rotate any test keys
2. Observability (NFR-MAINT-01):
   - Structured JSON logging (sync failures, serving errors, job status)
   - /health and /ready endpoints with DB/Redis checks
   - Error rate logging on recommendation API
3. Performance verification:
   - Benchmark recommendation API p95 (target < 150ms)
   - Verify tracking script < 15KB gzipped
4. App Store compliance (Section 9.1):
   - Public privacy policy page (/privacy) with data usage disclosure
   - GDPR webhook test suite (automated or documented manual tests)
   - README: App Store listing copy draft, setup instructions
5. Create docs/app-store-checklist.md with pass/fail items for Shopify review.
6. Fix any remaining build warnings; ensure CI pipeline green.

## Acceptance Criteria
- [ ] No cross-tenant data leakage in query audit
- [ ] All webhooks verify HMAC
- [ ] Health endpoints return correct status
- [ ] Recommendation API p95 documented < 150ms
- [ ] Privacy policy page accessible
- [ ] GDPR webhooks tested and documented
- [ ] App Store checklist complete
- [ ] `npm run build` and CI pass with zero errors

## Sprint Completion Protocol
1. Run full CI pipeline: lint, typecheck, build, tests.
2. Fix ALL errors and warnings.
3. Commit: `feat(sprint-19): security hardening, observability, and app store prep`
4. Push code to GitHub.
5. Report: security audit findings, performance benchmarks, App Store checklist status, launch readiness assessment.
```

---

## Future Phase (v1.1 — Post-MVP)

| Sprint | Feature | SRS Reference |
|---|---|---|
| 20 | A/B Testing UI & experiment engine | FR-ANL-03 |
| 21 | Merchandising overrides (pin/curate products) | FR-CFG-05 |
| 22 | Checkout UI Extensions (Shopify Plus post-purchase) | Section 9.3 |
| 23 | LLM-generated recommendation copy (optional) | Section 5.4 |

---

## Sprint Dependency Graph

```
Sprint 1 → 2 → 3 → 4 → 5 → 6 → 7
                              ↓
                    8 → 9 → 10 → 11
                              ↓
                         12 → 13
                              ↓
                    14 → 15 → 16
                              ↓
                            17 → 18 → 19
```

---

## Agent Quick Reference

Every sprint agent must:

1. Read `docs/context.md`, `docs/tech-stack.md`, `docs/uiux.md`, and relevant `Docs/SRS_Shopify_AI_Recommendations_App.md` sections
2. Implement only the sprint deliverable — no scope creep
3. Follow `docs/tech-stack.md` conventions and `docs/uiux.md` design specs
4. Enforce `shop_id` tenant isolation on all data access
5. On completion: **run build → fix all errors → commit → push to GitHub**
6. Report acceptance criteria checklist with pass/fail per item
