// ตรวจผู้ทำรายการและควบคุมธุรกรรมที่แก้การจอง
const { fail, objectId } = require('../lib/http');

// ตรวจว่าผู้ทำรายการเป็นพนักงานที่ยังใช้งานได้
async function assertActor(tx, actorId) {
  objectId(actorId, 'actorId');
  const actor = await tx.user.findUnique({ where: { id: actorId }, select: { active: true, role: true } });
  if (!actor?.active || !['admin', 'receptionist'].includes(actor.role)) fail(403, 'INVALID_ACTOR', 'Active staff member required');
}

// ทำธุรกรรมและลองใหม่เมื่อมีการเขียนชนกัน
async function operationTransaction(prisma, operation) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try { return await prisma.$transaction(operation); }
    catch (error) {
      if (error.code !== 'P2034') throw error;
      if (attempt === 3) fail(409, 'WRITE_CONFLICT', 'Concurrent update conflict; retry the request');
      await new Promise((resolve) => setTimeout(resolve, attempt * 10));
    }
  }
}

// เพิ่มรุ่นการจองเพื่อกันงานเงิน ยกเลิก ปรับราคา และเข้าพักเขียนชนกัน รวมข้อมูลเก่าที่ยังไม่มี version
// เพิ่มรุ่นข้อมูลการจองเพื่อให้ธุรกรรมที่ชนกันตรวจพบกัน
async function touchBooking(tx, booking, actorId) {
  return tx.booking.update({ where: { id: booking.id }, data: { version: booking.version + 1, updatedById: actorId } });
}

module.exports = { assertActor, operationTransaction, touchBooking };
