# RecoAI — Tech Stack

All implementation must follow this stack. Do not introduce alternate frameworks without explicit sprint approval.

---

## Core Platform

| Layer | Technology | Notes |
|---|---|---|
| Runtime | Node.js 20+ / TypeScript 5+ | Primary backend and admin app |
| Shopify App Framework | `@shopify/shopify-app-remix` or official Remix template | OAuth, session storage, webhook HMAC |
| Package Manager | npm or pnpm | Match existing repo lockfile |
| Monorepo (optional) | Turborepo or npm workspaces | `apps/web`, `apps/api`, `extensions/` |

---

## Frontend — Admin UI

| Component | Technology |
|---|---|
| Framework | Remix (Shopify app template default) or React 18 |
| Design System | Shopify Polaris v12+ |
| Embedding | Shopify App Bridge v4+ |
| Auth | App Bridge session tokens (not legacy cookie auth) |
| Charts | Recharts or Polaris-compatible chart library |
| State | Remix loaders/actions; React hooks for local UI state |

---

## Frontend — Storefront

| Component | Technology |
|---|---|
| Extension Type | Theme App Extension (Online Store 2.0) |
| Block Types | App Embed Block (tracking pixel) + App Blocks (recommendation widgets) |
| Widget JS | Vanilla JS or Web Components — **no React on storefront** |
| Bundle Target | < 15KB gzipped for tracking script |
| Loading | `async`/`defer`; lazy-load recommendation blocks below fold |

---

## Backend — App API

| Component | Technology |
|---|---|
| HTTP Framework | Remix server routes or Express/Fastify |
| GraphQL Client | `@shopify/shopify-api` Admin GraphQL client |
| Validation | Zod |
| API Style | REST for storefront serving API; Remix actions for admin |

---

## Backend — ML / Recommendations

| Component | Technology |
|---|---|
| ML Service | Python 3.11+ FastAPI microservice **or** Node-based inference for MVP simplicity |
| Embeddings | `sentence-transformers` (Python) or `@xenova/transformers` (Node) — product title + description |
| Vector Search | pgvector extension on PostgreSQL |
| CF / Association Rules | Python (`scikit-learn`, `mlxtend`) batch jobs |
| Model Registry | Versioned artifacts in S3-compatible storage or DB metadata table |

---

## Data Layer

| Store | Technology | Purpose |
|---|---|---|
| Primary DB | PostgreSQL 15+ | Shops, products, orders, config, analytics |
| Vector Store | pgvector (same PostgreSQL) | Product embeddings |
| Cache | Redis 7+ | Hot recommendation results, rate-limit counters |
| Queue | BullMQ (Redis-backed) or AWS SQS | Webhook processing, batch ML jobs |
| ORM | Prisma or Drizzle | Schema migrations, type-safe queries |

---

## Infrastructure & DevOps

| Component | Technology |
|---|---|
| Hosting | Docker containers on Railway, Fly.io, or AWS ECS |
| CI/CD | GitHub Actions (lint, test, build, deploy) |
| Secrets | Environment variables; never commit `.env` |
| Token Encryption | AES-256-GCM or platform KMS for shop access tokens |
| Logging | Structured JSON logs (pino or winston) |
| Monitoring | Health endpoints + error tracking (Sentry optional) |

---

## Shopify API Versions

| API | Version Target |
|---|---|
| Admin GraphQL | Latest stable (pin in `shopify.app.toml`) |
| Webhooks | Same API version as Admin |
| Billing API | GraphQL Billing mutations |
| Customer Privacy API | Storefront consent integration |

### Required Scopes (minimum)
`read_products`, `read_orders`, `read_customers`, `read_inventory`, `read_content`

---

## Repository Structure (target)

```
/
├── apps/
│   ├── web/                 # Remix admin app + API routes
│   └── ml-worker/           # Python FastAPI or Node batch jobs
├── extensions/
│   └── reco-theme/          # Theme App Extension
├── packages/
│   └── database/            # Prisma schema + client
├── docs/                    # context, uiux, tech-stack, sprints
├── Docs/                    # SRS
├── docker-compose.yml       # Local Postgres + Redis
└── shopify.app.toml
```

---

## Code Conventions

- **TypeScript:** strict mode enabled; no `any` without justification
- **Naming:** `camelCase` for TS; `snake_case` for DB columns (Prisma `@map`)
- **Shop IDs:** Always filter queries by `shop_id` — enforce tenant isolation
- **Webhook handlers:** Idempotent; verify HMAC before processing
- **Errors:** Structured error responses; never leak internal stack traces to storefront
- **Tests:** Vitest for unit tests; Playwright optional for E2E
- **Commits:** Conventional commits (`feat:`, `fix:`, `chore:`)

---

## Performance Targets (enforce in code)

| Metric | Target |
|---|---|
| Recommendation API p95 | < 150ms |
| Tracking script size | < 15KB gzipped |
| LCP impact | < 100ms degradation |
| Catalog scale | 100,000 SKUs per shop |
| Serving uptime | 99.9% |

---

## Local Development

```bash
# Prerequisites: Node 20+, Docker, Shopify CLI 3.x
docker compose up -d          # Postgres + Redis
npm install
npm run db:migrate
shopify app dev               # Starts dev server + tunnel
```
