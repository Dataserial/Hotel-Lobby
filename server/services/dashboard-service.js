// สรุปห้องพักและยอดรับคืนเงินสำหรับรายงาน
const { hotelToday, hotelDayRange } = require('./stay-service');
const { findAvailableRooms } = require('./availability-service');

// สรุปสถานะห้องและการเข้าออกของวันนี้
async function dashboard(prisma, now = new Date()) {
  const date = hotelToday(now);
  const today = hotelDayRange(date);
  const nextDate = new Date(`${date}T00:00:00Z`);
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  const [rooms, occupied, arrivals, departures] = await Promise.all([
    findAvailableRooms(prisma, { checkInDate: date, checkOutDate: nextDate.toISOString().slice(0, 10), guestCount: 1, now }),
    prisma.room.count({ where: { active: true, status: 'occupied' } }),
    prisma.booking.count({ where: { actualCheckInAt: today, status: { not: 'cancelled' } } }),
    prisma.booking.count({ where: { actualCheckOutAt: today, status: 'checked_out' } }),
  ]);
  return { date, timezone: 'Asia/Bangkok', availableRooms: rooms.length, occupiedRooms: occupied,
    arrivalsToday: arrivals, departuresToday: departures };
}

// รวมยอดรับ คืน และสุทธิจากรายการเงิน
async function report(prisma) {
  // รวมเงินจากบัญชีรายการเท่านั้น ไม่ผสมยอดเดิมที่ยังตรวจไม่ครบ
  const [received, refunded, unreconciledPayments] = await Promise.all([
    prisma.paymentTransaction.aggregate({ where: { kind: 'receive' }, _sum: { amount: true } }),
    prisma.paymentTransaction.aggregate({ where: { kind: 'refund' }, _sum: { amount: true } }),
    prisma.payment.count({ where: { ledgerReady: false } }),
  ]);
  const receivedBaht = received._sum.amount || 0;
  const refundedBaht = refunded._sum.amount || 0;
  return { scope: 'all-time-ledger', currency: 'THB', unit: 'baht', receivedBaht, refundedBaht,
    netBaht: receivedBaht - refundedBaht, unreconciledPayments };
}
module.exports = { dashboard, report };
