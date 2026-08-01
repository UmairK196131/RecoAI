# Software Requirements Specification (SRS)

## AI-Powered Product Recommendations — Shopify App

**Document Version:** 1.0
**Date:** August 1, 2026
**Status:** Draft

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Overall Description](#2-overall-description)
3. [System Architecture](#3-system-architecture)
4. [Functional Requirements](#4-functional-requirements)
5. [AI Recommendation Engine](#5-ai-recommendation-engine)
6. [Data Model](#6-data-model)
7. [External Interface Requirements](#7-external-interface-requirements)
8. [Non-Functional Requirements](#8-non-functional-requirements)
9. [Shopify Platform Requirements](#9-shopify-platform-requirements)
10. [Billing & Monetization](#10-billing--monetization)
11. [Security & Compliance](#11-security--compliance)
12. [Assumptions, Dependencies & Constraints](#12-assumptions-dependencies--constraints)
13. [Appendix](#13-appendix)

---

## 1. Introduction

### 1.1 Purpose

This document specifies the requirements for a Shopify application that provides **AI-powered product recommendations** to merchants and their storefront customers. It is intended for use by developers, QA engineers, and product stakeholders to guide design, implementation, and testing.

### 1.2 Scope

The app ("RecoAI" — working name) will:

- Analyze a merchant's product catalog, order history, and customer browsing/purchase behavior.
- Generate personalized, AI-driven product recommendations (e.g., "You may also like," "Frequently bought together," "Similar products," "Recently viewed").
- Allow merchants to embed recommendation blocks on storefront pages (product page, cart, checkout extension, home page, collection page) via the Shopify Theme App Extension framework.
- Provide an embedded admin dashboard (Shopify Admin UI, built with Polaris + App Bridge) for configuration, analytics, and A/B testing of recommendation placements.
- Operate as a public or custom Shopify app distributed via the Shopify App Store, billed through the Shopify Billing API.

### 1.3 Out of Scope (v1)

- Native mobile SDKs (iOS/Android) outside of Shopify's mobile buyer app surfaces.
- Email/SMS marketing recommendation injections (may be a future phase via Shopify Flow/Klaviyo integration).
- Multi-platform support (Magento, WooCommerce, etc.) — this is Shopify-only.
- Custom-trained, merchant-specific foundation models (v1 uses a shared model with per-merchant fine-tuning signals, not dedicated model training per merchant).

### 1.4 Definitions, Acronyms, Abbreviations

| Term | Definition |
|---|---|
| SRS | Software Requirements Specification |
| App Bridge | Shopify's JS library for embedding apps in Shopify Admin |
| Polaris | Shopify's React component/design system for admin UI |
| Theme App Extension (TAE) | Shopify mechanism for injecting app UI blocks into storefront themes without editing theme code directly |
| Storefront API | Shopify's GraphQL API for reading storefront/catalog data from custom or headless storefronts |
| Admin API | Shopify's GraphQL/REST API for merchant/store data (products, orders, customers) |
| Webhook | Shopify's event-driven HTTP callback mechanism |
| GDPR Webhooks | Mandatory Shopify compliance webhooks (customer data request, redact, shop redact) |
| CTR | Click-Through Rate |
| CVR | Conversion Rate |
| Embedding | Vector representation of a product/user used for similarity-based ML recommendations |
| RAG | Retrieval-Augmented Generation (if LLM-based rationale/copy generation is used) |

### 1.5 References

- Shopify Admin API (GraphQL) Documentation
- Shopify Storefront API Documentation
- Shopify App Bridge & Polaris Documentation
- Shopify Theme App Extensions Documentation
- Shopify Billing API Documentation
- Shopify Webhooks & Mandatory Compliance Topics
- Shopify App Store Review Requirements

---

## 2. Overall Description

### 2.1 Product Perspective

RecoAI is a **standalone Shopify app** that integrates with a merchant's existing Shopify store. It does not replace the storefront theme but augments it via embedded blocks and an admin control panel. It is a multi-tenant SaaS system: one backend serves many Shopify stores (shops), with strict data isolation per shop.

### 2.2 Product Functions (Summary)

- Catalog ingestion & sync (products, variants, collections, inventory, images, metafields).
- Behavioral event tracking (product views, add-to-cart, purchases, search queries) via a lightweight storefront pixel/script.
- AI recommendation generation across multiple strategies (collaborative filtering, content-based/embedding similarity, "bought together" association rules, trending/best-sellers fallback).
- Merchant-configurable recommendation widgets (placement, styling, number of items, strategy per placement).
- Analytics dashboard (impressions, clicks, CTR, attributed revenue, conversion lift).
- A/B testing of recommendation strategies/placements.
- Billing tiers based on store traffic / order volume / feature access.

### 2.3 User Classes and Characteristics

| User Class | Description | Technical Proficiency |
|---|---|---|
| Merchant Admin | Store owner/staff who installs and configures the app | Low–Medium |
| Storefront Shopper (End Customer) | Browses the store and sees recommendation widgets | N/A (passive consumer) |
| App Support/Success Team | Internal team troubleshooting merchant issues | High |
| System Administrator (App Vendor) | Manages backend infra, model retraining, monitoring | High |

### 2.4 Operating Environment

- **Admin UI:** Embedded in Shopify Admin (iframe via App Bridge), runs in merchant's browser (Chrome, Safari, Firefox, Edge — latest 2 versions).
- **Storefront Widget:** Injected via Theme App Extension / App Embed Block, runs client-side in the shopper's browser across all Shopify-supported themes (Online Store 2.0).
- **Backend:** Cloud-hosted (containerized), region-appropriate for latency and data residency.
- **Shopify Plans Supported:** Basic, Shopify, Advanced, Plus (Shopify Plus may require additional checkout extensibility handling).

### 2.5 Design & Implementation Constraints

- Must comply with Shopify App Store review guidelines (performance budget, no theme code duplication outside TAE, mandatory GDPR webhooks).
- Must use Online Store 2.0 Theme App Extensions — no direct `theme.liquid` injection for new installs.
- Must use OAuth 2.0 for store installation/auth per Shopify's app authentication flow.
- Storefront script/widget must not materially degrade Core Web Vitals (LCP, CLS) — async/deferred loading required.
- Must support GraphQL Admin API (REST Admin API is legacy/deprecated for new endpoints as of recent Shopify API versions).

### 2.6 Assumptions & Dependencies

- Merchant has an active Shopify store with product catalog data.
- Sufficient historical order/behavioral data exists for collaborative filtering to outperform the fallback (rule-based/trending) strategy — cold-start handling is required.
- Shopify API rate limits (GraphQL cost-based throttling) are respected via a job-queue/backoff system.

---

## 3. System Architecture

### 3.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          Shopify Platform                        │
│  ┌───────────────┐   ┌────────────────┐   ┌────────────────┐    │
│  │ Shopify Admin  │   │  Storefront     │   │   Webhooks /    │    │
│  │ (App Bridge    │   │  Theme (TAE /   │   │   Admin GraphQL │    │
│  │  embedded UI)  │   │  App Embed)     │   │   API           │    │
│  └───────┬───────┘   └────────┬────────┘   └────────┬────────┘    │
└──────────┼────────────────────┼─────────────────────┼─────────────┘
           │                    │                      │
           ▼                    ▼                      ▼
   ┌───────────────┐   ┌────────────────┐    ┌──────────────────┐
   │  App Backend   │   │  Recommendation │    │  Sync/Webhook     │
   │  API (Admin    │◄─►│  Serving API    │    │  Ingestion Worker │
   │  config, auth) │   │  (low-latency)  │    │  (queue-based)    │
   └───────┬───────┘   └────────┬────────┘    └────────┬──────────┘
           │                    │                       │
           ▼                    ▼                       ▼
   ┌────────────────────────────────────────────────────────────┐
   │                     Data Layer                               │
   │  Primary DB (shop config, catalog cache, users)              │
   │  Event Store (behavioral events, clickstream)                │
   │  Vector Store (product/user embeddings)                      │
   │  Cache Layer (Redis — hot recommendation results)            │
   └────────────────────────────────────────────────────────────┘
           │
           ▼
   ┌────────────────────────────────────────────────────────────┐
   │            ML Pipeline (offline / near-real-time)             │
   │  Feature Engineering → Model Training/Update → Model Registry │
   │  (Collaborative Filtering, Embedding Similarity, Assoc. Rules)│
   └────────────────────────────────────────────────────────────┘
```

### 3.2 Component Overview

| Component | Responsibility |
|---|---|
| Admin App (Frontend) | Polaris + App Bridge React app embedded in Shopify Admin for configuration/analytics |
| App Backend API | Handles OAuth, merchant settings, billing, serves Admin UI data |
| Recommendation Serving API | Low-latency (<150ms p95) endpoint returning ranked product recommendations |
| Sync/Webhook Worker | Consumes Shopify webhooks (products/update, orders/create, etc.) and syncs catalog/order data |
| Storefront Pixel/Widget | Lightweight JS injected via Theme App Extension; tracks events and renders recommendation blocks |
| ML Pipeline | Batch + incremental training of recommendation models; writes to Vector Store / Model Registry |
| Data Layer | Persistent storage: relational DB, event store, vector DB, cache |

### 3.3 Technology Considerations (Non-Binding Reference Stack)

- **Backend:** Node.js/TypeScript (Shopify's official app template ecosystem) or equivalent; GraphQL Admin API client.
- **Admin Frontend:** React + Shopify Polaris + App Bridge.
- **Storefront Extension:** Theme App Extension (Liquid blocks) + vanilla JS/Web Components for the widget to minimize bundle size.
- **ML Serving:** Python-based microservice (e.g., FastAPI) or embedded inference via a hosted vector similarity search engine.
- **Data Store:** PostgreSQL (relational), Redis (cache), a vector database (e.g., pgvector or a managed vector DB) for embeddings.
- **Queue:** Managed message queue for webhook processing and async model updates.
- **Hosting:** Container-orchestrated cloud deployment with autoscaling.

---

## 4. Functional Requirements

Each requirement is tagged with a unique ID for traceability: `FR-<Module>-<Number>`.

### 4.1 App Installation & Authentication (FR-AUTH)

| ID | Requirement |
|---|---|
| FR-AUTH-01 | The system shall implement Shopify OAuth 2.0 authorization code flow for app installation. |
| FR-AUTH-02 | The system shall request the minimum necessary access scopes (e.g., `read_products`, `read_orders`, `read_customers`, `write_script_tags` or TAE equivalents). |
| FR-AUTH-03 | The system shall store shop access tokens encrypted at rest, scoped per shop. |
| FR-AUTH-04 | The system shall support session token authentication for embedded Admin UI requests per Shopify's embedded app auth strategy. |
| FR-AUTH-05 | The system shall handle app uninstallation via the `app/uninstalled` webhook and purge/mark-for-deletion shop data per retention policy. |

### 4.2 Catalog & Order Sync (FR-SYNC)

| ID | Requirement |
|---|---|
| FR-SYNC-01 | The system shall perform an initial full catalog sync (products, variants, images, collections, metafields, inventory levels) upon app installation. |
| FR-SYNC-02 | The system shall subscribe to `products/create`, `products/update`, `products/delete`, `collections/update`, `inventory_levels/update` webhooks to keep the catalog cache current. |
| FR-SYNC-03 | The system shall subscribe to `orders/create`, `orders/updated`, `orders/paid` webhooks to feed order/purchase data into the recommendation pipeline. |
| FR-SYNC-04 | The system shall subscribe to `customers/create`, `customers/update`, and mandatory GDPR webhooks (`customers/data_request`, `customers/redact`, `shop/redact`). |
| FR-SYNC-05 | The system shall reconcile data via periodic full re-sync (e.g., nightly) to correct any missed/failed webhook deliveries. |
| FR-SYNC-06 | The system shall respect Shopify's GraphQL Admin API rate limits using cost-aware throttling and exponential backoff/retry. |

### 4.3 Behavioral Event Tracking (FR-EVT)

| ID | Requirement |
|---|---|
| FR-EVT-01 | The system shall inject a lightweight, asynchronously-loaded tracking script via Theme App Extension (App Embed Block) to capture storefront events. |
| FR-EVT-02 | The system shall capture the following event types at minimum: `product_view`, `collection_view`, `search`, `add_to_cart`, `remove_from_cart`, `checkout_start`, `purchase`, `recommendation_impression`, `recommendation_click`. |
| FR-EVT-03 | The system shall associate events with an anonymous session ID for guest shoppers and a persistent customer ID for logged-in/known customers, without violating privacy regulations. |
| FR-EVT-04 | The system shall batch and asynchronously transmit events to avoid blocking page rendering. |
| FR-EVT-05 | The system shall respect the shopper's cookie/tracking consent status (e.g., via Shopify's Customer Privacy API / consent banner integration) before storing personally identifiable behavioral data. |

### 4.4 Recommendation Generation & Serving (FR-REC)

| ID | Requirement |
|---|---|
| FR-REC-01 | The system shall generate recommendations using multiple strategies: (a) Collaborative Filtering ("customers who bought X also bought Y"), (b) Content/Embedding Similarity ("similar products"), (c) Association Rules ("frequently bought together"), (d) Trending/Best-Sellers (fallback/cold-start), (e) Recently Viewed (session-based, client-assisted). |
| FR-REC-02 | The system shall serve recommendations via a low-latency API (target p95 < 150ms) callable from the storefront widget. |
| FR-REC-03 | The system shall apply merchant-defined business rules as post-filters (e.g., exclude out-of-stock items, exclude specific collections, price range constraints, exclude products already in cart). |
| FR-REC-04 | The system shall provide a cold-start fallback (trending/best-seller based) when insufficient behavioral/order data exists for a product or shop. |
| FR-REC-05 | The system shall support the following placement types: Product Page ("You may also like," "Frequently bought together"), Cart Page/Drawer ("Add these too"), Home Page ("Trending now," "Picks for you"), Collection Page, Post-Purchase/Order Status Page (where supported by Shopify checkout extensibility), and Search Results (no/low results recommendations). |
| FR-REC-06 | The system shall cache recommendation results per product/shop with a configurable TTL to reduce serving latency and backend load. |
| FR-REC-07 | The system shall support real-time re-ranking based on current session behavior (e.g., items viewed in the current session) where feasible. |

### 4.5 Admin Configuration Dashboard (FR-CFG)

| ID | Requirement |
|---|---|
| FR-CFG-01 | The system shall provide an embedded Admin UI (Polaris/App Bridge) for merchants to enable/disable recommendation placements. |
| FR-CFG-02 | The system shall allow merchants to configure, per placement: recommendation strategy, number of items shown, title/heading text, and basic style options (grid vs. carousel, columns). |
| FR-CFG-03 | The system shall provide a live preview of widget appearance before publishing changes to the live storefront. |
| FR-CFG-04 | The system shall allow merchants to define exclusion rules (specific products, collections, tags) that should never be recommended. |
| FR-CFG-05 | The system shall allow merchants to manually pin/curate specific product recommendations to override AI output for specific products (merchandising override). |
| FR-CFG-06 | The system shall provide onboarding guidance (setup checklist/wizard) for first-time app configuration. |

### 4.6 Analytics & Reporting (FR-ANL)

| ID | Requirement |
|---|---|
| FR-ANL-01 | The system shall track and display impressions, clicks, CTR, add-to-cart rate, and attributed revenue per recommendation placement. |
| FR-ANL-02 | The system shall provide a dashboard summarizing overall app performance (total attributed revenue, total clicks, top-performing products via recommendations) over selectable date ranges. |
| FR-ANL-03 | The system shall support A/B testing: splitting shopper sessions between two or more recommendation strategies/placements and reporting comparative performance. |
| FR-ANL-04 | The system shall allow export of analytics data (CSV) for merchant reporting needs. |

### 4.7 Billing (FR-BILL)

| ID | Requirement |
|---|---|
| FR-BILL-01 | The system shall integrate with the Shopify Billing API to manage subscription plans. |
| FR-BILL-02 | The system shall support tiered pricing (e.g., Free/Starter, Growth, Pro/Plus) with feature and usage-volume gating (order volume or monthly tracked sessions). |
| FR-BILL-03 | The system shall support a free trial period configurable per plan. |
| FR-BILL-04 | The system shall handle plan upgrade/downgrade and proration per Shopify Billing API semantics. |
| FR-BILL-05 | The system shall gracefully degrade (e.g., revert to fallback/trending-only recommendations) if a merchant's subscription lapses or usage cap is exceeded, rather than fully breaking the storefront. |

---

## 5. AI Recommendation Engine

### 5.1 Recommendation Strategies

| Strategy | Description | Primary Use Case | Data Required |
|---|---|---|---|
| Collaborative Filtering (CF) | Recommends items based on co-purchase/co-interaction patterns across customers | "Customers also bought" | Order history, sufficient volume |
| Content-Based / Embedding Similarity | Vector embeddings of product title, description, images, tags/category used to find nearest neighbors | "Similar products," visually/semantically similar cold-start items | Product catalog metadata (works even with low order volume) |
| Association Rule Mining | Market-basket analysis (e.g., Apriori/FP-Growth style) to find item sets frequently purchased together | "Frequently bought together" bundles | Order line-item history |
| Trending/Best-Sellers | Rule-based ranking by recent sales velocity/views | Cold-start fallback, homepage | Recent order/event volume |
| Session-Based/Sequential | Recommends based on the shopper's current session sequence of views | "Recently viewed," in-session re-ranking | Real-time event stream |
| Personalized Ranking | Combines signals (CF + content + recency + merchant rules) into a single ranked list per shopper | All placements (blended strategy) | All of the above |

### 5.2 Cold-Start Handling

- **New Store (no order history):** Falls back to content-based similarity + trending (using view counts if available) until a minimum order threshold (configurable, e.g., 50–100 orders) is reached.
- **New Product (no interaction history):** Uses content/embedding similarity against the existing catalog immediately upon sync.
- **New/Anonymous Shopper (no history):** Uses trending/best-seller and content-based recommendations based on currently-viewed product until session behavior accumulates.

### 5.3 Model Update Cadence

| Component | Update Frequency |
|---|---|
| Product embeddings | On product create/update webhook (near real-time) + nightly full re-embedding sanity pass |
| Collaborative filtering model | Incremental daily batch retraining; full retrain weekly |
| Association rules (basket analysis) | Daily batch job |
| Trending scores | Rolling window recalculation (e.g., every few hours) |
| Session/real-time re-ranking | Computed at request-time using live session events (no offline training needed) |

### 5.4 AI/LLM Usage (Optional Enhancement Layer)

- An LLM may optionally be used to generate human-readable rationale/copy for recommendation section headings (e.g., dynamically generated "Because you viewed the Blue Wool Scarf, you might like…") — this is a text-generation aid, not the core ranking mechanism.
- Any use of a third-party LLM API for this purpose shall not transmit personally identifiable shopper information; only anonymized product metadata shall be sent.
- The core ranking/recommendation logic (Section 5.1) relies on statistical ML/embedding methods rather than LLM inference, to guarantee the low-latency (<150ms) serving requirement.

### 5.5 Evaluation Metrics (Offline)

- Precision@K / Recall@K for held-out purchase prediction.
- Coverage (percentage of catalog that receives at least one recommendation).
- Diversity (avoiding over-concentration on best-sellers only).
- Novelty (not merely recommending already-popular items).

---

## 6. Data Model

### 6.1 Core Entities (Conceptual)

```
Shop
 ├── id, shopify_domain, access_token (encrypted), plan_tier, installed_at, status

Product (cached from Shopify)
 ├── id, shopify_product_id, shop_id, title, description, tags, product_type,
 │   vendor, price_range, image_urls, status (active/draft), inventory_status
 └── ProductVariant
      ├── id, shopify_variant_id, product_id, price, sku, inventory_qty

Collection
 ├── id, shopify_collection_id, shop_id, title, product_ids[]

Customer (minimal, privacy-conscious)
 ├── id, shopify_customer_id (nullable for guests), shop_id, session_ids[]

BehavioralEvent
 ├── id, shop_id, session_id, customer_id (nullable), event_type,
 │   product_id (nullable), timestamp, metadata (JSON)

Order (cached, minimal fields needed)
 ├── id, shopify_order_id, shop_id, customer_id (nullable), line_items[],
 │   total_price, created_at

RecommendationPlacement (merchant config)
 ├── id, shop_id, placement_type, strategy, enabled, max_items,
 │   title_text, style_config (JSON), exclusion_rules (JSON)

RecommendationLog (analytics)
 ├── id, shop_id, placement_id, session_id, shown_product_ids[],
 │   clicked_product_id (nullable), impression_at, click_at (nullable),
 │   converted (boolean), attributed_order_id (nullable)

ProductEmbedding (vector store)
 ├── product_id, shop_id, embedding_vector, model_version, updated_at

ABTestExperiment
 ├── id, shop_id, placement_id, variant_configs[], start_date, end_date, status
```

### 6.2 Data Retention

- Behavioral event raw logs: retained for a configurable window (e.g., 13 months) to support seasonal analysis, then aggregated/anonymized.
- On app uninstall: shop configuration and cached catalog data purged within 48 hours; behavioral data purged per GDPR redact webhook obligations (within 30 days per Shopify's requirement, sooner if requested).

---

## 7. External Interface Requirements

### 7.1 Shopify Admin API (GraphQL)

- Used for: catalog sync, order data retrieval, customer data retrieval, metafield read/write (for storing app-specific product metadata if needed), Billing API mutations.
- Required scopes (minimum, to be finalized): `read_products`, `read_orders`, `read_customers`, `read_inventory`, `read_content` (if using content-based signals from product descriptions), `write_own_subscription_contracts` (only if relevant), plus scopes required for Theme App Extension configuration.

### 7.2 Shopify Storefront API / Theme App Extensions

- Theme App Extension blocks (App Embed + App Blocks) for injecting recommendation widgets into merchant themes without code edits.
- Storefront-side widget fetches recommendation data from the app's Recommendation Serving API (not directly from Shopify Storefront API) to keep AI logic server-side.

### 7.3 Webhooks (Inbound to App)

| Webhook Topic | Purpose |
|---|---|
| `app/uninstalled` | Trigger data cleanup |
| `products/create`, `products/update`, `products/delete` | Catalog sync |
| `collections/update` | Collection sync |
| `inventory_levels/update` | Stock-aware filtering |
| `orders/create`, `orders/updated`, `orders/paid` | Purchase signal ingestion |
| `customers/data_request`, `customers/redact`, `shop/redact` | Mandatory GDPR compliance |
| `app_subscriptions/update` | Billing status changes |

### 7.4 Admin UI Interfaces

- Embedded via **App Bridge** inside Shopify Admin, styled with **Polaris** components for visual/behavioral consistency with native Shopify Admin.
- Navigation: standard embedded app nav (Dashboard, Placements, Analytics, A/B Tests, Settings, Billing).

### 7.5 Storefront Widget Interface

- Rendered as a themeable block (respects theme's CSS variables/fonts where possible via TAE settings schema exposed to merchants in the Theme Editor).
- Exposes merchant-configurable settings directly in the Shopify Theme Editor (heading text, number of products, layout) in addition to the app's own Admin UI.

---

## 8. Non-Functional Requirements

### 8.1 Performance

| ID | Requirement |
|---|---|
| NFR-PERF-01 | Recommendation Serving API shall respond within 150ms at p95 under normal load. |
| NFR-PERF-02 | Storefront tracking script shall be < 15KB gzipped and load asynchronously without blocking page render. |
| NFR-PERF-03 | The app shall not degrade the storefront's Largest Contentful Paint (LCP) by more than 100ms on average. |
| NFR-PERF-04 | The system shall support catalogs of up to 100,000 SKUs per shop without degradation in sync or serving performance. |

### 8.2 Scalability

| ID | Requirement |
|---|---|
| NFR-SCALE-01 | The system shall support multi-tenant operation for at least 10,000 concurrent installed shops at v1 launch scale target. |
| NFR-SCALE-02 | The recommendation serving layer shall horizontally scale to handle traffic spikes (e.g., flash sales, holiday peaks such as BFCM). |

### 8.3 Availability & Reliability

| ID | Requirement |
|---|---|
| NFR-AVAIL-01 | The Recommendation Serving API shall maintain 99.9% uptime. |
| NFR-AVAIL-02 | If the recommendation backend is unavailable, the storefront widget shall fail gracefully (hide the block or show a cached/static fallback) rather than break the page. |
| NFR-AVAIL-03 | Webhook processing shall be idempotent and support retry/backoff on transient failures. |

### 8.4 Security

| ID | Requirement |
|---|---|
| NFR-SEC-01 | All data in transit shall use TLS 1.2+. |
| NFR-SEC-02 | Shop access tokens and any PII shall be encrypted at rest. |
| NFR-SEC-03 | The app shall validate Shopify webhook HMAC signatures on every inbound webhook. |
| NFR-SEC-04 | The app shall verify App Bridge session tokens on every embedded Admin API request. |
| NFR-SEC-05 | The system shall enforce strict per-shop data isolation (no cross-tenant data leakage) at the database/query layer. |

### 8.5 Usability

| ID | Requirement |
|---|---|
| NFR-USE-01 | The Admin UI shall follow Shopify Polaris design guidelines for visual/interaction consistency with native Admin. |
| NFR-USE-02 | First-time setup (install to first live recommendation on storefront) shall be achievable in under 10 minutes without developer assistance. |

### 8.6 Maintainability

| ID | Requirement |
|---|---|
| NFR-MAINT-01 | The system shall log structured events for observability (sync failures, serving errors, model training status) with alerting on critical failures. |
| NFR-MAINT-02 | The ML pipeline shall version recommendation models, allowing rollback to a previous model version if a regression is detected. |

---

## 9. Shopify Platform Requirements

### 9.1 App Store Listing Compliance

- Must pass Shopify App Store automated and manual review (performance, security, GDPR webhooks, no deceptive UI, accurate listing content).
- Must provide a public privacy policy URL and clear data usage disclosure.
- Must support both "Add to theme" via Theme App Extension for Online Store 2.0 themes (no legacy `ScriptTag`/asset-injection approach for new installs).

### 9.2 Plan/Scope Tiering

- Free/Starter tier: limited placements (e.g., 1–2 widget types), trending + content-based strategies only, capped monthly tracked sessions.
- Growth tier: all placement types, collaborative filtering + association rules unlocked, standard analytics.
- Pro/Plus tier: A/B testing, merchandising overrides, priority support, higher/no session caps, advanced analytics export.

### 9.3 Shopify Plus Considerations

- Checkout Extensibility: post-purchase/thank-you page recommendations require Shopify Plus checkout extension APIs (Checkout UI Extensions) rather than TAE, and shall be treated as an optional advanced feature gated to Plus merchants.

---

## 10. Billing & Monetization

| ID | Requirement |
|---|---|
| BILL-01 | Pricing shall be usage-tiered based on monthly tracked storefront sessions and/or order volume, consistent with Shopify App Store billing norms. |
| BILL-02 | A free trial (e.g., 7–14 days) shall be offered before first charge. |
| BILL-03 | All charges shall be processed exclusively through the Shopify Billing API (no external payment collection), per Shopify App Store policy. |
| BILL-04 | Usage overages beyond a plan's cap shall either soft-throttle (fallback-only recommendations) or prompt an upgrade notice, per merchant configuration/consent — no silent overage charges without Shopify Billing API usage-charge confirmation. |

---

## 11. Security & Compliance

### 11.1 Data Privacy

- Compliance with **GDPR** and **CCPA** for shopper behavioral data.
- Integration with Shopify's **Customer Privacy API** to respect cookie/tracking consent banners before setting tracking cookies or storing identifiable behavioral data.
- Support for the three mandatory Shopify GDPR webhooks: `customers/data_request`, `customers/redact`, `shop/redact`.

### 11.2 Data Minimization

- The system shall store the minimum behavioral/PII data necessary for recommendation generation; where possible, favor aggregated/anonymized signals over raw PII.

### 11.3 Access Control

- Role-based access within the Admin UI is not required for v1 (single merchant-admin user context, inherited from Shopify staff permissions), but the design shall not preclude future role-based restrictions (e.g., limiting billing changes to store owner).

---

## 12. Assumptions, Dependencies & Constraints

### 12.1 Assumptions

- Merchants are using Online Store 2.0-compatible themes (required for Theme App Extensions).
- Merchants have basic product catalog data (titles, images, categories) populated — poor catalog data quality will degrade content-based recommendation quality.

### 12.2 Dependencies

- Shopify platform API availability and stability (Admin API, Storefront API, Billing API, Webhooks).
- Third-party vector database / ML infrastructure availability if using managed services.

### 12.3 Constraints

- Must operate within Shopify's GraphQL Admin API rate limits (cost-based throttling).
- Must comply with Shopify App Store review requirements at all times, including for updates.
- Recommendation Serving API latency budget constrains the choice of real-time inference techniques (favors precomputed embeddings/cached rankings over heavy real-time LLM inference for core ranking).

---

## 13. Appendix

### 13.1 Sample Recommendation API Response (Illustrative)

```json
{
  "placement": "product_page_you_may_also_like",
  "product_id": "gid://shopify/Product/1234567890",
  "strategy_used": "hybrid_cf_content",
  "recommendations": [
    {
      "product_id": "gid://shopify/Product/2233445566",
      "title": "Wool Blend Scarf",
      "score": 0.87,
      "reason_tags": ["frequently_bought_together"]
    },
    {
      "product_id": "gid://shopify/Product/3344556677",
      "title": "Leather Gloves",
      "score": 0.79,
      "reason_tags": ["similar_category"]
    }
  ],
  "generated_at": "2026-08-01T10:00:00Z"
}
```

### 13.2 Traceability Matrix (Excerpt)

| Requirement ID | Related Section | Priority |
|---|---|---|
| FR-REC-01 | 5.1 | Must-Have |
| FR-REC-04 | 5.2 | Must-Have |
| FR-EVT-05 | 11.1 | Must-Have |
| FR-BILL-01 | 10 | Must-Have |
| NFR-PERF-01 | 8.1 | Must-Have |
| FR-ANL-03 | 4.6 | Should-Have (v1.1) |
| FR-CFG-05 | 4.5 | Should-Have (v1.1) |

### 13.3 Priority Legend

- **Must-Have:** Required for v1 launch / App Store approval.
- **Should-Have:** Targeted for v1.1 shortly after launch.
- **Could-Have:** Backlog / future consideration.

---

**End of Document**
