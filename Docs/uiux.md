# RecoAI — UI/UX Design Requirements

Design all interfaces to match Shopify native patterns. Merchants should not feel they left Shopify Admin.

---

## Design Principles

1. **Shopify-native** — Polaris components, App Bridge navigation, no custom chrome
2. **Merchant-first** — Plain language; no ML jargon in UI labels
3. **Fast setup** — Install to live widget in < 10 minutes
4. **Performance-safe** — Storefront widgets must not harm Core Web Vitals
5. **Accessible** — WCAG 2.1 AA for admin UI; keyboard-navigable widgets

---

## Admin UI — Navigation Structure

Embedded app nav (App Bridge):

| Nav Item | Route | Purpose |
|---|---|---|
| Dashboard | `/app` | Overview metrics, setup status |
| Placements | `/app/placements` | Configure recommendation widgets |
| Analytics | `/app/analytics` | Performance charts and tables |
| Settings | `/app/settings` | Exclusions, general config |
| Billing | `/app/billing` | Plan selection, usage, upgrade |

---

## Admin UI — Page Specs

### Dashboard (`/app`)
- **Setup checklist card** (if incomplete): Install extension → Enable tracking → Configure first placement → View on storefront
- **KPI cards:** Attributed revenue (30d), Total clicks, CTR, Active placements
- **Quick actions:** "Add placement", "View analytics"
- **Empty state:** Illustration + "Get started" CTA linking to onboarding

### Placements List (`/app/placements`)
- **Data table** (Polaris IndexTable): Placement name, type, strategy, status (enabled/disabled), items shown
- **Row actions:** Edit, Enable/Disable, Preview
- **Primary action:** "Create placement" button
- **Empty state:** "No placements yet" + create CTA

### Placement Editor (`/app/placements/:id`)
- **Layout:** Two-column on desktop — config form (left) + live preview (right)
- **Form fields:**
  - Placement type (dropdown): Product page, Cart, Home, Collection, Search
  - Strategy (dropdown): Similar products, Frequently bought together, Trending, Personalized blend, Recently viewed
  - Number of items (1–12, slider or number input)
  - Heading text (text input, e.g., "You may also like")
  - Layout: Grid vs Carousel toggle
  - Columns (grid only): 2, 3, or 4
  - Enable toggle
- **Preview panel:** Mock product cards showing sample recommendations with selected layout
- **Save bar:** Polaris ContextualSaveBar pattern

### Exclusion Rules (`/app/settings/exclusions`)
- **Multi-select:** Products, Collections, Tags to exclude from all recommendations
- **Search-as-you-type** product/collection picker (Polaris ResourceList pattern)

### Analytics (`/app/analytics`)
- **Date range picker:** Last 7d, 30d, 90d, custom
- **Summary cards:** Impressions, Clicks, CTR, Add-to-cart rate, Attributed revenue
- **Charts:** Line chart (clicks/impressions over time), bar chart (top products by clicks)
- **Table:** Per-placement breakdown
- **Export button:** Download CSV

### Onboarding Wizard (first visit)
- **Step 1:** Welcome + what RecoAI does (3 bullet points)
- **Step 2:** "Enable app embed" — deep link to Theme Editor app embed activation
- **Step 3:** Create first placement (simplified form: type + strategy)
- **Step 4:** Success — "View on your store" link
- **Progress indicator:** Polaris ProgressBar or stepped nav

### Billing (`/app/billing`)
- **Plan cards:** Free/Starter, Growth, Pro — feature comparison table
- **Current plan badge** + usage meter (sessions tracked this month)
- **Upgrade/Downgrade** buttons → Shopify Billing confirmation
- **Trial banner** if applicable

---

## Admin UI — Polaris Component Map

| UI Element | Polaris Component |
|---|---|
| Page layout | `Page`, `Layout`, `Layout.Section` |
| Navigation | App Bridge `NavMenu` |
| Tables | `IndexTable`, `DataTable` |
| Forms | `Form`, `TextField`, `Select`, `Checkbox`, `RangeSlider` |
| Feedback | `Banner`, `Toast`, `Badge` |
| Loading | `Spinner`, `SkeletonPage` |
| Modals | `Modal` for confirmations |
| Empty states | `EmptyState` |
| Cards | `Card`, `BlockStack`, `InlineStack` |

### Admin Color & Typography
- Use Polaris design tokens only — no custom color palette
- Headings: Polaris default typography scale
- Status colors: Polaris `success`, `warning`, `critical` tones

---

## Storefront Widget — Visual Specs

### Recommendation Block (App Block)
- **Container:** Full-width within theme section; respects theme max-width
- **Heading:** Merchant-configurable H2/H3; matches theme heading font via CSS inheritance
- **Product card:**
  - Product image (aspect-ratio 1:1, lazy-loaded)
  - Product title (truncate 2 lines)
  - Price (formatted per Shopify money format)
  - Optional: "Add to cart" quick-add button (theme-dependent)
- **Layouts:**
  - **Grid:** CSS Grid, responsive — 2 cols mobile, 3–4 cols desktop
  - **Carousel:** Horizontal scroll with prev/next arrows; snap scroll on mobile
- **Spacing:** 16px gap between cards; 24px margin below heading

### Tracking Embed (App Embed Block)
- No visible UI — script injection only
- Must not render any DOM elements

### Theme Editor Settings Schema
Expose in TAE `settings_schema`:
- Heading text (text)
- Number of products (range 1–12)
- Layout (select: grid / carousel)
- Columns (select: 2 / 3 / 4) — grid only
- Show price (checkbox)
- Show add-to-cart (checkbox)

### Storefront CSS Strategy
- Use BEM-style prefixed classes: `recoai-block`, `recoai-card`, `recoai-carousel`
- Minimal scoped CSS in extension asset; avoid `!important`
- Support dark themes via `color-scheme` and transparent backgrounds
- Images: `loading="lazy"`, explicit `width`/`height` to prevent CLS

---

## Storefront — Error & Empty States

| State | Behavior |
|---|---|
| API timeout/error | Hide block entirely (no error message to shoppers) |
| Zero recommendations | Hide block or show nothing |
| Partial results | Show available items; do not pad with placeholders |
| Consent denied | Tracking silent; recommendations still serve (non-PII) |

---

## Responsive Breakpoints (Storefront)

| Breakpoint | Grid Columns |
|---|---|
| < 480px | 2 |
| 480–768px | 2–3 |
| > 768px | Merchant-configured (2–4) |

---

## Accessibility

- Admin: Polaris defaults (ARIA labels on icon buttons, focus management in modals)
- Storefront: Carousel arrows keyboard-accessible; product links have descriptive `aria-label`; images have `alt` from product title
- Color contrast: Minimum 4.5:1 for text on cards

---

## Copy & Tone

- **Voice:** Helpful, concise, confidence-building
- **Avoid:** "AI magic", "machine learning", technical jargon
- **Use:** "Recommendations", "Similar products", "Trending now", "Customers also bought"
- **Error messages (admin):** Actionable — "Could not sync products. Retry sync or contact support."

---

## Assets

- App icon: 1024×1024 PNG (Shopify App Store)
- Admin empty state illustrations: Polaris `EmptyState` default or simple SVG
- No custom icon font — use Polaris icons (`Icon` component)
