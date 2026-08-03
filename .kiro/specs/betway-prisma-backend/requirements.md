# Requirements Document

## Introduction

This document specifies the requirements for `betway-prisma-backend` — a Node.js/Express backend
server that acts as a transparent intermediary between the static Betway Nigeria Nuxt 3 SPA
(located at `www.betway.com.ng/`) and the real Betway upstream APIs. The backend serves the
frontend static files and all API routes on a single port (4000), uses a SQLite database (via
Prisma ORM) as a cache and entity store, and applies a cache-first strategy for content/sports
data while always live-proxying authentication, betting, and player requests.

---

## Glossary

- **Backend**: The Node.js/Express application located at `betway-backend/`.
- **SPA**: The static Betway Nigeria Nuxt 3 Single Page Application in `www.betway.com.ng/`.
- **Upstream API**: Any real Betway external service (e.g., `feeds-roa2.betwayafrica.com`, `api.betwayafrica.com`).
- **CronCache**: The Prisma model that stores arbitrary JSON responses keyed by a `cacheKey` string.
- **Cache Entry**: A row in `CronCache` with an associated `expiresAt` timestamp.
- **TTL**: Time-to-Live; the duration (in seconds) for which a cache entry is considered fresh.
- **Proxy**: The act of forwarding an HTTP request from the Backend to an Upstream API and relaying the response.
- **PatchIndexHtml**: The startup utility function that rewrites domain values in `index.html`.
- **Live-proxy**: A request that is always forwarded to the Upstream API without consulting the cache.
- **Entity**: A structured Prisma model record — `Sport`, `Region`, `League`, `Event`, `Market`, `Outcome`, `Price`.
- **Domain Map**: The mapping table from local path prefixes to Upstream API base URLs.
- **BACKEND_URL**: The environment variable that specifies the base URL of the Backend (default: `http://localhost:4000`).
- **DATABASE_URL**: The environment variable that specifies the Prisma database connection string.

---

## Requirements

### Requirement 1: Single-Port Unified Server

**User Story:** As a developer, I want the backend to serve both API routes and static frontend files on a single port, so that I can run the entire application with one command and no cross-origin issues.

#### Acceptance Criteria

1. THE Backend SHALL listen on port 4000 by default, configurable via a `PORT` environment variable.
2. THE Backend SHALL serve all files under `www.betway.com.ng/` as static assets rooted at `/`, except for request paths that match the `/cdn.betwayafrica.com/` or `/cms1.betwayafrica.com/` prefixes, which SHALL be resolved exclusively by criteria 3 and 4 respectively.
3. THE Backend SHALL serve all files under `cdn.betwayafrica.com/` as static assets at the path prefix `/cdn.betwayafrica.com/`.
4. THE Backend SHALL serve all files under `cms1.betwayafrica.com/` as static assets at the path prefix `/cms1.betwayafrica.com/`.
5. WHEN a static file is requested and the file exists, THE Backend SHALL respond with the file content and a `Content-Type` header derived from the file's extension.
6. IF a requested static file does not exist, THEN THE Backend SHALL respond with an error status indicating the resource was not found and a `Content-Type` header.
7. WHEN a request is made to `/`, THE Backend SHALL serve `www.betway.com.ng/index.html`.

---

### Requirement 2: Frontend Index.html Domain Patching

**User Story:** As a developer, I want `index.html` domain values automatically rewritten to `localhost:4000` at startup, so that the SPA routes all API calls through the backend without any manual file edits.

#### Acceptance Criteria

1. WHEN the Backend starts and `www.betway.com.ng/index.html` exists, THE PatchIndexHtml utility SHALL read the file and rewrite all external domain values inside `window.__NUXT__.config.public` to equivalent local paths under `BACKEND_URL`.
2. WHEN PatchIndexHtml runs and the target file exists, THE PatchIndexHtml utility SHALL create a backup of the original file at `www.betway.com.ng/index.html.bak` before modifying the file.
3. THE PatchIndexHtml utility SHALL NOT modify any file paths under `_nuxt/` (JavaScript and CSS asset references).
4. IF `www.betway.com.ng/index.html` does not exist, THEN THE PatchIndexHtml utility SHALL log a warning and skip patching without terminating the server process.
5. THE PatchIndexHtml utility SHALL be idempotent — running it twice on the same file SHALL produce the same patched output as running it once.

---

### Requirement 3: CORS and General Middleware

**User Story:** As a frontend developer, I want every backend response to include permissive CORS headers, so that the SPA can make requests to the backend without browser CORS errors.

