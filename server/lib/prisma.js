// สร้างตัวเชื่อมต่อฐานข้อมูลสำหรับ Backend
require('dotenv').config();

const { PrismaClient } = require('@prisma/client');

// ใช้ DATABASE_URL ตาม schema และใช้ client นี้ร่วมกันใน Backend
const prisma = new PrismaClient();

module.exports = prisma;
