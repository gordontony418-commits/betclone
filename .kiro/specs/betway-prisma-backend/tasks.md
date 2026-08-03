# Implementation Plan: betway-prisma-backend

## Overview

Build a Node.js/Express + Prisma backend at `betway-backend/` that serves the static Betway Nigeria SPA and all API routes on port 4000. The backend implements a cache-first strategy for sports/CMS data using SQLite via Prisma ORM, always live-proxies auth, betting, and player requests, and patches `index.html` at startup to redirect all API domains to `localhost:4000`.

---

## Tasks

- [x] 1. Bootstrap project structure, package configuration, and TypeScript setup
  - Create `betway-backend/` directory with `package.json` defining `build`, `start`, `dev`, `test`, and `migrate` scripts
  - Install production dependencies: `express`, `@prisma/client`, `http-proxy-middleware`, `cors`, `dotenv`, `node-fetch`; install dev dependencies: `prisma`, `typescript`, `ts-node`, `@types/express`, `@types/node`, `@types/cors`, `fast-check`, `vitest`
  - Create `tsconfig.json` targeting ES2020 with `strict: true`, `outDir: dist`, `rootDir: src`, `esModuleInterop: true`
  - Create `betway-backend/.env` with `DATABASE_URL`, `PORT`, `BACKEND_URL`, `SPORTS_DOMAIN`, `AUTH_DOMAIN`, `PLAYER_DOMAIN`, `BETTING_DOMAIN` keys and sensible defaults
  - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 15.1, 15.2, 15.3_

- [x] 2. Define Prisma schema and run initial migration
  - [x] 2.1 Write `betway-backend/prisma/schema.prisma` with all models: `Sport`, `Region`, `League`, `Event`, `Market`, `Outcome`, `Price`, `Score`, `User`, `BetSlip`, `BetSelection`, `UserFavourite`, `CronCache`
    - Use `sqlite` provider by default, configurable via `DATABASE_URL`
    - Ensure all `@id`, `@unique`, `@@unique`, and `@relation` constraints match the design
    - _Requirements: 10.1–10.8, 11.3_
  - [x] 2.2 Write `betway-backend/prisma/seed.ts` seeding Nigerian sports data (Football, Basketball, Tennis leagues)
    - Use `prisma.sport.upsert`, `prisma.region.upsert`, `prisma.league.upsert` so the seed is re-runnable
    - _Requirements: 15.5_

- [x] 3. Implement environment config and Prisma singleton
  - [x] 3.1 Create `src/config.ts` that loads `.env` via `dotenv`, exports typed constants (`DATABASE_URL`, `PORT`, `BACKEND_URL`, `SPORTS_DOMAIN`, `AUTH_DOMAIN`, `PLAYER_DOMAIN`, `BETTING_DOMAIN`), and logs a descriptive warning for any missing variable before applying its default
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5_
  - [x] 3.2 Create `src/db.ts` exporting a Prisma client singleton (`export const prisma = new PrismaClient()`)
    - _Requirements: 11.1, 11.3_

- [x] 4. Implement `patchIndexHtml` utility
  - [x] 4.1 Create `src/utils/patchIndexHtml.ts` that reads `www.betway.com.ng/index.html`, writes a `.bak` backup, rewrites all external domain values inside `window.__NUXT__.config.public` to equivalent local paths under `BACKEND_URL`, and skips `_nuxt/` asset references unchanged
    - Log a warning and return without throwing if `index.html` does not exist
    - Function must be idempotent: running twice on the same file produces the same patched output
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_
  - [ ]* 4.2 Write property test for `patchIndexHtml` — Property 1: Domain Rewrite Correctness
    - **Property 1: Domain Rewrite Correctness** — for any `index.html` content containing `window.__NUXT__.config.public` with external domains, every external host is replaced with the `BACKEND_URL`-relative path and every `_nuxt/` reference is left unchanged
    - **Validates: Requirements 2.1, 2.3**
  - [ ]* 4.3 Write property test for `patchIndexHtml` — Property 2: PatchIndexHtml Idempotence
    - **Property 2: PatchIndexHtml Idempotence** — `patch(patch(x)) === patch(x)` for arbitrary `index.html` content
    - **Validates: Requirements 2.5**