#### Acceptance Criteria

1. THE Backend SHALL include the `Access-Control-Allow-Origin: *` header on every HTTP response.
2. WHEN an HTTP `OPTIONS` preflight request is received, THE Backend SHALL respond with HTTP status 204 exactly and the required CORS headers.
3. THE Backend SHALL parse incoming `application/json` request bodies and make them available as `req.body`; WHEN JSON parsing fails, `req.body` SHALL remain available (as raw or empty) rather than causing a 400 error at the middleware layer.
4. WHEN a request body cannot be parsed as JSON, THE Backend SHALL respond with HTTP status 400 and a descriptive error message in route handlers that require a valid JSON body.

---

### Requirement 4: Domain-to-Route Mapping

**User Story:** As a developer, I want every `window.__NUXT__.config` domain to be mapped to a local Express route prefix, so that the SPA's existing API call paths work without modification.

#### Acceptance Criteria

1. THE Backend SHALL register the following local path prefixes and forward unhandled requests to the corresponding upstream base URLs:

   | Local Path Prefix | Upstream Base URL |
   |---|---|
   | `/br/_apis/sport` | `https://feeds-roa2.betwayafrica.com/br/_apis/sport` |
   | `/appsynapse/bet-api-sr02` | Real Betway bet-api-sr02 endpoint |
   | `/cms` | `https://cms1.betwayafrica.com` |
   | `/appsynapse/auth` | Real Betway auth endpoint |
   | `/appsynapse/player` | Real Betway player endpoint |
   | `/api` | `https://api.betwayafrica.com/api` |
   | `/apic` | `https://apic.betwayafrica.com/api` |
   | `/casinoapi` | `https://casinoapi.betwayafrica.com/api` |
   | `/config` | `https://config.betwayafrica.com` |
   | `/signalr` | `https://signalrapi.betwayafrica.com` |
   | `/promoapi` | `https://promoapi.betwayafrica.com` |
   | `/sportsapi/br` | `/appsynapse/br` (Radar sports) |
   | `/appsynapse/universal` | Real Betway universal endpoint |

2. WHEN a request path matches a registered prefix, THE Backend SHALL route the request to the corresponding handler or proxy.
3. WHEN a request path matches no registered prefix, THE Backend SHALL respond with HTTP status 404 and `{ "error": "No upstream configured for path" }`.

---

### Requirement 5: Cache-First Sports Data

**User Story:** As a user, I want sports feed data served quickly from a local cache, so that page loads are fast even when the upstream API is slow or unavailable.

#### Acceptance Criteria

1. WHEN a `GET /br/_apis/sport/cron/sports/:brand/:locale` request is received, THE Backend SHALL check the `CronCache` for a fresh entry (where `expiresAt > now`, strictly less than 50 ms response time) before calling the Upstream API.
2. WHEN a fresh cache entry exists, THE Backend SHALL return the cached JSON without making any upstream request, with a response time strictly less than 50 ms.
3. WHEN no fresh cache entry exists, THE Backend SHALL forward the request to the upstream sports API, upsert the response into `CronCache` with `expiresAt = now + 300 seconds`, and return the upstream response to the frontend.
4. WHEN the upstream sports API responds successfully, THE Backend SHALL asynchronously upsert `Sport`, `Region`, `League`, and `Event` entities into the database without blocking the HTTP response.
5. WHEN the upstream sports API returns a non-2xx status, THE Backend SHALL return the most recently cached entry if one exists (even if stale), or respond with HTTP status 503 and `{ "error": "Upstream unavailable", "cached": false }`.
6. WHEN a `GET /br/_apis/sport/cron/esports/:brand/:locale` request is received, THE Backend SHALL apply the same cache-first logic — including cache access and freshness validation based on expiration time — with an independent cache key.

---

### Requirement 6: Market Groups Cache-First

**User Story:** As a user, I want market and odds data served from the local database when available, so that I see consistent odds without redundant upstream calls.

#### Acceptance Criteria

1. WHEN a `GET /br/_apis/sport/MarketGroupings/MarketGroupNamesAndMarketsForEvent` request is received, THE Backend SHALL query the database for `Market`, `Outcome`, and `Price` records matching the `eventId` query parameter.
2. WHEN matching database records are found, THE Backend SHALL return a JSON response containing `marketsInGroup`, `outcomes`, and `prices` arrays from the database.
3. WHEN no matching database records are found, THE Backend SHALL forward the request to the upstream API, asynchronously persist the returned `Market`, `Outcome`, and `Price` entities, and return the upstream response.
4. WHEN a `GET /br/_apis/sport/FeedsMarket` request is received, THE Backend SHALL apply the same cache-first logic for favourite market data; IF the database query fails, THEN THE Backend SHALL fail the request and return an error response.

