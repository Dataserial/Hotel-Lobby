# Figma UI implementation — 2026-10-09

Source: [Lub d Moon — Hotel Booking & Operations](https://www.figma.com/design/rUkS1GaUOoVlF8aXu25gx0?node-id=0-1).

Implemented in the existing React / TypeScript / plain CSS client. No new runtime dependency or backend/schema changes.

## Design coverage

- Moon entry (`2:34`): sticky viewport, scroll-driven moon shrink and movement, reduced-motion fallback, scroll button.
- Hotel discover (`2:35`) and mobile (`2:49`): original local Figma photos and SVGs, navy header, Thai typography, responsive availability form.
- Public availability (`9:49`): live paged room cards, calculated stay total, contact summary, loading/error/empty states. Anonymous endpoint only; no guest information or booking write.
- Staff login (`2:36`): navy card, white inputs, yellow pill button. Existing in-memory Bearer session retained.
- Dashboard (`2:37`), availability (`2:39`), bookings/review (`2:38`, `2:40`, `2:41`): live metrics and today's stays, room selection handed into booking form, review before API confirmation.
- Existing guests, rooms/types, users, reports, booking details and monetary operations retain their API flows with shared Figma styling. Forms/details use responsive dialogs within the existing application rather than separate fixed-size Figma canvases.

The implementation follows the actual backend contract: `checkInDate`, `checkOutDate`, `guestCount`. The handoff's example query names differ. Public contact displays details for the reception desk; no unverified phone/address or external messages were added. The public booking/confirmation visual experiments do not create anonymous reservations, consistent with the Figma MVP notes. Reports show all-time ledger totals; daily charts and report date filtering require additional backend support and are not populated with fabricated data.

## Local assets

All references are local `/figma/*`; no temporary Figma asset URLs remain in code.

| Asset | Figma slot | Rendered use |
| --- | --- | --- |
| `moon.svg` | `43:84` | Entry moon, 79 → 28 px |
| `brand-moon.svg` | `45:93` | Public logo, 24 × 24 px |
| `profile.svg` | `45:89` | Desktop staff button, 54 × 54 px |
| `hotel.png` | `45:96` | First desktop photo, 533 × 356 px, cover |
| `pool.png` | `49:97` | Second desktop photo, 533 × 356 px, cover |
| `lobby.png` | `49:99` | Third desktop photo, 120.08% width in clipped frame |
| `hotel-mobile.png` | `7:84` | Mobile photo, responsive width × 248 px, cover |

## Verification

- `npm run build`: passed.
- `npm run lint`: passed.
- Browser inspection at desktop and 390 px mobile: local images loaded; correct image slots and sizes; no document-wide horizontal overflow.
- Browser: moon scroll button, hotel form, public search error when backend unavailable, result cards, stay/contact dialog, empty results, staff login, dashboard, availability selection, guest selection, review and confirmation, guests/rooms/users/report screens, logout and receptionist menu restrictions checked.
- UI success flows used a temporary in-memory HTTP fixture on localhost:3000, with fake `example.test` accounts, rooms and bookings. This proves frontend interactions and rendering, not integration against MongoDB or production API authorization. The fixture made no database calls and was stopped after verification; it is not part of the shipped app.
- Actual backend/database integration, live payment/check-in/out transitions and staging CORS remain unverified in this session. Existing backend was not running. No migration, seed, database write, deploy or remote publication was performed.

The local Node/npm TLS hardware path initially failed with `ERR_SSL_CIPHER_OPERATION_FAILED`. Dependency installation succeeded using `OPENSSL_ia32cap=~0x200000200000000` for that process, retaining certificate verification. No global setting or lockfile change was needed.