- [x] 5. Implement Express app bootstrap and CORS/body-parser middleware
  - [x] 5.1 Create `src/app.ts` implementing `createApp()` that initialises Express, applies CORS middleware (`Access-Control-Allow-Origin: *`), handles `OPTIONS` preflight with HTTP 204, and attaches JSON body-parser with error-safe fallback
    - _Requirements: 3.1, 3.2, 3.3, 3.4_
  - [ ]* 5.2 Write property test for CORS header invariant — Property 3
    - **Property 3: CORS Header Invariant** — for any request method and path, the response always contains `Access-Control-Allow-Origin: *`
    - **Validates: Requirements 3.1**
  - [ ]* 5.3 Write property test for JSON body round-trip — Property 4
    - **Property 4: JSON Body Round-Trip** — for any valid JSON object sent as request body, `req.body` is deeply equal to the original; for any invalid JSON string, the route responds HTTP 400
    - **Validates: Requirements 3.3, 3.4**

- [x] 6. Implement static file serving
  - [x] 6.1 Create `src/routes/static.ts` that mounts:
    - `express.static('../www.betway.com.ng')` at `/` (excluding CDN/CMS prefixes)
    - `express.static('../cdn.betwayafrica.com')` at `/cdn.betwayafrica.com/`
    - `express.static('../cms1.betwayafrica.com')` at `/cms1.betwayafrica.com/`
    - Fallback: serve `www.betway.com.ng/index.html` for `/` requests; return 404 JSON for missing static files
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

- [x] 7. Implement generic proxy middleware
  - [x] 7.1 Create `src/middleware/proxy.ts` implementing `createProxy(config: ProxyConfig): RequestHandler` using `http-proxy-middleware`
    - Strip `host`, `origin`, and `referer` headers before forwarding; replace `host` with the upstream target's hostname
    - Relay upstream status code, non-restricted headers, and body to the caller
    - When no upstream mapping exists for a path, respond with HTTP 404 `{ error: "No upstream configured for path" }`
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_
  - [ ]* 7.2 Write property test for proxy host header stripping — Property 8
    - **Property 8: Proxy Host Header Stripping** — for any proxied request, the `host` header forwarded upstream equals the hostname of the target URL, not the original client's `host` value
    - **Validates: Requirements 9.2**

- [x] 8. Implement SportsController (cache-first cron sports/esports)
  - [x] 8.1 Create `src/controllers/SportsController.ts` implementing `getSports` and `getEsports` handlers
    - Build `cacheKey` as `"sports:<brand>:<locale>"` / `"esports:<brand>:<locale>"`
    - Check `CronCache` for a fresh entry (`expiresAt > now`); on hit, return immediately without any upstream call
    - On miss, fetch upstream sports feed, upsert `CronCache` with `expiresAt = now + 300s`, fire-and-forget `persistSportEntities`, return upstream response
    - On upstream non-2xx, return last stale cache entry if available or HTTP 503 `{ error: "Upstream unavailable", cached: false }`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_
  - [ ]* 8.2 Write property test for cache-first freshness — Property 5
    - **Property 5: Cache-First Freshness** — for any `(brand, locale)` with a fresh `CronCache` entry, the upstream fetch call count is zero
    - **Validates: Requirements 5.1, 5.2, 5.6**
  - [ ]* 8.3 Write property test for cache miss persist round-trip — Property 6
    - **Property 6: Cache Miss Persist Round-Trip** — after a cache miss and upstream fetch, `retrieve(upsert(fetch(key))) == fetch(key)` for any `cacheKey`
    - **Validates: Requirements 5.3, 5.6**

- [x] 9. Implement entity persistence (`persistSportEntities`)
  - [x] 9.1 Create the `persistSportEntities(payload)` function in `SportsController.ts` (or a `src/utils/persist.ts` helper) that upserts `Sport`, `Region`, `League`, and `Event` records using their respective unique keys; call with `prisma.$transaction` for batch efficiency
    - _Requirements: 5.4, 10.1, 10.2, 10.3, 10.4, 10.9_
  - [ ]* 9.2 Write property test for entity upsert idempotence — Property 9
    - **Property 9: Entity Upsert Idempotence** — calling `persistSportEntities` twice with the same payload produces the same DB state as calling it once; no duplicate rows created
    - **Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.9**

