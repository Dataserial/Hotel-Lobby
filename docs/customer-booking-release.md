# Customer room booking release

The `/discover` page now lets a customer select dates, a room type and a room number, then confirm a pay-at-hotel booking while signed in. Deploy the backend before the frontend because the page calls `/api/public/rooms/grid` and `/api/customer/bookings`.

Before deployment, back up the intended Atlas database and run `npx prisma db push` against a separate staging database with representative existing guests, bookings and payments. Confirm that Prisma adds the optional `customerId` fields and the `customerBookingRequests` collection without deleting records. Do not run the demo seed against Atlas. Run the new `customer-booking-flow` and existing `task12-http` suites against disposable local databases. Check backend CI and `/ready`.

After releasing the backend, smoke-test a signed-in customer booking in staging: the room is visible in the grid, two claimed nights exist, a pending payment exists, the customer sees it under “การจองของฉัน,” another customer cannot read it, and staff sees the booking. Retry the same `Idempotency-Key` and confirm the booking count stays one. Only then deploy the frontend and check `/discover` on desktop and mobile.

The frontend stores dates, room type ID and room ID in session storage while the customer signs in. It does not store the document number there. Existing staff bookings remain readable because their customer fields are optional. A legacy guest document number without a confirmed customer owner is deliberately held for staff verification.
