# Task 5 API contract

Base `/api`. JSON, integer baht, UTC event timestamps, hotel dates in Asia/Bangkok as already used by Task 4. No cookie authentication: use the existing eight-hour revocable Bearer session. Credentials are never accepted from query strings. Keep browser tokens in memory; CSRF tokens are unnecessary for this header-only authentication. Use TLS outside local development.

## Dashboard

`GET /api/dashboard`: admin and receptionist, no query parameters.

```json
{"date":"2026-10-09","timezone":"Asia/Bangkok","availableRooms":3,"occupiedRooms":1,"arrivalsToday":2,"departuresToday":1}
```

- `availableRooms`: rooms bookable for one guest for tonight `[date,date+1)`, using the exact Booking availability service. Requires active room/type, sufficient capacity, available status and no night claim. Occupied and maintenance rooms are excluded even for future searches.
- `occupiedRooms`: active rooms whose current physical status is occupied. These counts are not complements: unavailable, legacy and maintenance rooms are excluded.
- `arrivalsToday` / `departuresToday`: non-cancelled bookings with scheduled check-in/check-out on the hotel date, including already processed stays. These are scheduled arrivals, not bookings created today.
- Counts are live independent reads, not a financial or transactional snapshot during simultaneous writes.

`GET /api/dashboard/report`: admin only, no query. All-time ledger totals, not revenue recognition or a full accounting report:

```json
{"scope":"all-time-ledger","currency":"THB","unit":"baht","receivedBaht":1500,"refundedBaht":200,"netBaht":1300,"unreconciledPayments":0}
```

Legacy payment summaries are excluded from totals until reconciled into the ledger; `unreconciledPayments` exposes their count. No user, guest, booking details or payment references are returned.

## Public availability

`GET /api/public/rooms/availability?checkInDate=2026-11-01&checkOutDate=2026-11-02&guestCount=2&page=1&limit=20`

Anonymous read-only access is the default for this implementation. No API key is required and no artificial 401 is promised. Reuses the authenticated availability handler/service. Maximum stay 365 nights, `guestCount` positive integer, page defaults 1, limit defaults 20/max 100. Unknown, repeated, nested or malformed parameters fail validation.

```json
{"items":[{"roomId":"400000000000000000000001","roomNumber":"101","roomType":"Standard","capacity":2,"pricePerNight":1200}],"page":1,"limit":20,"total":1}
```

Only the five room fields above are exposed. Public rate limit: 60 requests per IP per minute. Login: 20 requests per IP per 15 minutes. Limit violations return 429 `RATE_LIMITED` and `Retry-After` seconds. Counters are bounded/in-memory and reset on restart; multi-instance deployment needs a shared edge limiter. The app does not trust `X-Forwarded-For`, so a reverse proxy must enforce consumer limits itself. CORS is not authentication: non-browser clients may call the public API regardless of origin.

`PUBLIC_CORS_ORIGINS` is a comma-separated browser origin allowlist separate from staff `CORS_ORIGINS`. Empty list allows no cross-origin browser access. Include the exact hostname: localhost and 127.0.0.1 are different origins.

## Health, errors and hardening

`GET /health` -> 200 `{status:"ok"}` (process liveness). `GET /ready` -> 200 `{status:"ready"}` if a MongoDB ping completes within 2s, otherwise 503 `{status:"unavailable"}`. Draining processes fail readiness. SIGINT/SIGTERM drain requests and disconnect Prisma, with a 10s deadline.

Common errors: 400 invalid input/JSON/body over 64 KiB; 401 staff authentication; 403 report role; 409 business conflicts; 414 URL over 4096 characters; 429 rate limit; 500 generic server error. Existing error envelope `{error:{code,message,requestId}}` is retained. Headers include no-store, nosniff, no-referrer, frame denial, restrictive CSP and HSTS on direct HTTPS connections. No request bodies, tokens, document numbers or database error payloads are logged by the error handler.

Availability currently loads matching hotel rooms and claims before response pagination, inherited from Booking. Public output is bounded but database work scales with inventory and stay length. Existing unique `(roomId,night)` and booking indexes remain unchanged. Benchmark with representative inventory before increasing traffic; add paged service queries/shared rate limiting for larger deployments rather than changing booking rules independently.

See [OpenAPI](openapi-task5.yaml), [Postman](hotel-lobby.postman_collection.json), [run/deploy guide](task5-runbook.md), and acceptance evidence in `task5-acceptance.md`.