- [x] 10. Implement MarketsController (cache-first market groups and favourite markets)
  - [x] 10.1 Create `src/controllers/MarketsController.ts` implementing `getMarkets` and `getFavouriteMarkets`
    - For `getMarkets`: query `Market`, `Outcome`, `Price` by `eventId`; on DB hit return `{ marketsInGroup, outcomes, prices }`; on miss proxy upstream and fire-and-forget `persistMarketEntities`
    - For `getFavouriteMarkets`: apply same cache-first logic; on DB failure return an error response (do not fall back)
    - _Requirements: 6.1, 6.2, 6.3, 6.4_
  - [x] 10.2 Implement `persistMarketEntities(payload)` in `MarketsController.ts` (or shared persist helper) upserting `Market`, `Outcome`, and `Price` records using their unique keys
    - _Requirements: 6.3, 10.5, 10.6, 10.7, 10.9_
  - [ ]* 10.3 Write property test for entity upsert idempotence for market entities — Property 9 (market variant)
    - **Property 9 (markets): Entity Upsert Idempotence** — calling `persistMarketEntities` twice with the same payload produces the same DB state as calling it once
    - **Validates: Requirements 10.5, 10.6, 10.7, 10.9**

- [x] 11. Implement BettingController (always live-proxied)
  - [x] 11.1 Create `src/controllers/BettingController.ts` implementing `buildBet`, `placeBet`, `getOpenBets`, and `cashOut` handlers
    - Each handler forwards the request directly to the upstream betting API using the configured `BETTING_DOMAIN`; no DB read or write occurs at any point
    - Preserve all original request headers including `Authorization`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_
  - [ ]* 11.2 Write property test for live-proxy routes never writing to DB — Property 7
    - **Property 7: Live-Proxy Routes Never Write to the Database** — for any betting request, the count of DB write operations (INSERT/UPDATE/UPSERT) is zero
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4**

- [x] 12. Implement ContentController (Kentico CMS cache-first)
  - [x] 12.1 Create `src/controllers/ContentController.ts` implementing `getContent`
    - Build `cacheKey` from `host + route + lang` query parameters
    - Check `CronCache`; on fresh hit return HTTP 200 from cache without any upstream call
    - On miss, fetch from `cms1.betwayafrica.com`, upsert `CronCache`, return upstream content
    - When upstream is unreachable and no cache exists: return HTTP 503 immediately; when upstream is unreachable but a stale entry exists: return that entry with HTTP 200
    - _Requirements: 12.1, 12.2, 12.3, 12.4_
  - [ ]* 12.2 Write property test for cache key uniqueness — Property 10
    - **Property 10: Cache Key Uniqueness Across Route Types** — for any two distinct cacheable route types (e.g. sports vs. CMS), the generated `cacheKey` values never collide even when request parameters overlap
    - **Validates: Requirements 5.6, 12.1**

- [x] 13. Implement auth and player proxy routes
  - [x] 13.1 Create `src/routes/auth.ts` and `src/routes/player.ts` wiring the defined endpoints (`/Users/Login`, `/Users/Register`, `/Users/Logout`, etc.) to `createProxy` with `persist: false`
    - Forward all requests to `AUTH_DOMAIN` / `PLAYER_DOMAIN` without caching; relay upstream status, headers, and body
    - On upstream unavailable: return HTTP 503 `{ error: "Upstream unavailable" }`; never return cached data
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_
  - [ ]* 13.2 Write property test for live-proxy routes never writing to DB (auth/player) — Property 7 (auth/player variant)
    - **Property 7 (auth/player): Live-Proxy Routes Never Write to the Database** — for any auth or player request, the count of DB write operations is zero
    - **Validates: Requirements 8.1, 8.2, 8.3**

