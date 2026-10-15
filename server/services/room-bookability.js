// ตรวจว่าห้องและประเภทห้องพร้อมรับการจองหรือไม่
const { hotelToday } = require('./stay-service');

// จองล่วงหน้าจากวันพักและสิทธิ์กันห้อง แต่ยังตรวจสภาพห้องจริงตอนเช็คอิน
// ตรวจห้องพร้อมจองรวมกรณีมีผู้พักอยู่ในปัจจุบัน
async function roomBookable(prisma, room, checkInDate, now = new Date(), knownOccupants) {
  if (!room.active || !room.roomType?.active) return false;
  if (room.status === 'available') return true;
  if (room.status !== 'occupied' || process.env.ALLOW_FUTURE_OCCUPIED_BOOKINGS === 'false') return false;
  const occupants = knownOccupants ?? await prisma.booking.findMany({ where: { roomId: room.id, status: 'checked_in' }, select: { checkOutDate: true } });
  const today = hotelToday(now);
  // พักที่ข้อมูลขัดกันหรือถึงวันออกแล้วต้องให้พนักงานจัดการก่อน
  return occupants.length === 1 && occupants[0].checkOutDate > today && checkInDate >= occupants[0].checkOutDate;
}
module.exports = { roomBookable };
