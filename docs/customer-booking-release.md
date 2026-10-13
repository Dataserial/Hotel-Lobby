# Customer room booking release — 14 October 2026

This change is prepared and tested locally. Deployment and the live database were not changed, as requested.

## API contract

- `GET /api/public/rooms/grid/types?checkInDate=YYYY-MM-DD&checkOutDate=YYYY-MM-DD` returns `{ items }` with database room types, capacity, nightly price, amenities, active inventory count and the count available for every selected night. There is no guest-count filter and no alternative-date preview. An active type with no active rooms returns zero counts.
- `GET /api/public/rooms/grid?checkInDate=...&checkOutDate=...&roomTypeId=...` returns `{ roomType, items }`; each room has only `roomId`, `roomNumber`, and `status` (`available`, `unavailable`, `maintenance`). Active rooms are sorted numerically. Both public views read one database snapshot and preserve the existing future-occupied-room rule. No guest, account, claim-owner or booking data is returned. Dates must be real, not past, and cover 1–365 nights.
- `POST /api/customer/bookings` requires an active customer session and `Idempotency-Key` (16–128 letters, digits, hyphens or underscores). Body: `roomId`, `checkInDate`, `checkOutDate`, `phone`, `documentNo`, `expectedPricePerNight`. Name and email come from the account; `guestCount` comes from the current room-type capacity. Client-supplied account, status, total, or guest-count fields are rejected.
- Guest ownership checks, guest creation/update, confirmed booking, unique room-night claims, pending pay-at-hotel payment, and the idempotency record are committed together. No online receipt is created. Repeated identical keys return the same booking, including concurrent retries. Reusing a key for changed input returns `IDEMPOTENCY_CONFLICT`.
- `GET /api/customer/bookings?page=1&limit=20` returns `{ items, total, page, limit }`, filtered strictly by the authenticated owner (maximum page size 100). Customer requests cannot supply another owner or access staff booking/guest APIs. There is no customer edit/cancel endpoint in this release.
- `PRICE_CHANGED` requires reviewing the refreshed summary and clicking a new confirmation. `ROOM_UNAVAILABLE` returns to room selection and preserves phone/document only in component memory. `DOCUMENT_REVIEW_REQUIRED` holds legacy/unverified or other-account documents for staff review; it never attaches an old guest using the document number alone.

## Additive schema/index preparation

`Guest.customerId` and `Booking.customerId` are optional relationships, so legacy documents remain readable. Do not backfill owners by document number. The schema adds the guest owner/date index; the existing booking owner/date index supports customer pagination. `customerBookingRequests` uses its unique `_id` to scope hashed request keys by account, with no expiry or TTL.

The new `npm run db:customer-bookings` command previews additions by default. It requires an explicit database name matching the private `DATABASE_URL`, verifies the existing unique guest document, payment booking and room-night indexes, then optionally adds only the owner/date indexes and the idempotency collection. It never modifies guest/booking documents, drops indexes or collections, removes data, or sets TTLs.

For an existing database, stop writes, take a backup, and restore representative data into an isolated staging database first. Set `DATABASE_URL` privately to that verified copy. From `server`:

```powershell
npm run db:generate
npm run db:customer-bookings -- --database <verified-staging-database>
npm run db:customer-bookings -- --database <verified-staging-database> --apply
npm run db:claims -- --database <verified-staging-database>
```

Resolve failed prerequisite-index/claim audits before enabling customer writes. Use the existing claims maintenance and payment reconciliation runbooks for old inventory; this script does not invent missing claims or payment history. For a new empty test database, Prisma `db push` initializes the complete schema. Do not use `db push --accept-data-loss` or demo seeds against the live database.

After staging verification, repeat the additive preparation on the backed-up intended database, release the backend, verify `/ready` plus both public endpoints and customer/staff access, and only then release the frontend. The old summary and staff endpoints remain supported. Rollback can restore the previous application version while leaving the added indexes/optional fields and already confirmed bookings intact; do not erase customer bookings as part of rollback.

## Verification

All automated booking tests use disposable local MongoDB replica sets, not the configured live database. The new index test compares the exact legacy document before/after preparation and verifies reruns are harmless. Tests cover room conflicts and full transaction rollback, concurrent identical retries, two owners competing for the same nights, changed price/capacity, unverified documents, pagination/permissions, inactive rooms, maintenance, partial-night collisions and occupied rooms accepting future stays after departure.

React DOM tests exercise anonymous selection → signup → restored room → document entry → successful confirmation → member booking history with the real API and database. Additional tests cover stale successful responses after date/type changes, load failure/retry, preserved form data, explicit price reconfirmation, network retries with the same key, duplicate submits, and account pagination.

The existing staff booking/payment/stay suites passed via `npm run test:all:isolated`; customer flow/index suites also passed separately. Frontend build, frontend/backend lint and Prisma validation passed. Browser checks used a separate disposable fixture: Enter chooses a type, Space chooses a room, only one room is selected, maintenance is disabled with visible text, and the 390×844 layout has no page overflow. Screenshots and final verification details are in [QA evidence](qa-booking-2026-10-14/report.md).

To reproduce browser QA with synthetic inventory, run `node scripts/preview-customer-booking.js` from `server` (requires local `mongod`, optionally `MONGOD_PATH`). In another terminal from `client`, set `VITE_API_BASE_URL=http://127.0.0.1:3031/api` and run `npm run dev -- --host 127.0.0.1 --port 5174`. This fixture never reads or mutates the configured database. Stop both processes after QA.
