# Task 4: payment ledger and stay operations

Contract: integer baht, Prisma Int maximum 2147483647. Payment remains one summary per booking. Immutable receipt/refund records are the evidence for every monetary change; no PATCH of cumulative amounts exists. External money movement is performed by staff, never by this API. Do not store card details.

| Operation | Booking state | Other guards |
|---|---|---|
| Receive | confirmed, checked_in | positive amount <= remaining |
| Refund | confirmed | positive amount <= net and unrefunded source receipt; reason required |
| Edit total | confirmed | net must be zero |
| Cancel | confirmed | net must be zero |
| Check-in | confirmed | Bangkok checkInDate <= today < checkOutDate; active room/type, available room |
| Check-out | checked_in | occupied room belongs to this stay; paid and net = total |

paidAmount=sum(receipts), refundedAmount=sum(refunds), net=paid-refunded, remaining=amount-net. Require 0 <= net <= amount. Cumulative receipts can exceed amount after refunds and new receipts. Status is refunded only for cancelled bookings with positive receipts fully refunded; otherwise paid when net=amount (including zero price), pending otherwise. method/paidAt describe the latest recorded receipt, refundedAt the latest recorded refund (occurredAt timestamps). Ledger records retain the actual recorder. Cancellation without receipts is not refunded. Checkout retains original room-night claims, even for early departure.

All endpoints below require an active admin/receptionist session. Actor comes exclusively from the session. Booking responses retain the Task 3 allowlist.

| Endpoint under /api/bookings/:id | Input / output |
|---|---|
| GET /payment | summary, net, remaining, ledgerReady |
| GET /payment/transactions | page/limit; items ordered createdAt,id descending |
| POST /payment/receipts | amount, method, reference, occurredAt; returns transaction |
| POST /payment/refunds | receiptId, amount, method, reference, occurredAt, reason; returns transaction |
| POST /check-in | empty body; returns booking |
| POST /check-out | empty body; returns booking |

Money POSTs require Idempotency-Key (1..128 printable non-space ASCII characters). Reference (1..128 characters) is a real cash voucher or external transaction reference, trimmed and case-sensitive; reason is 1..500 characters. occurredAt is an ISO UTC timestamp, not in the future. Receipt/refund amount must be positive integer baht. Methods: cash, bank_transfer, card. Each refund references exactly one receipt; split refunds across receipts into separate requests.

Idempotency keys are globally unique: same key and normalized booking/kind/payload returns the original transaction (200), even after a later transition; different payload returns 409 IDEMPOTENCY_CONFLICT. First creation returns 201. Unique (kind,method,reference) prevents recording the same evidence twice across bookings; a new key with duplicate evidence returns 409 DUPLICATE_REFERENCE. Authentication applies to replay. Check-in/out repeated calls return 409 INVALID_TRANSITION. Errors use the existing error/code/message/requestId envelope: validation 400, auth 401/403, missing 404, business conflict 409.

Example: receive 1000 of 2400 -> pending/net 1000; refund 400 against that receipt -> pending/net 600; cancel fails PAYMENT_REFUND_REQUIRED; refund remaining 600 -> pending/net 0; cancel -> refunded. Repricing is allowed only at net zero and never erases this history.

Every mutation reads guards and writes in one MongoDB transaction, with a shared Booking version write to serialize financial and stay operations. Retry the complete transaction only for P2034, at most three attempts. Never retry external money movement. Ledger and summary inconsistency blocks operations. Legacy summaries are not evidence: reconcile from verified receipts/refunds before marking ready; do not invent opening transactions.

## Existing database rollout

Stop writes, identify target, back up and verify restore on a copy, audit references/indexes/ledger, apply additive schema on the copy, reconcile verified evidence, and verify invariants before opening writes. The audit command is read-only by default. Reconciliation requires an explicit target database and evidence file and is repeatable. Missing evidence leaves the booking blocked. Do not roll back to a writer that changes summaries without ledger records; keep writes stopped and restore the validated backup if necessary. Production changes and deployment are separate operator work.