---

### Requirement 7: Betting Endpoints — Always Live

**User Story:** As a bettor, I want all bet placement and cashout operations to always use live data from the real Betway API, so that odds and bet acceptance are never served from a stale cache.

#### Acceptance Criteria

1. WHEN a `POST /appsynapse/bet-api-sr02/Betting/Build` request is received, THE Backend SHALL forward the request to the upstream betting API without consulting any cache.
2. WHEN a `POST /appsynapse/bet-api-sr02/Betting/Place` request is received, THE Backend SHALL forward the request live and SHALL NOT write any part of the response to a database table.
3. WHEN a `GET /appsynapse/bet-api-sr02/Betting/OpenBets` request is received, THE Backend SHALL forward the request live without caching.
4. WHEN a `POST /appsynapse/bet-api-sr02/Betting/CashOut` request is received, THE Backend SHALL forward the request live without caching.
5. THE Backend SHALL preserve all request headers (including `Authorization`) when forwarding betting requests to the upstream API.

---

### Requirement 8: Auth and Player Endpoints — Always Live

**User Story:** As a user, I want authentication and profile operations to always reach the real Betway servers, so that login sessions and account data are always accurate.

#### Acceptance Criteria

1. WHEN a request is received on any path matching `/appsynapse/auth/*`, THE Backend SHALL forward the request to the upstream auth service without caching the response.
2. WHEN a request is received on any path matching `/appsynapse/player/*`, THE Backend SHALL forward the request to the upstream player service without caching the response.
3. THE Backend SHALL NOT store any auth token, session identifier, or player profile data in any database table.
4. THE Backend SHALL relay the upstream response status code, headers, and body to the frontend; WHEN some parts of the upstream response are technically unavailable, THE Backend SHALL relay available parts.
5. IF the upstream auth or player service is unavailable, THEN THE Backend SHALL respond with HTTP status 503 and `{ "error": "Upstream unavailable" }` — it SHALL NOT return any cached data.

---

### Requirement 9: Generic Proxy Middleware

**User Story:** As a developer, I want a catch-all proxy that handles any path not covered by a specific router, so that the backend never silently drops API calls that are not yet implemented.

#### Acceptance Criteria

1. THE Backend SHALL attempt to proxy only requests that have actually reached the backend and for which no specific route handler matched.
2. WHEN the proxy forwards a request, THE Backend SHALL strip the `host` header from the original request and replace it with the host of the upstream target.
3. WHEN the proxy receives a response, THE Backend SHALL relay the status code, all non-restricted headers, and the response body to the original requester; WHEN some parts of the upstream response are technically unavailable, THE Backend SHALL relay available parts.
4. THE Backend SHALL NOT forward the following restricted headers to the upstream: `host`, `origin`, `referer`.
5. WHEN no upstream mapping exists for the request path, THE Backend SHALL respond with HTTP status 404 and `{ "error": "No upstream configured for path" }`.

---

### Requirement 10: Entity Persistence (Upsert Idempotency)

**User Story:** As a developer, I want all database writes to be upserts so that repeated API calls never create duplicate records.

#### Acceptance Criteria

1. THE Backend SHALL upsert `Sport` records using `sportId` as the unique key.
2. THE Backend SHALL upsert `Region` records using `regionId` as the unique key.
3. THE Backend SHALL upsert `League` records using `leagueId` as the unique key.
4. THE Backend SHALL upsert `Event` records using `eventId` as the unique key.
5. THE Backend SHALL upsert `Market` records using `marketId` as the unique key.
6. THE Backend SHALL upsert `Outcome` records using `outcomeId` as the unique key.
7. THE Backend SHALL upsert `Price` records using `outcomeId` as the unique key.
8. THE Backend SHALL upsert `CronCache` records using `cacheKey` as the unique key.
9. FOR ALL entity upsert operations, calling the same operation twice with identical data SHALL produce the same database state as calling it once.

---

### Requirement 11: Database Initialisation and Connection

**User Story:** As a developer, I want the database to be ready before the server accepts requests, so that no request is processed without a working database connection.

#### Acceptance Criteria

