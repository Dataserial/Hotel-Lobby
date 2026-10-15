// API รับคืนเงินและเช็คอินเช็คเอาต์
const express = require('express');
const { role } = require('../lib/auth');
const { asyncRoute, objectId, page, list, fail, str } = require('../lib/http');
const { receivePayment, refundPayment } = require('../services/payment-service');
const { assertLedger } = require('../services/payment-ledger');
const { checkIn, checkOut } = require('../services/stay-service');
const { present } = require('./api-bookings');

const transactionSelect = Object.fromEntries([
  'id', 'paymentId', 'kind', 'amount', 'method', 'reference', 'occurredAt', 'createdAt',
  'recordedById', 'idempotencyKey', 'receiptId', 'reason',
].map((field) => [field, true]));
// เลือกฟิลด์ประวัติเงินที่ส่งกลับได้
const presentTransaction = (row) => Object.fromEntries(Object.keys(transactionSelect).map((key) => [key, row[key]]));
// ปฏิเสธพารามิเตอร์ที่เส้นทางนี้ไม่รองรับ
function noQuery(req) {
  if (Object.keys(req.query).length) fail(400, 'VALIDATION_ERROR', 'Unexpected query fields');
}
// ค้นหาการจองและยอดชำระที่เกี่ยวข้อง
async function bookingPayment(tx, id) {
  const booking = await tx.booking.findUnique({ where: { id: objectId(id) }, include: { payment: true } });
  if (!booking) fail(404, 'BOOKING_NOT_FOUND', 'Booking does not exist');
  if (!booking.payment) fail(404, 'PAYMENT_NOT_FOUND', 'Payment does not exist');
  return booking;
}

module.exports = (prisma) => {
  const router = express.Router();
  // กำหนดเงื่อนไขร่วมของเส้นทาง
  router.use(role('admin', 'receptionist'));
  // อ่านข้อมูล /:id/payment
  router.get('/:id/payment', asyncRoute(async (req, res) => {
    noQuery(req);
    res.json(await prisma.$transaction(async (tx) => {
      const booking = await bookingPayment(tx, req.params.id);
      if (booking.payment.ledgerReady) await assertLedger(tx, booking);
      const p = booking.payment;
      return {
        id: p.id, bookingId: p.bookingId, amount: p.amount, paidAmount: p.paidAmount,
        refundedAmount: p.refundedAmount, net: p.paidAmount - p.refundedAmount,
        remaining: p.amount - p.paidAmount + p.refundedAmount,
        status: p.status, method: p.method, paidAt: p.paidAt, refundedAt: p.refundedAt,
        ledgerReady: p.ledgerReady, createdAt: p.createdAt, updatedAt: p.updatedAt, recordedById: p.recordedById,
      };
    }));
  }));
  // อ่านข้อมูล /:id/payment/transactions
  router.get('/:id/payment/transactions', asyncRoute(async (req, res) => {
    const pagination = page(req.query, ['kind', 'q']);
    const filter = {};
    if (req.query.kind !== undefined) {
      if (!['receive', 'refund'].includes(req.query.kind)) fail(400, 'VALIDATION_ERROR', 'Invalid transaction kind');
      filter.kind = req.query.kind;
    }
    if (req.query.q) filter.reference = { contains: str(req.query.q, 'q', 128), mode: 'insensitive' };
    res.json(await prisma.$transaction(async (tx) => {
      const booking = await bookingPayment(tx, req.params.id);
      return list(tx.paymentTransaction, { ...filter, paymentId: booking.payment.id }, pagination,
        [{ createdAt: 'desc' }, { id: 'desc' }], transactionSelect);
    }));
  }));
  for (const [path, service] of [['receipts', receivePayment], ['refunds', refundPayment]]) {
    // รับคำขอสร้างหรือทำรายการ
    router.post(`/:id/payment/${path}`, asyncRoute(async (req, res) => {
      noQuery(req);
      const result = await service(prisma, req.params.id, req.body, req.get('Idempotency-Key'), req.actor.id);
      res.status(result.replayed ? 200 : 201).json(presentTransaction(result.transaction));
    }));
  }
  for (const [path, service] of [['check-in', checkIn], ['check-out', checkOut]]) {
    // รับคำขอสร้างหรือทำรายการ
    router.post(`/:id/${path}`, asyncRoute(async (req, res) => {
      noQuery(req);
      if (req.body != null && (typeof req.body !== 'object' || Array.isArray(req.body) || Object.keys(req.body).length)) {
        fail(400, 'VALIDATION_ERROR', 'Stay operations do not accept body fields');
      }
      res.json(present(await service(prisma, req.params.id, req.actor.id)));
    }));
  }
  return router;
};
