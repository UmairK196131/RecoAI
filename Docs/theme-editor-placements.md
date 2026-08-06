# Theme Editor Placement Guide (Sprint 13)

How to add RecoAI recommendation blocks on an Online Store 2.0 theme (verified against **Dawn**).

## Prerequisites

1. Install the RecoAI app and open **Online Store → Themes → Customize**.
2. Enable the **RecoAI Tracking** app embed (Theme settings → App embeds).
3. Set **RecoAI app URL** on each block to your app base URL (e.g. `https://your-tunnel.example.com`).

## Where to add each block

| Storefront page | Block name in Theme Editor | Template | Default strategy | Suggested location (Dawn) |
|---|---|---|---|---|
| Product | **RecoAI: You may also like** | `product` | Content similarity | Product information section, below description / after media gallery |
| Product | **RecoAI: Bought together** | `product` | Association rules | Near Add to cart, or directly under the buy buttons |
| Cart | **RecoAI: Add these too** | `cart` | Association rules | Main cart section, below line items / before checkout |
| Home | **RecoAI: Trending now** | `index` | Trending | New section below hero / featured collection |
| Home | **RecoAI: Picks for you** | `index` | Personalized blend | Mid-page section below trending |
| Collection | **RecoAI: Related products** | `collection` | Content similarity | Below the product grid |
| Search | **RecoAI: Search recommendations** | `search` | Trending | Search template; shows only when results ≤ threshold (default 4) |

A generic **RecoAI Recommendations** block is also available on any section if you need a manual placement type.

## Dawn walkthrough

1. **Product page (YMAL + FBT)**  
   Customize → Products → Default product → Add block → pick both RecoAI product blocks → Save.

2. **Cart**  
   Customize → Cart → Add block → **RecoAI: Add these too** → Save.  
   Cart drawer themes: add the block to the cart template; drawer support depends on whether the drawer uses the cart template sections.

3. **Home**  
   Customize → Home page → Add section → Apps → add **Trending now** and optionally **Picks for you** → Save.

4. **Collection**  
   Customize → Collections → Default collection → Add block → **Related products** → Save.

5. **Search (low / no results)**  
   Customize → Search → Add block → **Search recommendations**.  
   Test with a nonsense query (`zzzznomatch`) — the block should appear when results are at or below the threshold.

## Context passed to the API

| Placement | Context |
|---|---|
| Product | `product_id` |
| Cart | `cart_product_ids` (+ first cart item as seed `product_id`) |
| Home | `session_id` (for picks / re-ranking) |
| Collection | `collection_id` (seeds related products; excludes in-collection SKUs) |
| Search | `search_query` + only rendered when result count is low |

## Empty / error behavior

- API failure or zero recommendations → block stays hidden (no shopper-facing error).
- Responsive grid: 2 cols `<480px`, up to 3 cols `480–768px`, merchant columns `>768px`.

## Quick checklist

- [ ] App embed enabled  
- [ ] App URL set on each block  
- [ ] Product: YMAL + FBT visible  
- [ ] Cart: complementary products exclude cart items  
- [ ] Home: trending products show  
- [ ] Collection: related products show  
- [ ] Search: fallback shows on low/no results  