1. WHEN the Backend starts, THE Backend SHALL call `prisma.$connect()` before binding to the HTTP port.
2. IF the database connection fails on startup, THEN THE Backend SHALL log the error and fall through to live-proxy mode (no caching) rather than crashing; THE Backend MAY disable proxied routes in fallback mode if configured to do so.
3. THE Backend SHALL use a SQLite database by default, configurable to PostgreSQL via the `DATABASE_URL` environment variable.
4. WHEN running in live-proxy fallback mode, THE Backend SHALL continue to serve all proxied routes with live data; IF the proxy itself fails, THEN THE Backend SHALL return error responses rather than attempting to reconnect to the database.

---

### Requirement 12: Content (Kentico CMS) Cache

**User Story:** As a user, I want CMS-driven content (banners, promotions, pages) to be cached locally so the UI loads quickly without always hitting the Kentico CMS.

#### Acceptance Criteria

1. WHEN a `GET /cms` request is received with `host`, `route`, and `lang` query parameters, THE Backend SHALL check the `CronCache` for a fresh entry keyed by those parameters.
2. WHEN a fresh cache entry exists, THE Backend SHALL return the cached CMS content with HTTP 200 without making an upstream request — a fresh cache hit is treated as successful.
3. WHEN no fresh cache entry exists, THE Backend SHALL forward the request to `cms1.betwayafrica.com`, cache the response in `CronCache`, and return the upstream content; IF the upstream is unreachable and no cached content exists, THEN THE Backend SHALL respond with HTTP 503 immediately.
4. WHEN the upstream CMS service is unavailable but a cached entry exists (even if stale), THE Backend SHALL return that cached entry with HTTP 200.

---

### Requirement 13: Error Handling

**User Story:** As a developer, I want the backend to handle upstream failures and malformed responses gracefully, so that partial failures don't crash the server or corrupt the cache.

#### Acceptance Criteria

1. WHEN an upstream API call times out or returns a connection error, THE Backend SHALL log the error with the request path and timestamp, and return a successful response to the client based on available cached data (or 503 if none exists).
2. WHEN an upstream API call fails for a cache-first route, THE Backend SHALL serve the last cached entry if available and not yet expired, before returning 503.
3. WHEN an upstream API returns a non-JSON body on a route that expects JSON, THE Backend SHALL log a parse error; IF an unhandled exception is raised, THEN THE Backend SHALL respond with HTTP status 500 rather than forwarding the raw response.
4. IF the Prisma database becomes unavailable after startup, THEN THE Backend SHALL log the error and continue serving requests in live-proxy mode without attempting further DB writes.
5. WHEN any unhandled exception occurs in a route handler, THE Backend SHALL respond with HTTP status 500 and `{ "error": "Internal server error" }` and SHALL NOT crash the process.

---

### Requirement 14: Environment Configuration

**User Story:** As a developer, I want all external URLs and secrets managed via environment variables, so that the backend can be configured for different environments without code changes.

#### Acceptance Criteria

1. THE Backend SHALL read configuration from a `.env` file at `betway-backend/.env` using `dotenv`.
2. THE Backend SHALL use the following environment variables at startup: `DATABASE_URL`, `SPORTS_DOMAIN`, `AUTH_DOMAIN`, `PLAYER_DOMAIN`, `BETTING_DOMAIN`.
3. WHEN any environment variable is missing, THE Backend SHALL log a descriptive warning and use a sensible default value, then continue startup normally without throwing an uncaught exception — including for `DATABASE_URL`, which SHALL default to a local SQLite file path.
4. THE Backend SHALL default `BACKEND_URL` to `http://localhost:4000` when the variable is not set.
5. THE Backend SHALL default `PORT` to `4000` when the variable is not set.

---

### Requirement 15: Project Structure and Build

**User Story:** As a developer, I want a well-organised TypeScript project with a standard build setup, so that I can compile, run, and test the backend reliably.

#### Acceptance Criteria

1. THE Backend project SHALL be written in TypeScript and located at `betway-backend/`.
2. THE Backend SHALL include a `package.json` with scripts: `build` (compile TS), `start` (run compiled output), `dev` (run with `ts-node`), `test` (run test suite), and `migrate` (run Prisma migrations).
3. THE Backend SHALL include a `tsconfig.json` targeting ES2020 or later with `strict` mode enabled.
4. THE Prisma schema SHALL be located at `betway-backend/prisma/schema.prisma`.
5. THE Backend SHALL include a seed script at `betway-backend/prisma/seed.ts` that populates Nigerian sports data for local development.
