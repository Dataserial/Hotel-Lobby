# Task 1–2 HTTP contract

Current extension (9 October 2026): Task 4 stay operations and Task 5 dashboard use Asia/Bangkok. Public availability is the documented exception to `/api` Bearer authentication; see `api-task5.md`. Historical scope statements below describe the original Task 1–2 delivery.

Base path `/api`; JSON request/response. Validation uses HTTP `400`, auth `401`, wrong role `403`, missing record `404`, conflicts `409`. Error shape: `{ "error": { "code": "VALIDATION_ERROR", "message": "...", "requestId": "UUID" } }`. Every response carries `X-Request-Id`. Prices are safe integer **baht**. Hotel calendar dates (for later booking routes) use `YYYY-MM-DD` in the half-open interval `[checkInDate, checkOutDate)`; event timestamps are UTC. Hotel timezone for check-in/out is pending team decision. Prisma/MongoDB and `Room.number`/collection `Room` remain in use; API exposes `roomNumber`.

## Authentication

`POST /api/auth/login` body `{ "email": "admin@example.test", "password": "..." }` returns `{token,tokenType:"Bearer",expiresIn:28800,user}`. Send `Authorization: Bearer <token>` on all other `/api` calls. The token is random; only SHA-256 hash is stored in `sessions`. It expires after 8 hours, becomes invalid immediately on `POST /api/auth/logout`, and is checked against active user on every request. `GET /api/auth/me` returns `{user}`. Login failure is `401 INVALID_CREDENTIALS`. There is no cookie; CSRF is not applicable to bearer credentials. Store token in memory on a trusted client, not in URL or logs. `CORS_ORIGINS` is a comma-separated allowlist; default empty means cross-origin browser calls are disallowed. Set actual UI origin at deployment.

## Roles

| Resource | Admin | Receptionist |
|---|---|---|
| Users | list/get/create/update/deactivate | no access |
| Room types | read/write/delete if unreferenced | read |
| Rooms | read/write/delete if no history | read/search |
| Guests | read/write/delete or archive | read/write/delete or archive; document number masked |

All collection GET endpoints accept `page` (default 1) and `limit` (default 20, max 100) and return `{items,page,limit,total}`. Unknown body/query fields are rejected. System actor fields are read-only. Legacy rooms lacking valid type/status/active are readable but not bookable.

Example: `POST /api/room-types` with `{"name":"Standard","capacity":2,"basePrice":1200,"amenities":["Wi-Fi"]}` returns HTTP 201 with an ObjectId `id`, normalized `nameKey:"standard"`, `createdById`, `updatedById`, and UTC timestamps. `GET /api/room-types?page=1&limit=20` wraps such rows in `{"items":[...],"page":1,"limit":20,"total":1}`. `POST /api/rooms` accepts `{"roomNumber":"101","floor":1,"roomTypeId":"<ObjectId>"}` and responds with `roomNumber`, never the Mongo field name `number`.

Example: a receptionist calls `POST /api/guests` with `{"fullName":"Jane Doe","phone":"+66812345678","documentNo":"P1234567"}`. The 201 response includes `documentNoMasked:"***4567"` and omits `documentNo` and `documentNoKey`. `GET /api/guests?documentNo=P1234567` performs exact normalized search and returns masked list rows. For a duplicate normalized document, the API returns HTTP 409 `{"error":{"code":"DUPLICATE","message":"Value already exists","requestId":"<UUID>"}}`.

## Routes and fields

| Route | Input / behavior |
|---|---|
| `GET /api/users` | filters `role`, `active`, `q`; admin only; no hash |
| `POST /api/users` | `name,email,password,role`; password 12–128 chars, bcrypt; admin only |
| `GET/PATCH /api/users/:id` | PATCH accepts `name,email,password,role,active`; active admin cannot demote/deactivate self or remove last admin |
| `POST /api/users/:id/deactivate` | admin only; invalidates active sessions through per-request active check |
| `GET /api/room-types` | filters `active`, `q` |
| `POST /api/room-types` | `name,capacity(1–20),basePrice(>=0),amenities?`; admin only; normalized `nameKey` unique |
| `GET/PATCH/DELETE /api/room-types/:id` | PATCH accepts `name,capacity,basePrice,amenities,active`; capacity shrink blocked when active booking guest count exceeds it; delete only with no rooms |
| `GET /api/rooms` | filters `active,status,roomTypeId,q` (`q` searches room number) |
| `POST /api/rooms` | `roomNumber,floor,roomTypeId,status?`; admin only, status `available` or `maintenance` |
| `GET/PATCH/DELETE /api/rooms/:id` | PATCH accepts `roomNumber,floor,roomTypeId,status,active`; occupied transitions reserved for Task 4; delete only without booking or claims |
| `GET /api/guests` | filters `active,q,documentNo`; `q` searches name/phone, document search exact normalized key |
| `POST /api/guests` | `fullName,phone,email?,documentNo`; both roles; normalized document key unique |
| `GET/PATCH/DELETE /api/guests/:id` | PATCH accepts `fullName,phone,email,documentNo,active`; delete archives when booking history exists |

`GET /health` returns `{ "status": "ok" }` without DB readiness. `POST /api/auth/logout` returns 204. Create routes return 201. Delete without history returns 204. Sensitive `passwordHash`, `documentNoKey`, and token hash are never in API responses; guest lists mask document numbers for both roles, receptionist detail stays masked, while admin detail/create/update receives full `documentNo`. Do not print request bodies or Authorization headers in logs.

Task 3 routes now have a separate [Booking API contract](api-task3.md) and [OpenAPI](openapi-task3.yaml). Task 4–5 routes, Postman collection, production migration, and frontend integration are outside this Task 1–2 contract.
