# RecoAI — Shopify AI Recommendations App

AI-powered product recommendations for Shopify merchants. Built with Remix, Polaris, Prisma, PostgreSQL (pgvector), and Redis.

## Prerequisites

- [Node.js](https://nodejs.org/) 20.19+ or 22.12+
- [Docker](https://www.docker.com/) (for local Postgres + Redis)
- [Shopify CLI](https://shopify.dev/docs/apps/tools/cli) 3.x+

## Quick Start

### 1. Start infrastructure

```bash
docker compose up -d
```

This starts:
- **PostgreSQL 15** with pgvector on port `5432`
- **Redis 7** on port `6379`

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your Shopify app credentials from the [Partner Dashboard](https://partners.shopify.com/).

Link your app config (sets `client_id` in `shopify.app.toml`):

```bash
npm run shopify -- app config link
```

### 4. Run database migrations

```bash
npm run db:migrate
```

### 5. Start development server

```bash
npm run dev
```

Or directly via Shopify CLI from the repo root:

```bash
shopify app dev
```

Press `P` in the terminal to open the app in your development store.

## Repository Structure

```
├── apps/
│   └── web/                 # Remix admin app + API routes
├── extensions/
│   └── reco-theme/          # Theme App Extension (placeholder)
├── packages/
│   └── database/            # Prisma schema + client
├── docs/                    # Project documentation
├── Docs/                    # SRS and specifications
├── docker-compose.yml       # Local Postgres + Redis
└── shopify.app.toml         # Shopify app configuration
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start Shopify app dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript check |
| `npm run db:migrate` | Apply database migrations |
| `npm run db:migrate:dev` | Create/apply migrations in dev |
| `npm run db:generate` | Regenerate Prisma client |

## Documentation

- [Project Context](Docs/context.md)
- [Tech Stack](Docs/tech-stack.md)
- [Sprint Plan](Docs/sprints.md)
- [SRS](Docs/SRS_Shopify_AI_Recommendations_App.md)

## License

Private — all rights reserved.
