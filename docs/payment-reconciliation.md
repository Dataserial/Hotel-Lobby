# Payment ledger reconciliation

This tool records verified historical evidence. It does not transfer money, infer individual transactions from totals, create opening balances, delete evidence, or change existing monetary totals. Run it during a write maintenance window on a tested database copy first. Existing summaries default to ledgerReady=false, including old MongoDB documents where the field is missing. Booking version defaults to zero and is materialized by the first guarded write.

## Operator procedure

1. Stop all writers, confirm the exact database/replica set, back up data/indexes and test restoration on a copy. Retain the old application release and backup, but do not reopen the old summary-only writer after recording ledger transactions.
2. Audit existing booking/room/claims/references using the Task 3 runbook. Resolve collisions, missing references and malformed monetary values. Inventory current indexes and duplicates before applying additive Task 4 schema to the copy. Prisma MongoDB uses `db push`, not SQL migrations. Do not accept destructive prompts or reset collections.
3. Generate the Prisma client locally, then apply schema/index additions to the copy. Required unique indexes are `payments.bookingId`, `paymentTransactions.idempotencyKey` and `(kind,method,reference)`, in addition to the existing room-night index. Changing schema/indexes does not backfill old ledger evidence.
4. Run the read-only audit with DATABASE_URL set to that copy. Missing ledger unique indexes stop the command. Issues produce exit code 1; a clean report produces 0. Reports include IDs/codes/counts, not guest documents or connection credentials.

   ```powershell
   npm run db:payments
   # Equivalent: npm run db:payments -- audit
   ```

5. For each booking, prepare a JSON evidence file after verifying actual receipt/refund vouchers. It contains the complete ledger, including existing rows. `verified: true` is the operator's attestation, not automatic proof. Preserve immutable IDs/keys/payload of existing rows. New IDs must be unique ObjectIds; historical recordedById must reference an existing user (inactive historical staff may be referenced). Never substitute a guessed actor or fabricate evidence to clear a guard.

   ```json
   {
     "verified": true,
     "bookingId": "500000000000000000000002",
     "transactions": [
       {
         "id": "710000000000000000000001",
         "recordedById": "100000000000000000000002",
         "kind": "receive",
         "amount": 1000,
         "method": "cash",
         "reference": "REPLACE-WITH-VERIFIED-VOUCHER",
         "idempotencyKey": "REPLACE-WITH-UNIQUE-IMPORT-KEY",
         "occurredAt": "2026-10-01T03:00:00Z"
       }
     ]
   }
   ```

   This is a shape example, not evidence to import. Refund entries additionally require `receiptId` and `reason`. Order newly imported entries by their verified recording order, with receipts before their refunds. createdAt reflects import time and preserves file ordering; occurredAt reflects the real event. For a genuinely zero/unreceived balance, verified `transactions: []` is sufficient after checking consistency. A zero net balance with prior receipts/refunds still needs the full evidence.

6. Apply one booking atomically, explicitly repeating the database name from DATABASE_URL and providing the active staff member performing reconciliation:

   ```powershell
   npm run db:payments -- reconcile <database-name> <verified-evidence.json> <operator-user-id>
   ```

   Target mismatch fails before connection/write. Required unique indexes are checked before apply. Evidence totals must exactly equal existing amount/paidAmount/refundedAmount. Refunds must refer to this payment's receipts and cannot exceed them. Missing or altered evidence rolls back the entire booking import. Derived status/method/timestamps are recalculated from evidence; monetary totals are never repaired by changing numbers. A ready ledger cannot be extended through this maintenance tool. Repeating the same complete file is a no-op. A nonzero command exit can also mean another booking still has audit issues after this booking committed; inspect the report and rerun audit before retrying.

7. Run audit again plus the Task 3 claims/index audit, compare totals and sampled vouchers, and verify occupied rooms each have exactly one checked-in booking, checked-out bookings are fully paid, and no ledger/payment/reference orphan remains. Rehearse API receive/refund/cancel/check-in/out on the copy. Unresolved evidence keeps the affected booking blocked; do not mark it ready manually.
8. Repeat the reviewed procedure against the explicitly approved live target during maintenance, then reopen writes only after verification. This repository change itself does not perform live schema pushes or reconciliation.

## Recovery

Per-booking imports are transactional. A failure leaves that booking unchanged and the same file may be retried after resolving the cause. Keep writes stopped after a rollout failure; restore the tested backup and matching application release together if needed. Once new ledger records exist, preserve them and reconcile forward; do not deploy a version that updates summaries without ledger evidence. Retain verified evidence files outside Git according to the hotel's access controls.

The isolated tests use explicitly synthetic sample vouchers. They prove rollback, repeatability and guards; they are never migration evidence for existing hotel data. The demo seed creates only users/types/rooms, so it creates no historical financial records to migrate.
