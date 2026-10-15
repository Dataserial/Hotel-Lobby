// กันห้องทีละคืนด้วยคู่ห้องและวันที่ที่ห้ามซ้ำ
const { BookingError } = require('./booking-validation');

// ละเว้นสิทธิ์ค้างจากรายการที่เช็คเอาต์แล้ว ส่วนสิทธิ์อื่นยังกันห้องอยู่
const heldClaims = { NOT: { booking: { is: { status: 'checked_out' } } } };

// สร้างสิทธิ์กันห้องทีละคืนและปฏิเสธคืนที่ถูกจองแล้ว
async function createClaims(tx, bookingId, roomId, nights) {
  // คืนสิทธิ์ค้างของรายการที่ออกแล้วในธุรกรรมเดียวกับการจองใหม่
  await tx.roomNightClaim.deleteMany({ where: {
    roomId, night: { in: nights }, booking: { is: { status: 'checked_out' } },
  } });
  try {
    await tx.roomNightClaim.createMany({ data: nights.map(night => ({ bookingId, roomId, night })) });
  } catch (error) {
    if (error.code === 'P2002') {
      throw new BookingError(409, 'ROOM_UNAVAILABLE', 'The room was booked for one of these nights.');
    }
    throw error;
  }
}

module.exports = { heldClaims, createClaims };