- [x] 14. Wire all routes into the Express app and implement server entry point
  - [x] 14.1 Update `src/app.ts` to mount all route groups in order:
    - `/br/_apis/sport` → sports router
    - `/appsynapse/bet-api-sr02` → betting router
    - `/cms` → content router
    - `/appsynapse/auth` → auth router
    - `/appsynapse/player` → player router
    - `/api`, `/apic`, `/casinoapi`, `/config`, `/signalr`, `/promoapi`, `/sportsapi/br`, `/appsynapse/universal` → generic proxy
    - Static file router mounted last (catch-all SPA fallback)
    - Global error handler returning HTTP 500 `{ error: "Internal server error" }` for unhandled exceptions
    - _Requirements: 4.1, 4.2, 4.3, 9.1, 13.3, 13.5_
  - [x] 14.2 Create `src/server.ts` entry point: call `prisma.$connect()`, run `patchIndexHtml()`, call `createApp().listen(PORT)`, handle DB connection failure by logging and falling through to live-proxy mode
    - _Requirements: 11.1, 11.2, 11.4, 14.4, 14.5_

- [x] 15. Checkpoint — verify build and all unit/property tests pass
  - Run `npm run build` in `betway-backend/` and confirm zero TypeScript compilation errors
  - Run `npm run migrate` to apply Prisma migrations and confirm schema creation
  - Ensure all tests pass, ask the user if questions arise

- [x] 16. Implement domain-mapping integration and 404 fallback
  - [x] 16.1 Add a final catch-all route handler in `src/app.ts` (after all routers, before static files) that returns HTTP 404 `{ error: "No upstream configured for path" }` for any API path that reaches it without a match
    - _Requirements: 4.3, 9.5_
  - [ ]* 16.2 Write integration tests for the domain routing table
    - Test that each prefix in the domain map routes to the correct handler or proxy target
    - Test that an unmapped path returns HTTP 404 with the correct JSON body
    - _Requirements: 4.1, 4.2, 4.3_

- [x] 17. Implement error handling middleware and DB fallback mode
  - [x] 17.1 Add global Express error-handler middleware in `src/app.ts` catching unhandled route exceptions, logging request path and timestamp, and responding HTTP 500 `{ error: "Internal server error" }` without crashing the process
    - _Requirements: 13.3, 13.5_
  - [x] 17.2 Add DB-unavailability guard in `src/db.ts`/`src/server.ts`: on Prisma error after startup, log the error, disable DB writes, and continue serving all proxied routes with live data
    - _Requirements: 11.2, 11.4, 13.4_

- [x] 18. Final checkpoint — full integration verification
  - Ensure all tests pass and TypeScript build is clean
  - Verify `npm run dev` starts without errors and the static frontend is reachable at `http://localhost:4000`
  - Ask the user if any questions arise before considering the implementation complete

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Checkpoints (tasks 15 and 18) ensure incremental validation at safe break points
- Property tests use `fast-check` as specified in the design's testing strategy
- Unit tests use `vitest` as the test runner
- Entity persistence functions (`persistSportEntities`, `persistMarketEntities`) are fire-and-forget — they must never block the HTTP response path
- Auth tokens and session data must never be persisted; the `User` model is for local seed data only
- The `_nuxt/` directory in `www.betway.com.ng/` must never be modified

---

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["2.1", "2.2", "3.1", "3.2"] },
    { "id": 1, "tasks": ["4.1", "5.1", "6.1"] },
    { "id": 2, "tasks": ["4.2", "4.3", "5.2", "5.3", "7.1"] },
    { "id": 3, "tasks": ["7.2", "8.1"] },
    { "id": 4, "tasks": ["8.2", "8.3", "9.1", "10.1"] },
    { "id": 5, "tasks": ["9.2", "10.2", "11.1", "12.1"] },
    { "id": 6, "tasks": ["10.3", "11.2", "12.2", "13.1"] },
    { "id": 7, "tasks": ["13.2", "14.1"] },
    { "id": 8, "tasks": ["14.2"] },
    { "id": 9, "tasks": ["16.1", "17.1", "17.2"] },
    { "id": 10, "tasks": ["16.2"] }
  ]
}
```
