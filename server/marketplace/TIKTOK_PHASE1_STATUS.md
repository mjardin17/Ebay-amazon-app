## TikTok Shop Phase 1 verification status

This repository currently contains a provider/client foundation only. It does not yet wire OAuth routes into `server.ts`, persist tokens durably, or call a verified TikTok Shop business endpoint.

The default TikTok URLs and parameter names in `tiktokConfig.ts` and `tiktokOAuth.ts` are configuration defaults and remain **UNVERIFIED** until confirmed against the current TikTok Shop Open Platform documentation and exercised against a real authorized seller account. Unit tests are **MOCKED/SIMULATED** and establish only **CODE VERIFIED** after the commands pass.

`MemoryTikTokTokenStore` and `MemoryOAuthStateStore` are process-local. A horizontally scaled or restarted deployment requires a shared encrypted token/state store before production use.
