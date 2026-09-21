## TikTok OAuth route status

`server/marketplace/tiktokRoutes.ts` provides dependency-injected Express handlers for start, callback, and safe connection status. The handlers are intentionally separate from `server.ts` so they can be mounted without changing the existing Amazon/eBay routes.

The current token and OAuth-state stores remain process-local. **NON-PRODUCTION TOKEN STORAGE — PROCESS LOCAL**.

TikTok endpoint URLs, OAuth parameter names, shop binding, `shop_cipher`, signatures, and business API contracts remain **UNVERIFIED**. These handlers do not claim live API verification and do not implement products, orders, inventory, fulfillment, webhooks, or research.
