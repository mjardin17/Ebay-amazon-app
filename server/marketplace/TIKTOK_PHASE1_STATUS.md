## TikTok OAuth route status

The route factory is dependency-injected and requires `TIKTOK_OAUTH_STATE_SECRET`; it never falls back to an empty or generated secret. The running-app mount must provide the process-local token store and state dependencies.

Current token and OAuth-state stores remain process-local. **NON-PRODUCTION TOKEN STORAGE — PROCESS LOCAL**.

TikTok endpoint URLs, OAuth parameter names, shop binding, `shop_cipher`, signatures, and business API contracts remain **UNVERIFIED**. No products, orders, inventory, fulfillment, webhooks, or research are implemented.
